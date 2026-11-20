
const express = require("express");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const router = express.Router();

const authMiddleware = require("../middleware/auth");
const {
  MovieMonday,
  MovieSelection,
  Group,
  User,
  GroupGuest,
  VoteSession,
  Ballot,
} = require("../models");
const { tallySingle, tallyRanked } = require("../utils/voteTally");
const voteHub = require("../utils/voteHub");

const VALID_MODES = ["single", "ranked"];

// Keyed by voterKey (falls back to IP) so a room full of people on the same
// Wi-Fi doesn't share one bucket.
const ballotLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    (req.body && typeof req.body.voterKey === "string" && req.body.voterKey) ||
    req.ip,
  validate: false,
  message: { message: "Too many vote attempts — slow down a moment." },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const generateToken = () => crypto.randomBytes(18).toString("base64url");

async function getCandidates(movieMondayId) {
  const selections = await MovieSelection.findAll({
    where: { movieMondayId },
    attributes: ["id", "tmdbMovieId", "title", "posterPath", "releaseYear"],
    order: [["id", "ASC"]],
  });
  return selections.map((s) => s.get({ plain: true }));
}

async function buildResults(session) {
  const candidates = await getCandidates(session.movieMondayId);
  const candidateIds = candidates.map((c) => c.id);

  const ballotRows = await Ballot.findAll({
    where: { voteSessionId: session.id },
    attributes: ["rankings"],
  });

  // Drop any ids that no longer exist (e.g. a movie removed mid-vote)
  const ballots = ballotRows
    .map((b) => b.rankings.filter((id) => candidateIds.indexOf(id) !== -1))
    .filter((b) => b.length > 0);

  const base = {
    sessionId: session.id,
    mode: session.mode,
    status: session.status,
    totalBallots: ballots.length,
    candidates,
    updatedAt: new Date().toISOString(),
  };

  if (session.mode === "ranked") {
    const r = tallyRanked(candidateIds, ballots);
    const finalRound = r.rounds.length ? r.rounds[r.rounds.length - 1] : null;
    return {
      ...base,
      counts: finalRound ? finalRound.counts : {},
      firstChoiceCounts: r.firstChoiceCounts,
      rounds: r.rounds,
      winnerIds: r.winnerIds,
      isTie: r.isTie,
    };
  }

  const s = tallySingle(candidateIds, ballots);
  return {
    ...base,
    counts: s.counts,
    firstChoiceCounts: s.counts,
    rounds: [],
    winnerIds: s.winnerIds,
    isTie: s.isTie,
  };
}

async function broadcast(session) {
  if (!voteHub.hasSubscribers(session.id)) return;
  try {
    voteHub.publish(session.id, await buildResults(session));
  } catch (e) {
    console.error("Vote broadcast failed:", e.message);
  }
}

// Loads a session and confirms the logged-in user is in that Monday's group
async function loadSessionForMember(req, res) {
  const session = await VoteSession.findByPk(req.params.id);
  if (!session) {
    res.status(404).json({ message: "Vote not found" });
    return null;
  }
  const movieMonday = await MovieMonday.findByPk(session.movieMondayId);
  if (!movieMonday || !req.isInGroup(movieMonday.GroupId)) {
    res.status(403).json({ message: "Not authorized for this vote" });
    return null;
  }
  return session;
}

function serializeSession(session) {
  return {
    id: session.id,
    token: session.token,
    mode: session.mode,
    status: session.status,
    movieMondayId: session.movieMondayId,
    createdAt: session.createdAt,
    closedAt: session.closedAt,
  };
}

// ---------------------------------------------------------------------------
// Host routes (auth required)
// ---------------------------------------------------------------------------

router.post("/sessions", authMiddleware, async (req, res) => {
  try {
    const movieMondayId = parseInt(req.body.movieMondayId, 10);
    const mode = req.body.mode || "single";

    if (!VALID_MODES.includes(mode)) {
      return res.status(400).json({ message: "mode must be 'single' or 'ranked'" });
    }

    const movieMonday = await MovieMonday.findByPk(movieMondayId);
    if (!movieMonday || !req.isInGroup(movieMonday.GroupId)) {
      return res.status(404).json({ message: "Movie Monday not found or not in your group" });
    }

    const candidates = await getCandidates(movieMondayId);
    if (candidates.length < 2) {
      return res.status(400).json({ message: "Add at least two movies before starting a vote" });
    }

    // Only one open vote per Monday — close any previous one
    const openSessions = await VoteSession.findAll({
      where: { movieMondayId, status: "open" },
    });
    for (const old of openSessions) {
      await old.update({ status: "closed", closedAt: new Date() });
      broadcast(old);
    }

    const session = await VoteSession.create({
      movieMondayId,
      createdById: req.user.id,
      token: generateToken(),
      mode,
      status: "open",
    });

    res.status(201).json({
      session: serializeSession(session),
      results: await buildResults(session),
    });
  } catch (error) {
    console.error("Error creating vote session:", error);
    res.status(500).json({ message: "Failed to start vote" });
  }
});

router.get("/monday/:movieMondayId", authMiddleware, async (req, res) => {
  try {
    const movieMonday = await MovieMonday.findByPk(req.params.movieMondayId);
    if (!movieMonday || !req.isInGroup(movieMonday.GroupId)) {
      return res.status(404).json({ message: "Movie Monday not found or not in your group" });
    }

    const session = await VoteSession.findOne({
      where: { movieMondayId: movieMonday.id },
      order: [["createdAt", "DESC"]],
    });

    if (!session) return res.json({ session: null, results: null });

    res.json({
      session: serializeSession(session),
      results: await buildResults(session),
    });
  } catch (error) {
    console.error("Error fetching vote for monday:", error);
    res.status(500).json({ message: "Failed to load vote" });
  }
});

router.post("/sessions/:id/close", authMiddleware, async (req, res) => {
  try {
    const session = await loadSessionForMember(req, res);
    if (!session) return;

    await session.update({ status: "closed", closedAt: new Date() });
    const results = await buildResults(session);
    voteHub.publish(session.id, results);

    res.json({ session: serializeSession(session), results });
  } catch (error) {
    console.error("Error closing vote:", error);
    res.status(500).json({ message: "Failed to close vote" });
  }
});

router.post("/sessions/:id/reopen", authMiddleware, async (req, res) => {
  try {
    const session = await loadSessionForMember(req, res);
    if (!session) return;

    // Don't allow two open votes for the same Monday
    const newer = await VoteSession.findOne({
      where: { movieMondayId: session.movieMondayId, status: "open" },
    });
    if (newer && newer.id !== session.id) {
      return res.status(409).json({ message: "Another vote is already open for this Monday" });
    }

    await session.update({ status: "open", closedAt: null });
    const results = await buildResults(session);
    voteHub.publish(session.id, results);

    res.json({ session: serializeSession(session), results });
  } catch (error) {
    console.error("Error reopening vote:", error);
    res.status(500).json({ message: "Failed to reopen vote" });
  }
});

// ---------------------------------------------------------------------------
// Public voter routes (no auth)
// ---------------------------------------------------------------------------

async function loadSessionByToken(req, res) {
  const session = await VoteSession.findOne({ where: { token: req.params.token } });
  if (!session) {
    res.status(404).json({ message: "This vote link isn't valid" });
    return null;
  }
  return session;
}

router.get("/s/:token", async (req, res) => {
  try {
    const session = await loadSessionByToken(req, res);
    if (!session) return;

    const movieMonday = await MovieMonday.findByPk(session.movieMondayId, {
      attributes: ["id", "date", "weekTheme", "GroupId"],
      include: [
        { model: Group, attributes: ["name"] },
        { model: User, as: "picker", attributes: ["username"] },
        { model: GroupGuest, as: "pickerGuest", attributes: ["name"] },
      ],
    });

    res.json({
      session: {
        mode: session.mode,
        status: session.status,
      },
      movieMonday: movieMonday
        ? {
            date: movieMonday.date,
            weekTheme: movieMonday.weekTheme,
            groupName: movieMonday.Group ? movieMonday.Group.name : null,
            pickerName:
              (movieMonday.picker && movieMonday.picker.username) ||
              (movieMonday.pickerGuest && movieMonday.pickerGuest.name) ||
              null,
          }
        : null,
      candidates: await getCandidates(session.movieMondayId),
    });
  } catch (error) {
    console.error("Error loading public vote:", error);
    res.status(500).json({ message: "Failed to load vote" });
  }
});

router.post("/s/:token/ballot", ballotLimiter, async (req, res) => {
  try {
    const session = await loadSessionByToken(req, res);
    if (!session) return;

    if (session.status !== "open") {
      return res.status(409).json({ message: "Voting has closed" });
    }

    const { voterKey, rankings } = req.body;

    if (typeof voterKey !== "string" || !/^[A-Za-z0-9_-]{8,64}$/.test(voterKey)) {
      return res.status(400).json({ message: "Invalid voter key" });
    }
    if (!Array.isArray(rankings) || rankings.length === 0) {
      return res.status(400).json({ message: "Pick at least one movie" });
    }

    const candidateIds = (await getCandidates(session.movieMondayId)).map((c) => c.id);
    const ids = rankings.map((r) => parseInt(r, 10));

    const allValid = ids.every((id) => candidateIds.indexOf(id) !== -1);
    const unique = new Set(ids).size === ids.length;
    if (!allValid || !unique) {
      return res.status(400).json({ message: "Ballot contains invalid movies" });
    }
    if (session.mode === "single" && ids.length !== 1) {
      return res.status(400).json({ message: "Single-vote ballots need exactly one movie" });
    }

    const existing = await Ballot.findOne({
      where: { voteSessionId: session.id, voterKey },
    });

    if (existing) {
      await existing.update({ rankings: ids });
    } else {
      try {
        await Ballot.create({ voteSessionId: session.id, voterKey, rankings: ids });
      } catch (e) {
        // Double-tap race: the unique index caught a duplicate — update instead
        if (e.name === "SequelizeUniqueConstraintError") {
          await Ballot.update(
            { rankings: ids },
            { where: { voteSessionId: session.id, voterKey } },
          );
        } else {
          throw e;
        }
      }
    }

    const results = await buildResults(session);
    voteHub.publish(session.id, results);

    res.json({ success: true, updated: !!existing, results });
  } catch (error) {
    console.error("Error submitting ballot:", error);
    res.status(500).json({ message: "Failed to submit vote" });
  }
});

router.get("/s/:token/results", async (req, res) => {
  try {
    const session = await loadSessionByToken(req, res);
    if (!session) return;
    res.json(await buildResults(session));
  } catch (error) {
    console.error("Error loading results:", error);
    res.status(500).json({ message: "Failed to load results" });
  }
});

router.get("/s/:token/stream", async (req, res) => {
  try {
    const session = await loadSessionByToken(req, res);
    if (!session) return;

    voteHub.subscribe(session.id, req, res);
    // Send the current state immediately so the client doesn't wait
    voteHub.send(res, await buildResults(session));
  } catch (error) {
    console.error("Error opening vote stream:", error);
    if (!res.headersSent) res.status(500).json({ message: "Failed to open stream" });
  }
});

module.exports = router;