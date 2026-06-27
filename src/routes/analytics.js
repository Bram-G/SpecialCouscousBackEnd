const express = require("express");
const router = express.Router();
const { Op, fn, col, literal } = require("sequelize");

const authMiddleware = require("../middleware/auth");

const {
  MovieMonday,
  MovieSelection,
  MovieCast,
  MovieCrew,
  MovieMondayEventDetails,
  User,
  // May be undefined if not exported — handled defensively below.
  MovieMondayRating,
} = require("../models");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Resolve the set of group ids this request is allowed to read. Honors an
// optional ?groupId= filter (must be one the user belongs to) so the same
// endpoints work for single- or multi-group users later.
function resolveGroupIds(req) {
  const memberGroupIds = (req.userGroups || []).map((g) => g.id);
  const requested = req.query.groupId ? parseInt(req.query.groupId, 10) : null;

  if (requested && memberGroupIds.includes(requested)) {
    return [requested];
  }
  return memberGroupIds;
}

function clampInt(value, fallback, min, max) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

function normalizeDir(value) {
  return String(value).toLowerCase() === "asc" ? "ASC" : "DESC";
}

// Coerce a stored event-detail value (already array thanks to model getters,
// but stay defensive against legacy string rows) into a clean string array.
function toStringArray(value) {
  let arr = [];
  if (Array.isArray(value)) {
    arr = value;
  } else if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      arr = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      arr = value.includes(",") ? value.split(",") : [value];
    }
  }
  return arr
    .filter((v) => v && typeof v === "string")
    .map((v) => v.trim())
    .filter((v) => v && v !== "[]" && v !== "[ ]");
}

// Tiny in-memory TTL cache for the overview payload. Keyed by the sorted group
// id set. Cleared automatically by TTL; safe to leave running on a single dyno.
const OVERVIEW_TTL_MS = 60 * 1000;
const overviewCache = new Map();

function cacheKey(groupIds) {
  return [...groupIds].sort((a, b) => a - b).join(",");
}

// ---------------------------------------------------------------------------
// GET /overview  — curated aggregation for the graphs page
// ---------------------------------------------------------------------------
router.get("/overview", authMiddleware, async (req, res) => {
  try {
    const groupIds = resolveGroupIds(req);
    const limit = clampInt(req.query.limit, 15, 1, 50); // top-N per chart

    if (groupIds.length === 0) {
      return res.json(emptyOverview());
    }

    const key = cacheKey(groupIds);
    const cached = overviewCache.get(key);
    if (cached && Date.now() - cached.at < OVERVIEW_TTL_MS) {
      return res.json(trimOverview(cached.data, limit));
    }

    // One scoped read of everything the overview needs.
    const movieMondays = await MovieMonday.findAll({
      where: { GroupId: groupIds },
      attributes: ["id", "date", "pickerUserId"],
      include: [
        {
          model: MovieSelection,
          as: "movieSelections",
          attributes: ["id", "tmdbMovieId", "title", "isWinner"],
          include: [
            { model: MovieCast, as: "cast", attributes: ["actorId", "name"] },
            {
              model: MovieCrew,
              as: "crew",
              attributes: ["personId", "name", "job"],
            },
          ],
        },
        { model: User, as: "picker", attributes: ["id", "username"] },
        {
          model: MovieMondayEventDetails,
          as: "eventDetails",
          attributes: ["meals", "cocktails", "desserts"],
        },
      ],
    });

    const genres = {}; // name -> { count, wins }
    const actors = {}; // id   -> { id, name, count, losses }
    const directors = {}; // id -> { id, name, count }
    const rejectedMovies = {}; // title -> { id, name, losses }
    const pickers = {}; // username -> { id, name, winningPicks, totalPicks }
    const meals = {};
    const cocktails = {};
    const desserts = {};

    let totalMovies = 0;
    let totalWinners = 0;
    const totalMondays = movieMondays.length;

    const bump = (bag, name, key2 = "count") => {
      if (!bag[name]) bag[name] = { count: 0 };
      bag[name][key2] = (bag[name][key2] || 0) + 1;
    };

    for (const mm of movieMondays) {
      const plain = mm.get({ plain: true });
      let mondayHasWinner = false;

      for (const movie of plain.movieSelections || []) {
        totalMovies++;
        if (movie.isWinner) {
          totalWinners++;
          mondayHasWinner = true;
        }

        // Genres
        const movieGenres = Array.isArray(movie.genres) ? movie.genres : [];
        for (const g of movieGenres) {
          if (!genres[g]) genres[g] = { count: 0, wins: 0 };
          genres[g].count++;
          if (movie.isWinner) genres[g].wins++;
        }

        // Actors (frequency + rejected = appearances on losers)
        for (const a of movie.cast || []) {
          if (!actors[a.actorId]) {
            actors[a.actorId] = {
              id: a.actorId,
              name: a.name,
              count: 0,
              losses: 0,
            };
          }
          actors[a.actorId].count++;
          if (!movie.isWinner) actors[a.actorId].losses++;
        }

        // Directors (frequency)
        for (const c of movie.crew || []) {
          if (c.job !== "Director") continue;
          if (!directors[c.personId]) {
            directors[c.personId] = { id: c.personId, name: c.name, count: 0 };
          }
          directors[c.personId].count++;
        }

        // Rejected movies (non-winners, counted by title)
        if (!movie.isWinner) {
          if (!rejectedMovies[movie.title]) {
            rejectedMovies[movie.title] = {
              id: movie.tmdbMovieId,
              name: movie.title,
              losses: 0,
            };
          }
          rejectedMovies[movie.title].losses++;
        }
      }

      // Pickers — "Movies chosen by": winning weeks per picker
      if (plain.picker) {
        const u = plain.picker;
        if (!pickers[u.username]) {
          pickers[u.username] = {
            id: u.id,
            name: u.username,
            winningPicks: 0,
            totalPicks: 0,
          };
        }
        pickers[u.username].totalPicks++;
        if (mondayHasWinner) pickers[u.username].winningPicks++;
      }

      // Food & drink
      if (plain.eventDetails) {
        toStringArray(plain.eventDetails.meals).forEach((m) => bump(meals, m));
        toStringArray(plain.eventDetails.cocktails).forEach((c) =>
          bump(cocktails, c),
        );
        toStringArray(plain.eventDetails.desserts).forEach((d) =>
          bump(desserts, d),
        );
      }
    }

    const data = {
      totals: {
        movieMondays: totalMondays,
        movies: totalMovies,
        winners: totalWinners,
        uniqueGenres: Object.keys(genres).length,
        uniqueActors: Object.keys(actors).length,
        uniqueDirectors: Object.keys(directors).length,
      },
      genres: Object.entries(genres)
        .map(([name, d]) => ({ name, count: d.count, wins: d.wins }))
        .sort((a, b) => b.count - a.count),
      topActors: Object.values(actors).sort((a, b) => b.count - a.count),
      rejectedActors: Object.values(actors)
        .filter((a) => a.losses > 0)
        .map((a) => ({ id: a.id, name: a.name, losses: a.losses }))
        .sort((a, b) => b.losses - a.losses),
      topDirectors: Object.values(directors).sort((a, b) => b.count - a.count),
      rejectedMovies: Object.values(rejectedMovies).sort(
        (a, b) => b.losses - a.losses,
      ),
      pickers: Object.values(pickers).sort(
        (a, b) => b.winningPicks - a.winningPicks,
      ),
      meals: Object.entries(meals)
        .map(([name, d]) => ({ name, count: d.count }))
        .sort((a, b) => b.count - a.count),
      cocktails: Object.entries(cocktails)
        .map(([name, d]) => ({ name, count: d.count }))
        .sort((a, b) => b.count - a.count),
      desserts: Object.entries(desserts)
        .map(([name, d]) => ({ name, count: d.count }))
        .sort((a, b) => b.count - a.count),
    };

    overviewCache.set(key, { at: Date.now(), data });
    return res.json(trimOverview(data, limit));
  } catch (error) {
    console.error("Error generating analytics overview:", error);
    return res.status(500).json({ error: "Failed to generate analytics" });
  }
});

function emptyOverview() {
  return {
    totals: {
      movieMondays: 0,
      movies: 0,
      winners: 0,
      uniqueGenres: 0,
      uniqueActors: 0,
      uniqueDirectors: 0,
    },
    genres: [],
    topActors: [],
    rejectedActors: [],
    topDirectors: [],
    rejectedMovies: [],
    pickers: [],
    meals: [],
    cocktails: [],
    desserts: [],
  };
}

// Cache stores the full sorted lists; trim to top-N per request.
function trimOverview(data, limit) {
  return {
    totals: data.totals,
    genres: data.genres.slice(0, limit),
    topActors: data.topActors.slice(0, limit),
    rejectedActors: data.rejectedActors.slice(0, limit),
    topDirectors: data.topDirectors.slice(0, limit),
    rejectedMovies: data.rejectedMovies.slice(0, limit),
    pickers: data.pickers.slice(0, limit),
    meals: data.meals.slice(0, limit),
    cocktails: data.cocktails.slice(0, limit),
    desserts: data.desserts.slice(0, limit),
  };
}

// ---------------------------------------------------------------------------
// GET /table/:type  — paginated, sortable, filterable table data
// ---------------------------------------------------------------------------
router.get("/table/:type", authMiddleware, async (req, res) => {
  try {
    const groupIds = resolveGroupIds(req);
    const page = clampInt(req.query.page, 1, 1, 1e6);
    const pageSize = clampInt(req.query.pageSize, 25, 1, 100);
    const offset = (page - 1) * pageSize;
    const search = (req.query.search || "").trim();
    const sortDir = normalizeDir(req.query.sortDir);

    // Normalize the various spellings/labels the UI might send.
    const rawType = String(req.params.type || "").toLowerCase();
    const type =
      rawType === "drinks"
        ? "cocktails"
        : rawType === "deserts"
          ? "desserts"
          : rawType;

    if (groupIds.length === 0) {
      return res.json(emptyTable(type, page, pageSize));
    }

    switch (type) {
      case "movies":
        return res.json(
          await moviesTable({
            groupIds,
            page,
            pageSize,
            offset,
            search,
            sortBy: req.query.sortBy,
            sortDir,
            filters: req.query,
          }),
        );
      case "actors":
        return res.json(
          await peopleTable({
            model: MovieCast,
            idCol: "actorId",
            page,
            pageSize,
            offset,
            search,
            sortBy: req.query.sortBy,
            sortDir,
            groupIds,
          }),
        );
      case "directors":
        return res.json(
          await peopleTable({
            model: MovieCrew,
            idCol: "personId",
            jobFilter: "Director",
            page,
            pageSize,
            offset,
            search,
            sortBy: req.query.sortBy,
            sortDir,
            groupIds,
          }),
        );
      case "meals":
      case "cocktails":
      case "desserts":
        return res.json(
          await foodTable({
            field: type,
            groupIds,
            page,
            pageSize,
            offset,
            search,
            sortBy: req.query.sortBy,
            sortDir,
          }),
        );
      default:
        return res.status(400).json({ error: `Unknown table type: ${type}` });
    }
  } catch (error) {
    console.error("Error generating analytics table:", error);
    return res.status(500).json({ error: "Failed to generate table" });
  }
});

function emptyTable(type, page, pageSize) {
  return { type, page, pageSize, total: 0, totalPages: 0, rows: [] };
}

// ---- Movies table ---------------------------------------------------------
// One row per MovieSelection. Paginated in SQL with only belongsTo joins
// (no hasMany in the limited query, which would break LIMIT + counts), then
// the hasMany detail (directors, cast, food, rating) is hydrated in a handful
// of bounded follow-up queries and merged in JS.
async function moviesTable({
  groupIds,
  page,
  pageSize,
  offset,
  search,
  sortBy,
  sortDir,
  filters,
}) {
  // Whitelisted server-side sorts.
  const orderMap = {
    date: [{ model: MovieMonday }, "date", sortDir],
    title: ["title", sortDir],
    won: ["isWinner", sortDir],
    isWinner: ["isWinner", sortDir],
    year: ["releaseYear", sortDir],
    releaseYear: ["releaseYear", sortDir],
    rating: ["voteAverage", sortDir],
    voteAverage: ["voteAverage", sortDir],
    createdAt: ["createdAt", sortDir],
  };
  const order = [orderMap[sortBy] || [{ model: MovieMonday }, "date", sortDir]];

  // Selection-level filters
  const selectionWhere = {};
  if (search) selectionWhere.title = { [Op.iLike]: `%${search}%` };
  if (filters.won === "true") selectionWhere.isWinner = true;
  if (filters.won === "false") selectionWhere.isWinner = false;
  if (filters.year) selectionWhere.releaseYear = parseInt(filters.year, 10);
  if (filters.genre) {
    // genres stored as JSON.stringify'd array of strings in a TEXT column.
    selectionWhere.genres = { [Op.like]: `%"${filters.genre}"%` };
  }

  // Monday-level filters (scoping + optional picker)
  const mondayWhere = { GroupId: groupIds };
  if (filters.pickerId) {
    mondayWhere.pickerUserId = parseInt(filters.pickerId, 10);
  }

  const { count, rows } = await MovieSelection.findAndCountAll({
    where: selectionWhere,
    attributes: [
      "id",
      "tmdbMovieId",
      "title",
      "posterPath",
      "isWinner",
      "genres",
      "releaseYear",
      "voteAverage",
      "createdAt",
    ],
    include: [
      {
        model: MovieMonday,
        required: true,
        where: mondayWhere,
        attributes: ["id", "date", "weekTheme", "slug"],
        include: [
          {
            model: User,
            as: "picker",
            required: false,
            attributes: ["id", "username"],
          },
        ],
      },
    ],
    order,
    limit: pageSize,
    offset,
    subQuery: false, // belongsTo joins are 1:1, so LIMIT + count stay correct
  });

  const plainRows = rows.map((r) => r.get({ plain: true }));
  const selectionIds = plainRows.map((r) => r.id);
  const mondayIds = [...new Set(plainRows.map((r) => r.MovieMonday?.id))].filter(
    Boolean,
  );

  // Hydrate details in bounded batches (constant number of queries).
  const [crewRows, castRows, eventRows, ratingMap] = await Promise.all([
    selectionIds.length
      ? MovieCrew.findAll({
          where: { movieSelectionId: selectionIds, job: "Director" },
          attributes: ["movieSelectionId", "personId", "name"],
        })
      : [],
    selectionIds.length
      ? MovieCast.findAll({
          where: { movieSelectionId: selectionIds },
          attributes: ["movieSelectionId", "actorId", "name", "order"],
        })
      : [],
    mondayIds.length
      ? MovieMondayEventDetails.findAll({
          where: { movieMondayId: mondayIds },
          attributes: ["movieMondayId", "meals", "cocktails", "desserts"],
        })
      : [],
    fetchRatingsByMonday(mondayIds),
  ]);

  const directorsBySelection = groupBy(crewRows, (c) => c.movieSelectionId);
  const castBySelection = groupBy(castRows, (c) => c.movieSelectionId);
  const eventByMonday = new Map(
    eventRows.map((e) => [e.movieMondayId, e]),
  );

  const out = plainRows.map((r) => {
    const mm = r.MovieMonday || {};
    const directors = (directorsBySelection.get(r.id) || []).map((d) => ({
      id: d.personId,
      name: d.name,
    }));
    const cast = (castBySelection.get(r.id) || []).sort(
      (a, b) => (a.order ?? 999) - (b.order ?? 999),
    );
    const ev = eventByMonday.get(mm.id);

    return {
      id: r.id,
      tmdbMovieId: r.tmdbMovieId,
      title: r.title,
      posterPath: r.posterPath,
      isWinner: r.isWinner,
      genres: Array.isArray(r.genres) ? r.genres : [],
      releaseYear: r.releaseYear,
      voteAverage: r.voteAverage,
      movieMondayId: mm.id || null,
      date: mm.date || null,
      weekTheme: mm.weekTheme || null,
      slug: mm.slug || null,
      picker: mm.picker
        ? { id: mm.picker.id, username: mm.picker.username }
        : null,
      directors,
      leadActors: cast.slice(0, 3).map((c) => c.name),
      actorCount: cast.length,
      meals: ev ? toStringArray(ev.meals) : [],
      cocktails: ev ? toStringArray(ev.cocktails) : [],
      desserts: ev ? toStringArray(ev.desserts) : [],
      groupRating: ratingMap.get(mm.id) ?? null,
    };
  });

  return {
    type: "movies",
    page,
    pageSize,
    total: count,
    totalPages: Math.ceil(count / pageSize),
    rows: out,
  };
}

// Average group star rating per Monday. Defensive: if the model isn't exported
// or its columns differ, this resolves to an empty map rather than throwing.
async function fetchRatingsByMonday(mondayIds) {
  const map = new Map();
  if (!MovieMondayRating || !mondayIds.length) return map;
  try {
    const ratings = await MovieMondayRating.findAll({
      where: { movieMondayId: mondayIds },
      attributes: ["movieMondayId", "rating"],
    });
    const acc = new Map(); // id -> { sum, n }
    for (const r of ratings) {
      const cur = acc.get(r.movieMondayId) || { sum: 0, n: 0 };
      cur.sum += Number(r.rating) || 0;
      cur.n += 1;
      acc.set(r.movieMondayId, cur);
    }
    for (const [id, { sum, n }] of acc) {
      map.set(id, n ? Math.round((sum / n) * 10) / 10 : null);
    }
  } catch (e) {
    // Shape mismatch — leave ratings null, don't fail the table.
    console.warn("Rating hydration skipped:", e.message);
  }
  return map;
}

// ---- Actors / Directors table --------------------------------------------
// One row per person, aggregated in SQL. Scales without loading every cast/crew
// row into memory.
async function peopleTable({
  model,
  idCol,
  jobFilter,
  page,
  pageSize,
  offset,
  search,
  sortBy,
  sortDir,
  groupIds,
}) {
  const personWhere = {};
  if (jobFilter) personWhere.job = jobFilter;
  if (search) personWhere.name = { [Op.iLike]: `%${search}%` };

  const modelName = model.name; // "MovieCast" | "MovieCrew"
  const winnerExpr = literal(
    `CASE WHEN "MovieSelection"."isWinner" THEN 1 ELSE 0 END`,
  );

  const selectionInclude = {
    model: MovieSelection,
    attributes: [],
    required: true,
    include: [
      {
        model: MovieMonday,
        attributes: [],
        required: true,
        where: { GroupId: groupIds },
      },
    ],
  };

  // Whitelisted aggregate sorts (Postgres allows ORDER BY on output aliases).
  const sortExprMap = {
    appearances: "appearances",
    wins: "wins",
    losses: "losses",
    name: "name",
    winRate: `(CAST("wins" AS FLOAT) / NULLIF("appearances", 0))`,
  };
  const sortExpr = sortExprMap[sortBy] || "appearances";

  const baseRows = await model.findAll({
    attributes: [
      [col(`${modelName}.${idCol}`), "personId"],
      [fn("MAX", col(`${modelName}.name`)), "name"],
      [fn("COUNT", col(`${modelName}.id`)), "appearances"],
      [fn("SUM", winnerExpr), "wins"],
    ],
    where: personWhere,
    include: [selectionInclude],
    group: [`${modelName}.${idCol}`],
    order: [[literal(sortExpr), sortDir]],
    limit: pageSize,
    offset,
    subQuery: false,
    raw: true,
  });

  // Total distinct people matching the same filter (for pagination).
  const total = await model.count({
    where: personWhere,
    include: [selectionInclude],
    distinct: true,
    col: `${modelName}.${idCol}`,
  });

  const rows = baseRows.map((r) => {
    const appearances = Number(r.appearances) || 0;
    const wins = Number(r.wins) || 0;
    return {
      id: Number(r.personId),
      name: r.name,
      appearances,
      wins,
      losses: appearances - wins,
      winRate: appearances ? Math.round((wins / appearances) * 1000) / 10 : 0,
    };
  });

  return {
    type: jobFilter ? "directors" : "actors",
    page,
    pageSize,
    total: typeof total === "number" ? total : total?.length || rows.length,
    totalPages: Math.ceil(
      (typeof total === "number" ? total : rows.length) / pageSize,
    ),
    rows,
  };
}

// ---- Meals / Cocktails / Desserts table -----------------------------------
// Items live as JSON arrays in TEXT columns, so aggregate in JS. Bounded by the
// number of Mondays per group (small). Returns count + last-served date.
async function foodTable({
  field,
  groupIds,
  page,
  pageSize,
  offset,
  search,
  sortBy,
  sortDir,
}) {
  const eventRows = await MovieMondayEventDetails.findAll({
    attributes: ["movieMondayId", field],
    include: [
      {
        model: MovieMonday,
        attributes: ["date"],
        required: true,
        where: { GroupId: groupIds },
      },
    ],
  });

  const map = new Map(); // name -> { name, count, lastServed }
  for (const ev of eventRows) {
    const date = ev.MovieMonday?.date || null;
    for (const item of toStringArray(ev[field])) {
      const cur = map.get(item) || { name: item, count: 0, lastServed: null };
      cur.count++;
      if (!cur.lastServed || (date && date > cur.lastServed)) {
        cur.lastServed = date;
      }
      map.set(item, cur);
    }
  }

  let rows = [...map.values()];
  if (search) {
    const q = search.toLowerCase();
    rows = rows.filter((r) => r.name.toLowerCase().includes(q));
  }

  const dir = sortDir === "ASC" ? 1 : -1;
  const key =
    sortBy === "name" || sortBy === "lastServed" ? sortBy : "count";
  rows.sort((a, b) => {
    if (key === "name") return dir * a.name.localeCompare(b.name);
    if (key === "lastServed") {
      return dir * String(a.lastServed || "").localeCompare(b.lastServed || "");
    }
    return dir * (a.count - b.count);
  });

  const total = rows.length;
  const paged = rows.slice(offset, offset + pageSize);

  return {
    type: field,
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
    rows: paged,
  };
}

// ---------------------------------------------------------------------------
// Small utils
// ---------------------------------------------------------------------------
function groupBy(arr, keyFn) {
  const map = new Map();
  for (const item of arr) {
    const k = keyFn(item);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(item);
  }
  return map;
}

module.exports = router;