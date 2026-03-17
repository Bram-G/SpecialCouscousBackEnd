const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { Op } = require('sequelize');
const auth = require('../middleware/auth');
const {
  User,
  Group,
  MovieMonday,
  MovieSelection,
  MovieMondayEventDetails,
  MovieCast,
  MovieCrew,
  WatchlistCategory,
  WatchlistItem,
} = require('../models');

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/export
// ─────────────────────────────────────────────────────────────────────────────
router.get('/export', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    // Load user + groups + group members (no MovieMondays here — no association defined that direction)
    const userWithGroups = await User.findByPk(userId, {
      include: [
        {
          model: Group,
          include: [
            { model: User, attributes: ['id', 'username', 'email'] },
          ],
        },
      ],
    });

    if (!userWithGroups) return res.status(404).json({ message: 'User not found' });

    const safeParse = (val) => {
      if (!val) return [];
      if (typeof val === 'string') { try { return JSON.parse(val); } catch { return []; } }
      return val;
    };

    // Query MovieMondays per group (MovieMonday.belongsTo(Group) — not the reverse)
    const groups = await Promise.all(
      userWithGroups.Groups.map(async (group) => {
        const movieMondays = await MovieMonday.findAll({
          where: { GroupId: group.id },
          include: [
            {
              model: MovieSelection,
              as: 'movieSelections',
              attributes: ['tmdbMovieId', 'title', 'posterPath', 'isWinner', 'genres', 'releaseYear'],
            },
            {
              model: MovieMondayEventDetails,
              as: 'eventDetails',
              attributes: ['cocktails', 'meals', 'desserts'], // notes column does not exist in DB
            },
            { model: User, as: 'picker', attributes: ['username'] },
          ],
          order: [['date', 'ASC']],
        });

        return {
          name: group.name,
          description: group.description,
          isPublic: group.isPublic,
          slug: group.slug,
          members: group.Users.map((u) => u.username),
          movieMondays: movieMondays.map((mm) => ({
            date: mm.date,
            picker: mm.picker ? mm.picker.username : null,
            status: mm.status,
            isPublic: mm.isPublic,
            weekTheme: mm.weekTheme,
            movieSelections: (mm.movieSelections || []).map((ms) => ({
              tmdbMovieId: ms.tmdbMovieId,
              title: ms.title,
              posterPath: ms.posterPath,
              isWinner: ms.isWinner,
              genres: safeParse(ms.genres),
              releaseYear: ms.releaseYear,
            })),
            eventDetails: mm.eventDetails
              ? {
                  cocktails: safeParse(mm.eventDetails.cocktails),
                  meals: safeParse(mm.eventDetails.meals),
                  desserts: safeParse(mm.eventDetails.desserts),
                }
              : null,
          })),
        };
      })
    );

    const allUsers = new Map();
    userWithGroups.Groups.forEach((g) =>
      g.Users.forEach((u) => {
        if (!allUsers.has(u.username)) allUsers.set(u.username, { username: u.username, email: u.email });
      })
    );

    const watchlistCategories = await WatchlistCategory.findAll({
      where: { userId },
      include: [
        {
          model: WatchlistItem,
          as: 'items',
          attributes: ['tmdbMovieId', 'title', 'posterPath', 'sortOrder', 'userNote', 'userRating', 'watched', 'watchedDate'],
          order: [['sortOrder', 'ASC']],
        },
      ],
    });

    const watchlists = watchlistCategories.map((wl) => ({
      ownerUsername: userWithGroups.username,
      name: wl.name,
      description: wl.description,
      isPublic: wl.isPublic,
      items: (wl.items || []).map((item) => ({
        tmdbMovieId: item.tmdbMovieId,
        title: item.title,
        posterPath: item.posterPath,
        sortOrder: item.sortOrder,
        userNote: item.userNote,
        userRating: item.userRating,
        watched: item.watched,
        watchedDate: item.watchedDate,
      })),
    }));

    res.json({
      exportVersion: '1.0',
      exportedAt: new Date().toISOString(),
      exportedBy: userWithGroups.username,
      users: Array.from(allUsers.values()),
      groups,
      watchlists,
    });
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ message: 'Failed to export data', error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/import
//
// Designed to be called in chunks from the frontend to avoid Heroku's 30s
// request timeout. The frontend slices movieMondays into batches and calls
// this endpoint once per batch.
//
// Body shape:
//   {
//     exportVersion: string,
//     isChunk: boolean,        // true for all calls after the first
//     chunkIndex: number,      // 0-based, used for logging only
//     users:      [...],       // only sent on chunkIndex === 0
//     watchlists: [...],       // only sent on chunkIndex === 0
//     groups: [
//       {
//         name, description, isPublic, slug,
//         members: [...],      // only needed on chunkIndex === 0
//         movieMondays: [...], // the slice for this chunk
//       }
//     ]
//   }
//
// The endpoint is fully idempotent — safe to call multiple times for the
// same data. Users and groups are created on the first chunk and reused on
// subsequent chunks via findOrCreate / findOne.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/import', auth, async (req, res) => {
  const results = {
    users:           { created: 0, existing: 0 },
    groups:          { created: 0, updated: 0 },
    movieMondays:    { created: 0, updated: 0 },
    movieSelections: { created: 0 },
    eventDetails:    { created: 0, updated: 0 },
    watchlists:      { created: 0, updated: 0 },
    watchlistItems:  { created: 0, skipped: 0 },
    errors:          [],
  };

  try {
    const { exportVersion, isChunk, chunkIndex = 0, users, groups, watchlists } = req.body;

    if (!exportVersion || !groups) {
      return res.status(400).json({ message: 'Invalid import payload — missing exportVersion or groups' });
    }

    const authUser = await User.findByPk(req.user.id);
    const userMap  = new Map();

    // ── Users — only process on first chunk ───────────────────────────────
    if (!isChunk || chunkIndex === 0) {
      for (const userData of (users || [])) {
        try {
          let user = await User.findOne({ where: { username: userData.username } });
          if (!user) user = await User.findOne({ where: { email: userData.email } });
          if (!user) {
            const hashed = await bcrypt.hash('ChangeMe123!', 10);
            user = await User.create({ username: userData.username, email: userData.email, password: hashed, isVerified: true });
            results.users.created++;
          } else {
            results.users.existing++;
          }
          userMap.set(userData.username, user);
        } catch (err) {
          results.errors.push(`User "${userData.username}": ${err.message}`);
        }
      }
    }

    // Always make sure the authenticated user is in the map
    if (authUser && !userMap.has(authUser.username)) {
      userMap.set(authUser.username, authUser);
    }

    // Helper: resolve a username to a User — checks map first, then DB
    const resolveUser = async (username) => {
      if (!username) return authUser;
      if (userMap.has(username)) return userMap.get(username);
      const u = await User.findOne({ where: { username } });
      if (u) { userMap.set(username, u); return u; }
      return authUser;
    };

    // ── Groups & MovieMondays ─────────────────────────────────────────────
    for (const groupData of groups) {
      try {
        let group = await Group.findOne({ where: { name: groupData.name } });

        if (!group) {
          const ownerUser = await resolveUser(groupData.members && groupData.members[0]);
          const baseSlug  = groupData.slug || groupData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          let   finalSlug = baseSlug;
          let   counter   = 1;
          while (await Group.findOne({ where: { slug: finalSlug } })) finalSlug = `${baseSlug}-${counter++}`;

          group = await Group.create({
            name: groupData.name,
            description: groupData.description || null,
            isPublic: groupData.isPublic || false,
            slug: finalSlug,
            createdById: ownerUser.id,
          });
          results.groups.created++;
        } else {
          results.groups.updated++;
        }

        // Add members — only meaningful on first chunk but harmless to repeat
        for (const memberUsername of groupData.members || []) {
          const memberUser = await resolveUser(memberUsername);
          if (memberUser) { try { await group.addUser(memberUser.id); } catch { /* already member */ } }
        }

        // ── MovieMondays (this chunk's slice) ────────────────────────────
        for (const mmData of groupData.movieMondays || []) {
          try {
            const pickerUser = await resolveUser(mmData.picker);
            const baseSlug   = `${group.slug || group.id}-${mmData.date}`;

            const [movieMonday, mmCreated] = await MovieMonday.findOrCreate({
              where: { date: mmData.date, GroupId: group.id },
              defaults: {
                pickerUserId: pickerUser.id,
                GroupId: group.id,
                status: mmData.status || 'completed',
                isPublic: mmData.isPublic || false,
                weekTheme: mmData.weekTheme || null,
                slug: baseSlug,
              },
            });

            if (!mmCreated) {
              await movieMonday.update({
                pickerUserId: pickerUser.id,
                status:       mmData.status    || movieMonday.status,
                isPublic:     mmData.isPublic  !== undefined ? mmData.isPublic  : movieMonday.isPublic,
                weekTheme:    mmData.weekTheme !== undefined ? mmData.weekTheme : movieMonday.weekTheme,
                slug:         movieMonday.slug || baseSlug,
              });
              results.movieMondays.updated++;
            } else {
              results.movieMondays.created++;
            }

            // Always refresh movie selections
            await MovieSelection.destroy({ where: { movieMondayId: movieMonday.id } });

            for (const msData of mmData.movieSelections || []) {
              try {
                await MovieSelection.create({
                  movieMondayId: movieMonday.id,
                  tmdbMovieId:   msData.tmdbMovieId,
                  title:         msData.title,
                  posterPath:    msData.posterPath  || null,
                  isWinner:      msData.isWinner    || false,
                  genres:        msData.genres      || [],
                  releaseYear:   msData.releaseYear || null,
                });
                results.movieSelections.created++;
              } catch (msErr) {
                results.errors.push(`MovieSelection "${msData.title}" (${mmData.date}): ${msErr.message}`);
              }
            }

            // Event details
            if (mmData.eventDetails) {
              const ed      = mmData.eventDetails;
              const hasData = (ed.cocktails && ed.cocktails.length > 0)
                           || (ed.meals     && ed.meals.length     > 0)
                           || (ed.desserts  && ed.desserts.length  > 0);

              if (hasData) {
                const [eventDetails, edCreated] = await MovieMondayEventDetails.findOrCreate({
                  where:    { movieMondayId: movieMonday.id },
                  defaults: { movieMondayId: movieMonday.id, cocktails: ed.cocktails || [], meals: ed.meals || [], desserts: ed.desserts || [] },
                });
                if (!edCreated) {
                  await eventDetails.update({ cocktails: ed.cocktails || [], meals: ed.meals || [], desserts: ed.desserts || [] });
                  results.eventDetails.updated++;
                } else {
                  results.eventDetails.created++;
                }
              }
            }
          } catch (mmErr) {
            results.errors.push(`MovieMonday ${mmData.date}: ${mmErr.message}`);
          }
        }
      } catch (groupErr) {
        results.errors.push(`Group "${groupData.name}": ${groupErr.message}`);
      }
    }

    // ── Watchlists — only process on first chunk ───────────────────────────
    if (!isChunk || chunkIndex === 0) {
      for (const wlData of watchlists || []) {
        try {
          const ownerUser = await resolveUser(wlData.ownerUsername);
          const baseSlug  = wlData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

          const [category, wlCreated] = await WatchlistCategory.findOrCreate({
            where:    { name: wlData.name, userId: ownerUser.id },
            defaults: { name: wlData.name, description: wlData.description || null, isPublic: wlData.isPublic || false, userId: ownerUser.id, slug: baseSlug },
          });
          wlCreated ? results.watchlists.created++ : results.watchlists.updated++;

          for (const itemData of wlData.items || []) {
            try {
              const existing = await WatchlistItem.findOne({ where: { categoryId: category.id, tmdbMovieId: itemData.tmdbMovieId } });
              if (!existing) {
                await WatchlistItem.create({
                  categoryId:  category.id,
                  tmdbMovieId: itemData.tmdbMovieId,
                  title:       itemData.title,
                  posterPath:  itemData.posterPath  || null,
                  sortOrder:   itemData.sortOrder   || 0,
                  userNote:    itemData.userNote    || null,
                  userRating:  itemData.userRating  || null,
                  watched:     itemData.watched     || false,
                  watchedDate: itemData.watchedDate || null,
                });
                results.watchlistItems.created++;
              } else {
                results.watchlistItems.skipped++;
              }
            } catch (itemErr) {
              results.errors.push(`WatchlistItem "${itemData.title}": ${itemErr.message}`);
            }
          }
        } catch (wlErr) {
          results.errors.push(`Watchlist "${wlData.name}": ${wlErr.message}`);
        }
      }
    }

    res.json({ success: true, message: 'Chunk imported', chunkIndex, results });
  } catch (error) {
    console.error('Import error:', error);
    res.status(500).json({ success: false, message: 'Import failed', error: error.message, results });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/enrich-status
// ─────────────────────────────────────────────────────────────────────────────
router.get('/enrich-status', auth, async (req, res) => {
  try {
    const userWithGroups = await User.findByPk(req.user.id, {
      include: [{ model: Group, attributes: ['id'] }],
    });
    const userGroupIds = (userWithGroups.Groups || []).map((g) => g.id);

    if (!userGroupIds.length) return res.json({ total: 0, missing: 0, enriched: 0 });

    const allSelections = await MovieSelection.findAll({
      attributes: ['id'],
      include: [{
        model: MovieMonday,
        attributes: [],
        where: { GroupId: { [Op.in]: userGroupIds } },
        required: true,
      }],
      raw: true,
    });

    const total = allSelections.length;
    if (total === 0) return res.json({ total: 0, missing: 0, enriched: 0 });

    const allIds = allSelections.map((s) => s.id);
    const enrichedRows = await MovieCast.findAll({
      attributes: ['movieSelectionId'],
      where: { movieSelectionId: { [Op.in]: allIds } },
      group: ['movieSelectionId'],
      raw: true,
    });

    const enrichedCount = enrichedRows.length;
    res.json({ total, missing: total - enrichedCount, enriched: enrichedCount });
  } catch (error) {
    console.error('Enrich status error:', error);
    res.status(500).json({ message: 'Failed to get enrich status', error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/enrich-tmdb
// Process one batch of un-enriched MovieSelections. Call repeatedly until done.
// Body: { offset?: number, batchSize?: number }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/enrich-tmdb', auth, async (req, res) => {
  const clampedBatchSize = Math.min(Math.max(parseInt(req.body.batchSize) || 15, 1), 25);
  const clampedOffset    = Math.max(parseInt(req.body.offset)    || 0,  0);

  const batchErrors = [];
  let enrichedCount = 0;
  let failedCount   = 0;

  try {
    const userWithGroups = await User.findByPk(req.user.id, {
      include: [{ model: Group, attributes: ['id'] }],
    });
    const userGroupIds = (userWithGroups.Groups || []).map((g) => g.id);

    if (!userGroupIds.length) {
      return res.json({ total: 0, offset: 0, batchSize: clampedBatchSize, enriched: 0, failed: 0, done: true, nextOffset: 0, errors: [] });
    }

    const allSelections = await MovieSelection.findAll({
      attributes: ['id', 'tmdbMovieId', 'title'],
      include: [{
        model: MovieMonday,
        attributes: [],
        where: { GroupId: { [Op.in]: userGroupIds } },
        required: true,
      }],
      raw: true,
    });

    if (!allSelections.length) {
      return res.json({ total: 0, offset: 0, batchSize: clampedBatchSize, enriched: 0, failed: 0, done: true, nextOffset: 0, errors: [] });
    }

    const allIds = allSelections.map((s) => s.id);
    const alreadyEnrichedRows = await MovieCast.findAll({
      attributes: ['movieSelectionId'],
      where: { movieSelectionId: { [Op.in]: allIds } },
      group: ['movieSelectionId'],
      raw: true,
    });
    const alreadyEnrichedSet = new Set(alreadyEnrichedRows.map((r) => r.movieSelectionId));

    const needsEnrichment = allSelections.filter((s) => !alreadyEnrichedSet.has(s.id));
    const total = needsEnrichment.length;

    if (total === 0 || clampedOffset >= total) {
      return res.json({ total, offset: clampedOffset, batchSize: clampedBatchSize, enriched: 0, failed: 0, done: true, nextOffset: total, errors: [] });
    }

    const batch          = needsEnrichment.slice(clampedOffset, clampedOffset + clampedBatchSize);
    const TMDB_API_KEY   = process.env.TMDB_API_KEY;

    for (const selection of batch) {
      try {
        if (!selection.tmdbMovieId) {
          failedCount++;
          batchErrors.push(`"${selection.title}" — no TMDB ID`);
          continue;
        }

        const url     = `https://api.themoviedb.org/3/movie/${selection.tmdbMovieId}?api_key=${TMDB_API_KEY}&append_to_response=credits`;
        const tmdbRes = await fetch(url);

        if (!tmdbRes.ok) {
          failedCount++;
          batchErrors.push(`"${selection.title}" — TMDB ${tmdbRes.status}`);
          continue;
        }

        const tmdbData = await tmdbRes.json();

        await MovieCast.destroy({ where: { movieSelectionId: selection.id } });
        await MovieCrew.destroy({ where: { movieSelectionId: selection.id } });

        if (tmdbData.genres || tmdbData.release_date) {
          const updates = {};
          if (tmdbData.genres)       updates.genres      = tmdbData.genres.map((g) => g.name);
          if (tmdbData.release_date) updates.releaseYear = parseInt(tmdbData.release_date.split('-')[0]);
          await MovieSelection.update(updates, { where: { id: selection.id } });
        }

        if (tmdbData.credits?.cast) {
          for (const actor of tmdbData.credits.cast.slice(0, 10)) {
            try {
              await MovieCast.create({
                movieSelectionId: selection.id,
                actorId:     actor.id,
                name:        actor.name,
                character:   actor.character    || null,
                profilePath: actor.profile_path || null,
                order:       actor.order        || null,
              });
            } catch { /* non-fatal */ }
          }
        }

        if (tmdbData.credits?.crew) {
          const importantJobs = ['Director', 'Screenplay', 'Writer'];
          const keyCrew = tmdbData.credits.crew
            .filter((p) => importantJobs.includes(p.job))
            .map((p)    => (p.job === 'Screenplay' ? { ...p, job: 'Writer' } : p));

          const uniqueCrew = [];
          const seen = new Set();
          for (const p of keyCrew) {
            const key = `${p.id}-${p.job}`;
            if (!seen.has(key)) { seen.add(key); uniqueCrew.push(p); }
          }

          for (const person of uniqueCrew) {
            try {
              await MovieCrew.create({
                movieSelectionId: selection.id,
                personId:    person.id,
                name:        person.name,
                job:         person.job,
                department:  person.department   || null,
                profilePath: person.profile_path || null,
              });
            } catch { /* non-fatal */ }
          }
        }

        enrichedCount++;
      } catch (selErr) {
        failedCount++;
        batchErrors.push(`"${selection.title}": ${selErr.message}`);
      }
    }

    const nextOffset = clampedOffset + clampedBatchSize;
    const done       = nextOffset >= total;

    res.json({
      total,
      offset:     clampedOffset,
      batchSize:  clampedBatchSize,
      enriched:   enrichedCount,
      failed:     failedCount,
      done,
      nextOffset: done ? total : nextOffset,
      errors:     batchErrors,
    });
  } catch (error) {
    console.error('Enrich TMDB error:', error);
    res.status(500).json({ message: 'Enrichment batch failed', error: error.message, enriched: enrichedCount, failed: failedCount, done: false, errors: batchErrors });
  }
});

module.exports = router;