const express = require("express");
const router = express.Router();
const { Op, QueryTypes } = require("sequelize");

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
  GroupGuest,
  sequelize,
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

/// ---------------------------------------------------------------------------
// Group data loader (shared by /overview and /movies drill-downs)
// ---------------------------------------------------------------------------
// One scoped read of everything the charts need, normalized into a compact
// shape and cached per group set. Both the overview aggregation and the
// drill-down lists are derived from this, so the numbers on a bar and the
// posters in its modal always agree.
//
// Outcome rules (the single source of truth for every chart):
//   won     -> selection.isWinner === true
//   lost    -> not a winner AND its Monday has a winner (a decided night)
//   pending -> Monday has no winner yet; excluded from won/lost counts
const DATA_TTL_MS = 60 * 1000;
const dataCache = new Map(); // key -> { at, data }

function cacheKey(groupIds) {
  return [...groupIds].sort((a, b) => a - b).join(",");
}

function clearAnalyticsCache() {
  dataCache.clear();
}

const norm = (s) => String(s || "").trim().toLowerCase();

async function loadGroupData(groupIds) {
  const key = cacheKey(groupIds);
  const cached = dataCache.get(key);
  if (cached && Date.now() - cached.at < DATA_TTL_MS) return cached.data;

  const rows = await MovieMonday.findAll({
    where: { GroupId: groupIds },
    attributes: ["id", "date", "pickerUserId", "pickerGuestId"],
    include: [
      {
        model: MovieSelection,
        as: "movieSelections",
        attributes: [
          "id",
          "tmdbMovieId",
          "title",
          "posterPath",
          "releaseYear",
          "genres",
          "isWinner",
        ],
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
      { model: GroupGuest, as: "pickerGuest", attributes: ["id", "name"] },
      {
        model: MovieMondayEventDetails,
        as: "eventDetails",
        attributes: ["meals", "cocktails", "desserts"],
      },
    ],
  });

  const mondays = rows.map((mm) => {
    const plain = mm.get({ plain: true });
    const selections = plain.movieSelections || [];
    const decided = selections.some((s) => s.isWinner);

    const movies = selections.map((s) => {
      // De-dupe people within one movie (an actor can hold several roles).
      const actors = new Map();
      for (const a of s.cast || []) {
        if (a.actorId != null && !actors.has(a.actorId)) {
          actors.set(a.actorId, { id: a.actorId, name: a.name });
        }
      }
      const directors = new Map();
      for (const c of s.crew || []) {
        if (c.job === "Director" && !directors.has(c.personId)) {
          directors.set(c.personId, { id: c.personId, name: c.name });
        }
      }
      let genres = s.genres;
      if (typeof genres === "string") {
        try {
          genres = JSON.parse(genres);
        } catch {
          genres = [];
        }
      }
      return {
        tmdbMovieId: s.tmdbMovieId,
        title: s.title,
        posterPath: s.posterPath,
        releaseYear: s.releaseYear,
        genres: Array.isArray(genres) ? genres.filter(Boolean) : [],
        outcome: s.isWinner ? "won" : decided ? "lost" : "pending",
        actors: [...actors.values()],
        directors: [...directors.values()],
      };
    });

    return {
      id: plain.id,
      date: plain.date,
      decided,
      pickerName: plain.picker
        ? plain.picker.username
        : plain.pickerGuest
          ? plain.pickerGuest.name
          : null,
      meals: toStringArray(plain.eventDetails?.meals),
      cocktails: toStringArray(plain.eventDetails?.cocktails),
      desserts: toStringArray(plain.eventDetails?.desserts),
      movies,
    };
  });

  const data = { mondays };
  dataCache.set(key, { at: Date.now(), data });
  return data;
}

// ---------------------------------------------------------------------------
// GET /overview  — curated aggregation for the graphs page + dashboard widget
// ---------------------------------------------------------------------------
router.get("/overview", authMiddleware, async (req, res) => {
  try {
    const groupIds = resolveGroupIds(req);
    const limit = clampInt(req.query.limit, 15, 1, 50); // top-N per chart

    if (groupIds.length === 0) {
      return res.json(emptyOverview());
    }

    const { mondays } = await loadGroupData(groupIds);
    return res.json(trimOverview(buildOverview(mondays), limit));
  } catch (error) {
    console.error("Error generating analytics overview:", error);
    return res.status(500).json({ error: "Failed to generate analytics" });
  }
});

function buildOverview(mondays) {
  const genres = new Map(); // name -> { name, count }
  const winningActors = new Map(); // id -> { id, name, wins }
  const rejectedActors = new Map(); // id -> { id, name, losses }
  const winningDirectors = new Map(); // id -> { id, name, wins }
  const rejectedMovies = new Map(); // tmdbId -> { id, name, losses }
  const pickers = new Map(); // name -> { name, winningPicks }
  const meals = new Map();
  const cocktails = new Map();
  const desserts = new Map();

  const bumpPerson = (bag, person, field) => {
    const cur = bag.get(person.id) || { id: person.id, name: person.name, [field]: 0 };
    cur[field]++;
    bag.set(person.id, cur);
  };
  const bumpName = (bag, name) => {
    const k = norm(name);
    const cur = bag.get(k) || { name, count: 0 };
    cur.count++;
    bag.set(k, cur);
  };

  let watched = 0;
  let rejected = 0;
  const watchedActors = new Set();
  const watchedDirectors = new Set();

  for (const mm of mondays) {
    for (const m of mm.movies) {
      if (m.outcome === "won") {
        watched++;
        m.genres.forEach((g) => bumpName(genres, g));
        m.actors.forEach((a) => {
          bumpPerson(winningActors, a, "wins");
          watchedActors.add(a.id);
        });
        m.directors.forEach((d) => {
          bumpPerson(winningDirectors, d, "wins");
          watchedDirectors.add(d.id);
        });
      } else if (m.outcome === "lost") {
        rejected++;
        m.actors.forEach((a) => bumpPerson(rejectedActors, a, "losses"));
        const cur = rejectedMovies.get(m.tmdbMovieId) || {
          id: m.tmdbMovieId,
          name: m.title,
          losses: 0,
        };
        cur.losses++;
        rejectedMovies.set(m.tmdbMovieId, cur);
      }
    }

    if (mm.decided && mm.pickerName) {
      const cur = pickers.get(mm.pickerName) || {
        name: mm.pickerName,
        winningPicks: 0,
      };
      cur.winningPicks++;
      pickers.set(mm.pickerName, cur);
    }

    mm.meals.forEach((x) => bumpName(meals, x));
    mm.cocktails.forEach((x) => bumpName(cocktails, x));
    mm.desserts.forEach((x) => bumpName(desserts, x));
  }

  const byDesc = (field) => (a, b) =>
    b[field] - a[field] || String(a.name).localeCompare(String(b.name));

  return {
    totals: {
      movieMondays: mondays.length,
      moviesWatched: watched,
      rejectedPicks: rejected,
      uniqueGenres: genres.size,
      uniqueActors: watchedActors.size,
      uniqueDirectors: watchedDirectors.size,
    },
    genres: [...genres.values()].sort(byDesc("count")),
    winningActors: [...winningActors.values()].sort(byDesc("wins")),
    rejectedActors: [...rejectedActors.values()].sort(byDesc("losses")),
    winningDirectors: [...winningDirectors.values()].sort(byDesc("wins")),
    rejectedMovies: [...rejectedMovies.values()].sort(byDesc("losses")),
    pickers: [...pickers.values()].sort(byDesc("winningPicks")),
    meals: [...meals.values()].sort(byDesc("count")),
    cocktails: [...cocktails.values()].sort(byDesc("count")),
    desserts: [...desserts.values()].sort(byDesc("count")),
  };
}

const OVERVIEW_LISTS = [
  "genres",
  "winningActors",
  "rejectedActors",
  "winningDirectors",
  "rejectedMovies",
  "pickers",
  "meals",
  "cocktails",
  "desserts",
];

function emptyOverview() {
  const out = {
    totals: {
      movieMondays: 0,
      moviesWatched: 0,
      rejectedPicks: 0,
      uniqueGenres: 0,
      uniqueActors: 0,
      uniqueDirectors: 0,
    },
  };
  OVERVIEW_LISTS.forEach((k) => (out[k] = []));
  return out;
}

function trimOverview(data, limit) {
  const out = { totals: data.totals };
  OVERVIEW_LISTS.forEach((k) => (out[k] = data[k].slice(0, limit)));
  return out;
}

// ---------------------------------------------------------------------------
// GET /movies  — drill-down list behind a chart bar / slice
// ---------------------------------------------------------------------------
// ?type=genre|actor|director|movie|picker|meal|cocktail|dessert
// &key=<person id, tmdb id, or name>
// &outcome=won|lost|all   (default: won)
//
// Returns one entry per distinct movie with how many times it matched, so the
// modal can show a single poster with an "×3" badge instead of three copies.
router.get("/movies", authMiddleware, async (req, res) => {
  try {
    const groupIds = resolveGroupIds(req);
    const type = String(req.query.type || "").toLowerCase();
    const rawKey = String(req.query.key || "").trim();
    const outcome = ["won", "lost", "all"].includes(req.query.outcome)
      ? req.query.outcome
      : "won";

    if (!rawKey) return res.status(400).json({ error: "key is required" });
    if (groupIds.length === 0) return res.json({ movies: [] });

    const { mondays } = await loadGroupData(groupIds);
    const keyNum = Number(rawKey);
    const keyName = norm(rawKey);

    const movieMatches = {
      genre: (m) => m.genres.some((g) => norm(g) === keyName),
      actor: (m) => m.actors.some((a) => a.id === keyNum),
      director: (m) => m.directors.some((d) => d.id === keyNum),
      movie: (m) => m.tmdbMovieId === keyNum,
    }[type];

    const mondayMatches = {
      picker: (mm) => norm(mm.pickerName) === keyName,
      meal: (mm) => mm.meals.some((x) => norm(x) === keyName),
      cocktail: (mm) => mm.cocktails.some((x) => norm(x) === keyName),
      dessert: (mm) => mm.desserts.some((x) => norm(x) === keyName),
    }[type];

    if (!movieMatches && !mondayMatches) {
      return res.status(400).json({ error: `Unknown drill-down type: ${type}` });
    }

    const outcomeOk = (m) =>
      outcome === "all" ? m.outcome !== "pending" : m.outcome === outcome;

    const grouped = new Map(); // tmdbId -> entry
    for (const mm of mondays) {
      if (mondayMatches && !mondayMatches(mm)) continue;
      for (const m of mm.movies) {
        if (movieMatches && !movieMatches(m)) continue;
        if (!outcomeOk(m)) continue;

        const cur = grouped.get(m.tmdbMovieId) || {
          tmdbMovieId: m.tmdbMovieId,
          title: m.title,
          posterPath: m.posterPath,
          releaseYear: m.releaseYear,
          count: 0,
          wins: 0,
          losses: 0,
          lastDate: null,
        };
        cur.count++;
        if (m.outcome === "won") cur.wins++;
        if (m.outcome === "lost") cur.losses++;
        if (!cur.lastDate || (mm.date && mm.date > cur.lastDate)) {
          cur.lastDate = mm.date;
        }
        grouped.set(m.tmdbMovieId, cur);
      }
    }

    const movies = [...grouped.values()].sort(
      (a, b) =>
        b.count - a.count ||
        String(b.lastDate || "").localeCompare(String(a.lastDate || "")),
    );

    return res.json({
      type,
      key: rawKey,
      outcome,
      totalSelections: movies.reduce((s, m) => s + m.count, 0),
      movies,
    });
  } catch (error) {
    console.error("Error generating analytics drill-down:", error);
    return res.status(500).json({ error: "Failed to load movies" });
  }
});

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
          {
            model: GroupGuest,
            as: "pickerGuest",
            required: false,
            attributes: ["id", "name"],
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
        : mm.pickerGuest
          ? { id: null, username: mm.pickerGuest.name, isGuest: true }
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
// One row per person, aggregated in a single raw SQL query. (The previous
// Sequelize findAll/count version 500'd: Model.count() with `include`
// prefixes `col` with the model name, producing "MovieCast.MovieCast.actorId".)
//
// Counting matches the charts:
//   appearances -> distinct movie selections the person is in (a person with
//                  two roles in one movie counts once)
//   wins        -> selections that won
//   losses      -> non-winning selections on a decided Monday (has a winner)
//   winRate     -> wins / (wins + losses); undecided nights are ignored
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
  // Table / column names come from this file only (never from the request).
  const table = model.getTableName(); // "MovieCast" | "MovieCrew"
  const tableSql = typeof table === "string" ? `"${table}"` : `"${table.tableName}"`;

  const where = [`mm."GroupId" IN (:groupIds)`];
  const replacements = { groupIds, limit: pageSize, offset };
  if (jobFilter) {
    where.push(`p."job" = :job`);
    replacements.job = jobFilter;
  }
  if (search) {
    where.push(`p."name" ILIKE :search`);
    replacements.search = `%${search}%`;
  }

  const peopleCte = `
    WITH decided AS (
      SELECT DISTINCT "movieMondayId"
      FROM "MovieSelections"
      WHERE "isWinner" = true
    ),
    people AS (
      SELECT
        p."${idCol}" AS "personId",
        MAX(p."name") AS "name",
        COUNT(DISTINCT ms."id") AS "appearances",
        COUNT(DISTINCT ms."id") FILTER (WHERE ms."isWinner" = true) AS "wins",
        COUNT(DISTINCT ms."id") FILTER (
          WHERE COALESCE(ms."isWinner", false) = false
            AND d."movieMondayId" IS NOT NULL
        ) AS "losses"
      FROM ${tableSql} p
      JOIN "MovieSelections" ms ON ms."id" = p."movieSelectionId"
      JOIN "MovieMondays" mm ON mm."id" = ms."movieMondayId"
      LEFT JOIN decided d ON d."movieMondayId" = ms."movieMondayId"
      WHERE ${where.join(" AND ")}
      GROUP BY p."${idCol}"
    )`;

  // Whitelisted sorts -> real SQL expressions (no request text reaches SQL).
  const sortExprMap = {
    appearances: `"appearances"`,
    wins: `"wins"`,
    losses: `"losses"`,
    name: `"name"`,
    winRate: `(CAST("wins" AS FLOAT) / NULLIF("wins" + "losses", 0))`,
  };
  const sortExpr = sortExprMap[sortBy] || sortExprMap.appearances;
  const dir = sortDir === "ASC" ? "ASC" : "DESC";

  const [rowsRaw, countRows] = await Promise.all([
    sequelize.query(
      `${peopleCte}
      SELECT * FROM people
      ORDER BY ${sortExpr} ${dir} NULLS LAST, "name" ASC
      LIMIT :limit OFFSET :offset`,
      { replacements, type: QueryTypes.SELECT },
    ),
    sequelize.query(`${peopleCte} SELECT COUNT(*)::int AS "total" FROM people`, {
      replacements,
      type: QueryTypes.SELECT,
    }),
  ]);

  const total = Number(countRows[0]?.total) || 0;

  const rows = rowsRaw.map((r) => {
    const appearances = Number(r.appearances) || 0;
    const wins = Number(r.wins) || 0;
    const losses = Number(r.losses) || 0;
    const decided = wins + losses;
    return {
      id: Number(r.personId),
      name: r.name,
      appearances,
      wins,
      losses,
      winRate: decided ? Math.round((wins / decided) * 1000) / 10 : 0,
    };
  });

  return {
    type: jobFilter ? "directors" : "actors",
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
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
module.exports.clearAnalyticsCache = clearAnalyticsCache;