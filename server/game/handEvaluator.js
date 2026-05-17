'use strict';

// Returns { rank, name, tiebreakers[] } for the best 5-card hand from given cards
function evaluateHand(cards) {
  const combos = choose5(cards);
  let best = null;
  for (const combo of combos) {
    const score = scoreHand(combo);
    if (!best || compareScore(score, best) > 0) best = score;
  }
  return best;
}

function choose5(cards) {
  const results = [];
  const n = cards.length;
  for (let a = 0; a < n - 4; a++)
    for (let b = a + 1; b < n - 3; b++)
      for (let c = b + 1; c < n - 2; c++)
        for (let d = c + 1; d < n - 1; d++)
          for (let e = d + 1; e < n; e++)
            results.push([cards[a], cards[b], cards[c], cards[d], cards[e]]);
  return results;
}

function scoreHand(cards) {
  const vals = cards.map(c => c.value).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);
  const isFlush = suits.every(s => s === suits[0]);
  const isStraight = checkStraight(vals);

  const counts = {};
  for (const v of vals) counts[v] = (counts[v] || 0) + 1;
  const groups = Object.entries(counts)
    .map(([v, c]) => ({ v: Number(v), c }))
    .sort((a, b) => b.c - a.c || b.v - a.v);

  const pattern = groups.map(g => g.c).join('');
  const gVals = groups.map(g => g.v);

  if (isFlush && isStraight) {
    const top = isStraight === 'wheel' ? 5 : vals[0];
    return { rank: 8, name: top === 14 ? 'Royal Flush' : 'Straight Flush', tiebreakers: [top] };
  }
  if (pattern === '41') return { rank: 7, name: 'Four of a Kind', tiebreakers: gVals };
  if (pattern === '32') return { rank: 6, name: 'Full House', tiebreakers: gVals };
  if (isFlush) return { rank: 5, name: 'Flush', tiebreakers: vals };
  if (isStraight) {
    const top = isStraight === 'wheel' ? 5 : vals[0];
    return { rank: 4, name: 'Straight', tiebreakers: [top] };
  }
  if (pattern === '311') return { rank: 3, name: 'Three of a Kind', tiebreakers: gVals };
  if (pattern === '221') return { rank: 2, name: 'Two Pair', tiebreakers: gVals };
  if (pattern === '2111') return { rank: 1, name: 'One Pair', tiebreakers: gVals };
  return { rank: 0, name: 'High Card', tiebreakers: vals };
}

function checkStraight(sortedVals) {
  // Normal straight
  let straight = true;
  for (let i = 0; i < 4; i++) {
    if (sortedVals[i] - sortedVals[i + 1] !== 1) { straight = false; break; }
  }
  if (straight) return true;
  // Wheel: A-2-3-4-5
  const wheel = [14, 5, 4, 3, 2];
  if (sortedVals.every((v, i) => v === wheel[i])) return 'wheel';
  return false;
}

function compareScore(a, b) {
  if (a.rank !== b.rank) return a.rank - b.rank;
  for (let i = 0; i < Math.max(a.tiebreakers.length, b.tiebreakers.length); i++) {
    const diff = (a.tiebreakers[i] || 0) - (b.tiebreakers[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

// Returns array of winner seat indices (multiple on tie)
function determineWinners(players, communityCards) {
  const scores = players.map((p, i) => ({
    index: i,
    score: evaluateHand([...p.hand, ...communityCards]),
  }));
  let best = scores[0];
  for (const s of scores) {
    if (compareScore(s.score, best.score) > 0) best = s;
  }
  return scores
    .filter(s => compareScore(s.score, best.score) === 0)
    .map(s => ({ index: s.index, handName: s.score.name }));
}

module.exports = { evaluateHand, determineWinners };
