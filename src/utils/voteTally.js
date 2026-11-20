
function tallySingle(candidateIds, ballots) {
  const counts = {};
  candidateIds.forEach((id) => {
    counts[id] = 0;
  });

  ballots.forEach((ballot) => {
    const choice = ballot[0];
    if (counts[choice] !== undefined) counts[choice] += 1;
  });

  const totalBallots = ballots.length;
  const max = Math.max(0, ...Object.values(counts));
  const winnerIds =
    totalBallots === 0
      ? []
      : candidateIds.filter((id) => counts[id] === max);

  return {
    counts,
    winnerIds,
    isTie: winnerIds.length > 1,
  };
}

function tallyRanked(candidateIds, ballots) {
  const rounds = [];
  let remaining = candidateIds.slice();

  // Precompute tie-break data
  const firstChoice = {};
  const mentions = {};
  candidateIds.forEach((id) => {
    firstChoice[id] = 0;
    mentions[id] = 0;
  });
  ballots.forEach((ballot) => {
    if (firstChoice[ballot[0]] !== undefined) firstChoice[ballot[0]] += 1;
    ballot.forEach((id) => {
      if (mentions[id] !== undefined) mentions[id] += 1;
    });
  });

  if (ballots.length === 0 || candidateIds.length === 0) {
    return { rounds: [], firstChoiceCounts: firstChoice, winnerIds: [], isTie: false };
  }

  // Safety cap: at most one round per candidate
  for (let guard = 0; guard <= candidateIds.length; guard++) {
    const counts = {};
    remaining.forEach((id) => {
      counts[id] = 0;
    });

    let exhausted = 0;
    ballots.forEach((ballot) => {
      const top = ballot.find((id) => counts[id] !== undefined);
      if (top === undefined) exhausted += 1;
      else counts[top] += 1;
    });

    const active = ballots.length - exhausted;
    const round = { counts, exhausted, active, eliminated: [] };
    rounds.push(round);

    // Majority winner?
    const leader = remaining.find((id) => counts[id] * 2 > active);
    if (leader !== undefined) {
      return { rounds, firstChoiceCounts: firstChoice, winnerIds: [leader], isTie: false };
    }

    // Find last place
    const min = Math.min(...remaining.map((id) => counts[id]));
    let lowest = remaining.filter((id) => counts[id] === min);

    if (lowest.length > 1) {
      const minFirst = Math.min(...lowest.map((id) => firstChoice[id]));
      lowest = lowest.filter((id) => firstChoice[id] === minFirst);
    }
    if (lowest.length > 1) {
      const minMentions = Math.min(...lowest.map((id) => mentions[id]));
      lowest = lowest.filter((id) => mentions[id] === minMentions);
    }

    if (lowest.length === remaining.length) {
      // Everyone left is perfectly tied
      return {
        rounds,
        firstChoiceCounts: firstChoice,
        winnerIds: remaining.slice(),
        isTie: remaining.length > 1,
      };
    }

    round.eliminated = lowest;
    remaining = remaining.filter((id) => lowest.indexOf(id) === -1);

    if (remaining.length === 1) {
      // Last one standing (can happen when every other ballot is exhausted)
      rounds.push({
        counts: { [remaining[0]]: ballots.filter((b) => b.indexOf(remaining[0]) !== -1).length },
        exhausted: ballots.filter((b) => b.indexOf(remaining[0]) === -1).length,
        active: ballots.filter((b) => b.indexOf(remaining[0]) !== -1).length,
        eliminated: [],
      });
      return { rounds, firstChoiceCounts: firstChoice, winnerIds: remaining, isTie: false };
    }
  }

  return { rounds, firstChoiceCounts: firstChoice, winnerIds: remaining, isTie: remaining.length > 1 };
}

module.exports = { tallySingle, tallyRanked };