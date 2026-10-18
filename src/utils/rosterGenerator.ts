import type { Player, CourtGame, Round, RosterData, RosterType, PartnerMode } from '../types';

// ─── Helper keys ─────────────────────────────────────────────────────────────

function pairKey(a: string, b: string): string {
  return [a, b].sort().join('|');
}

function oppKey(a: string, b: string): string {
  return [a, b].sort().join('~');
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── History ──────────────────────────────────────────────────────────────────

interface History {
  pairCount: Map<string, number>;        // times two players partnered
  uniquePartnerCount: Map<string, number>; // distinct partners each player has had
  eligiblePartnerCount: Map<string, number>; // possible partners under this format
  opponentCount: Map<string, number>;    // times two players opposed
  sitOutPairCount: Map<string, number>;  // times two players sat out together
  uniqueSitOutPartnerCount: Map<string, number>; // distinct co-sitters each player has had
  eligibleSitOutPartnerCount: Map<string, number>; // possible co-sitters under this format
  eligibleSitOutPlayerIds: Set<string>; // players who can sit out in this format
  sitOutCount: Map<string, number>;      // times a player sat out
  playCount: Map<string, number>;        // times a player played
  mixedCount: Map<string, number>;       // times a player played in a mixed (♂♀) court
}

function makeSitOutPartnerEligibility(
  players: Player[],
  numCourts: number,
  restrictCrossGender: boolean,
): Map<string, number> {
  const eligible = new Map(players.map(player => [player.id, 0]));
  const totalSitOuts = restrictCrossGender
    ? Math.max(0, players.filter(player => player.gender === 'male').length - numCourts * 2) +
      Math.max(0, players.filter(player => player.gender === 'female').length - numCourts * 2)
    : Math.max(0, players.length - numCourts * 4);
  // A repeat-free co-sit rotation is only feasible when each round contributes
  // one co-sit pair. Larger sit-out groups force pair overlaps before everyone
  // can meet every possible co-sitter.
  if (totalSitOuts !== 2) return eligible;

  if (!restrictCrossGender) {
    for (const player of players) eligible.set(player.id, players.length - 1);
    return eligible;
  }

  const males = players.filter(player => player.gender === 'male');
  const females = players.filter(player => player.gender === 'female');
  const maleSitOuts = Math.max(0, males.length - numCourts * 2);
  const femaleSitOuts = Math.max(0, females.length - numCourts * 2);
  for (const player of players) {
    const sameGender = player.gender === 'male' ? males : females;
    const oppositeGender = player.gender === 'male' ? females : males;
    const ownGenderSitOuts = player.gender === 'male' ? maleSitOuts : femaleSitOuts;
    const oppositeGenderSitOuts = player.gender === 'male' ? femaleSitOuts : maleSitOuts;
    const sameGenderPartners = ownGenderSitOuts >= 2 ? sameGender.length - 1 : 0;
    const oppositeGenderPartners = ownGenderSitOuts > 0 && oppositeGenderSitOuts > 0
      ? oppositeGender.length
      : 0;
    eligible.set(player.id, sameGenderPartners + oppositeGenderPartners);
  }
  return eligible;
}

function makeEligibleSitOutPlayerIds(
  players: Player[],
  numCourts: number,
  restrictCrossGender: boolean,
): Set<string> {
  if (!restrictCrossGender) {
    return players.length > numCourts * 4
      ? new Set(players.map(player => player.id))
      : new Set();
  }

  const eligible = new Set<string>();
  const maleLimit = numCourts * 2;
  const femaleLimit = numCourts * 2;
  const maleCanSit = players.filter(player => player.gender === 'male').length > maleLimit;
  const femaleCanSit = players.filter(player => player.gender === 'female').length > femaleLimit;
  for (const player of players) {
    if ((player.gender === 'male' && maleCanSit) || (player.gender === 'female' && femaleCanSit)) {
      eligible.add(player.id);
    }
  }
  return eligible;
}

function makeHistory(
  players: Player[],
  restrictCrossGender: boolean,
  eligibleSitOutPartnerCount: Map<string, number>,
  eligibleSitOutPlayerIds: Set<string>,
): History {
  const playCount = new Map<string, number>();
  const sitOutCount = new Map<string, number>();
  const mixedCount = new Map<string, number>();
  const uniquePartnerCount = new Map<string, number>();
  const eligiblePartnerCount = new Map<string, number>();
  const uniqueSitOutPartnerCount = new Map<string, number>();
  for (const p of players) {
    playCount.set(p.id, 0);
    sitOutCount.set(p.id, 0);
    mixedCount.set(p.id, 0);
    uniquePartnerCount.set(p.id, 0);
    uniqueSitOutPartnerCount.set(p.id, 0);
    eligiblePartnerCount.set(
      p.id,
      players.filter(other => other.id !== p.id && (!restrictCrossGender || other.gender !== p.gender)).length,
    );
  }
  return {
    pairCount: new Map(),
    uniquePartnerCount,
    eligiblePartnerCount,
    opponentCount: new Map(),
    sitOutPairCount: new Map(),
    uniqueSitOutPartnerCount,
    eligibleSitOutPartnerCount,
    eligibleSitOutPlayerIds,
    sitOutCount,
    playCount,
    mixedCount,
  };
}

function get(map: Map<string, number>, key: string): number {
  return map.get(key) ?? 0;
}

function inc(map: Map<string, number>, key: string): void {
  map.set(key, get(map, key) + 1);
}

// ─── Cost scale constants ────────────────────────────────────────────────────

const PARTNER_REPEAT = 1_000_000_000;
const PARTNER_BACK_TO_BACK = 1e15;
const EARLY_PARTNER_REPEAT = 1e17;
const SIT_OUT_PAIR_REPEAT = 1_000_000_000;
const EARLY_SIT_OUT_PAIR_REPEAT = 1e17;

const OPPONENT_REPEAT = 1;
const OPPONENT_NOT_MET = 100_000;
const OPPONENT_BACK_TO_BACK = 100_000_000;

/** Return candidate sit-out groups so the whole round can prioritize partner coverage. */
function candidateSitOutGroups(
  pool: Player[],
  numSitOut: number,
  history: History,
  prevSitOutIds: Set<string>,
  limit = 64,
): Player[][] {
  if (numSitOut <= 0) return [[]];
  if (numSitOut >= pool.length) return [[...pool]];

  const ranked = shuffle(pool).sort((a, b) => {
    const sa = get(history.sitOutCount, a.id);
    const sb = get(history.sitOutCount, b.id);
    if (sa !== sb) return sa - sb;
    const la = prevSitOutIds.has(a.id) ? 1 : 0;
    const lb = prevSitOutIds.has(b.id) ? 1 : 0;
    return la - lb;
  });

  const groups: Player[][] = [];
  const seen = new Set<string>();
  const add = (group: Player[]) => {
    const key = group.map(p => p.id).sort().join('|');
    if (!seen.has(key)) {
      seen.add(key);
      groups.push([...group]);
    }
  };

  add(ranked.slice(0, numSitOut));
  const choose = (start: number, chosen: Player[]) => {
    if (groups.length >= limit) return;
    if (chosen.length === numSitOut) {
      add(chosen);
      return;
    }
    for (let i = start; i <= pool.length - (numSitOut - chosen.length); i++) {
      choose(i + 1, [...chosen, pool[i]]);
      if (groups.length >= limit) return;
    }
  };

  const combinationCount = (n: number, k: number): number => {
    const count = Math.min(k, n - k);
    let result = 1;
    for (let i = 1; i <= count; i++) result = result * (n - count + i) / i;
    return result;
  };
  if (combinationCount(pool.length, numSitOut) <= limit) {
    groups.length = 0;
    seen.clear();
    choose(0, []);
  } else {
    const attempts = limit * 4;
    for (let attempt = 0; attempt < attempts && groups.length < limit; attempt++) {
      add(shuffle(pool).slice(0, numSitOut));
    }
  }

  return groups.length > 0 ? groups : [ranked.slice(0, numSitOut)];
}

function sitOutFairnessCost(
  sitting: Player[],
  history: History,
  prevSitOutIds: Set<string>,
): number {
  let total = 0;
  for (const player of sitting) {
    total += get(history.sitOutCount, player.id) * PARTNER_REPEAT;
    if (prevSitOutIds.has(player.id)) total += PARTNER_BACK_TO_BACK;
  }
  return total;
}

function earlySitOutRepeatCost(sitting: Player[], history: History): number {
  const unseatedEligiblePlayers = [...history.eligibleSitOutPlayerIds].some(
    id => get(history.sitOutCount, id) === 0,
  );
  if (!unseatedEligiblePlayers) return 0;
  return sitting.reduce(
    (total, player) => total + (get(history.sitOutCount, player.id) > 0 ? 1 : 0),
    0,
  );
}

// ─── Partner cost ─────────────────────────────────────────────────────────────

function partnerCost(
  a: Player,
  b: Player,
  history: History,
  prevPairIds: Set<string>,
): number {
  const key = pairKey(a.id, b.id);
  const count = get(history.pairCount, key);
  let cost = count * count * PARTNER_REPEAT;
  const aHasUnmetPartners = get(history.uniquePartnerCount, a.id) < get(history.eligiblePartnerCount, a.id);
  const bHasUnmetPartners = get(history.uniquePartnerCount, b.id) < get(history.eligiblePartnerCount, b.id);
  if (count > 0 && (aHasUnmetPartners || bHasUnmetPartners)) {
    cost += EARLY_PARTNER_REPEAT;
  }
  if (prevPairIds.has(key)) cost += PARTNER_BACK_TO_BACK;
  return cost;
}

function earlyPartnerRepeatCost(a: Player, b: Player, history: History): number {
  const count = get(history.pairCount, pairKey(a.id, b.id));
  if (count === 0) return 0;
  const aHasUnmetPartners = get(history.uniquePartnerCount, a.id) < get(history.eligiblePartnerCount, a.id);
  const bHasUnmetPartners = get(history.uniquePartnerCount, b.id) < get(history.eligiblePartnerCount, b.id);
  return aHasUnmetPartners || bHasUnmetPartners ? 1 : 0;
}

function matchingEarlyPartnerCost(
  pairs: [Player, Player][],
  history: History,
): number {
  return pairs.reduce((total, [a, b]) => total + earlyPartnerRepeatCost(a, b, history), 0);
}

function compareCostTuple(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

function sitOutGroupCost(sitting: Player[], history: History): number {
  let total = 0;
  for (let i = 0; i < sitting.length; i++) {
    for (let j = i + 1; j < sitting.length; j++) {
      const count = get(history.sitOutPairCount, pairKey(sitting[i].id, sitting[j].id));
      total += count * count * SIT_OUT_PAIR_REPEAT;
    }
  }
  return total;
}

function earlySitOutGroupRepeatCost(sitting: Player[], history: History): number {
  let total = 0;
  for (let i = 0; i < sitting.length; i++) {
    for (let j = i + 1; j < sitting.length; j++) {
      const a = sitting[i];
      const b = sitting[j];
      const key = pairKey(a.id, b.id);
      const count = get(history.sitOutPairCount, key);
      const aHasUnmetCoSitters = get(history.uniqueSitOutPartnerCount, a.id) < get(history.eligibleSitOutPartnerCount, a.id);
      const bHasUnmetCoSitters = get(history.uniqueSitOutPartnerCount, b.id) < get(history.eligibleSitOutPartnerCount, b.id);
      if (count > 0 && (aHasUnmetCoSitters || bHasUnmetCoSitters)) {
        total += EARLY_SIT_OUT_PAIR_REPEAT;
      }
    }
  }
  return total;
}

// ─── Optimal min-cost bipartite matching (Hungarian algorithm) ────────────────

function hungarian(cost: number[][]): number[] {
  const n = cost.length;
  if (n === 0) return [];
  const INF = Number.POSITIVE_INFINITY;
  const u = new Array(n + 1).fill(0);
  const v = new Array(n + 1).fill(0);
  const p = new Array(n + 1).fill(0);
  const way = new Array(n + 1).fill(0);

  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(n + 1).fill(INF);
    const used = new Array(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = INF;
      let j1 = -1;
      for (let j = 1; j <= n; j++) {
        if (!used[j]) {
          const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < minv[j]) {
            minv[j] = cur;
            way[j] = j0;
          }
          if (minv[j] < delta) {
            delta = minv[j];
            j1 = j;
          }
        }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }

  const rowMatch = new Array(n).fill(-1);
  for (let j = 1; j <= n; j++) {
    if (p[j] > 0) rowMatch[p[j] - 1] = j - 1;
  }
  return rowMatch;
}

// ─── Generic optimal min-cost perfect matching (bitmask DP) ───────────────────

function minCostMatchingIndices(cost: number[][]): [number, number][] {
  const n = cost.length;
  if (n === 0) return [];

  if (n <= 16) {
    const full = (1 << n) - 1;
    const dp = new Float64Array(1 << n).fill(Infinity);
    const choice = new Int32Array(1 << n).fill(-1);
    dp[0] = 0;
    for (let mask = 0; mask <= full; mask++) {
      if (dp[mask] === Infinity) continue;
      let i = -1;
      for (let k = 0; k < n; k++) {
        if (!(mask & (1 << k))) { i = k; break; }
      }
      if (i === -1) continue;
      for (let j = i + 1; j < n; j++) {
        if (mask & (1 << j)) continue;
        const nextMask = mask | (1 << i) | (1 << j);
        const cand = dp[mask] + cost[i][j];
        if (cand < dp[nextMask]) {
          dp[nextMask] = cand;
          choice[nextMask] = (i << 8) | j;
        }
      }
    }

    const matches: [number, number][] = [];
    let mask = full;
    while (mask > 0) {
      const enc = choice[mask];
      if (enc < 0) break;
      const i = enc >> 8;
      const j = enc & 0xff;
      matches.push([i, j]);
      mask &= ~((1 << i) | (1 << j));
    }
    return matches;
  }

  // Greedy fallback for very large node counts.
  const remaining = Array.from({ length: n }, (_, i) => i);
  const matches: [number, number][] = [];
  while (remaining.length >= 2) {
    let bestX = 0, bestY = 1, bestCost = Infinity;
    for (let x = 0; x < remaining.length; x++) {
      for (let y = x + 1; y < remaining.length; y++) {
        const c = cost[remaining[x]][remaining[y]];
        if (c < bestCost) {
          bestCost = c;
          bestX = x;
          bestY = y;
        }
      }
    }
    matches.push([remaining[bestX], remaining[bestY]]);
    remaining.splice(bestY, 1);
    remaining.splice(bestX, 1);
  }
  return matches;
}

// ─── Candidate partner matchings ─────────────────────────────────────────────

const CANDIDATE_ATTEMPTS = 200;

function matchingPartnerCost(
  pairs: [Player, Player][],
  history: History,
  prevPairIds: Set<string>,
): number {
  let total = 0;
  for (const [a, b] of pairs) total += partnerCost(a, b, history, prevPairIds);
  return total;
}

function candidatePartnerMatchings(
  playing: Player[],
  history: History,
  prevPairIds: Set<string>,
  restrictCrossGender: boolean,
  attempts = CANDIDATE_ATTEMPTS,
): [Player, Player][][] {
  const build = (): [Player, Player][] => {
    if (restrictCrossGender) {
      const males = shuffle(playing.filter(p => p.gender === 'male'));
      const females = shuffle(playing.filter(p => p.gender === 'female'));
      const n = Math.min(males.length, females.length);
      if (n === 0) return [];
      const cost: number[][] = Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) =>
          partnerCost(males[i], females[j], history, prevPairIds),
        ),
      );
      const rowMatch = hungarian(cost);
      const pairs: [Player, Player][] = [];
      for (let i = 0; i < n; i++) {
        const j = rowMatch[i];
        if (j >= 0 && j < females.length) pairs.push([males[i], females[j]]);
      }
      return pairs;
    }

    const pool = shuffle(playing);
    const n = pool.length;
    if (n < 2) return [];
    const c: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const cost = partnerCost(pool[i], pool[j], history, prevPairIds);
        c[i][j] = cost;
        c[j][i] = cost;
      }
    }
    const matches = minCostMatchingIndices(c);
    return matches.map(([i, j]) => [pool[i], pool[j]] as [Player, Player]);
  };

  const candidates: [Player, Player][][] = [];
  let bestEarlyCost = Infinity;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const pairs = build();
    if (pairs.length === 0) continue;
    const earlyCost = matchingEarlyPartnerCost(pairs, history);
    if (earlyCost < bestEarlyCost) {
      bestEarlyCost = earlyCost;
    }
    candidates.push(pairs);
  }

  // Reject only matchings with avoidable early repeats. Among rotations that
  // preserve partner coverage, keep alternatives available to the opponent
  // assignment instead of requiring the same lowest repeat-cost matching.
  const optimal = candidates.filter(
    pairs => matchingEarlyPartnerCost(pairs, history) === bestEarlyCost,
  );

  return optimal.length > 0 ? optimal : candidates;
}

// ─── Court / opponent assignment ───────────────────────────────────────────

function matchupCost(
  pairA: [Player, Player],
  pairB: [Player, Player],
  history: History,
  prevOppIds: Set<string>,
): number {
  let cost = 0;
  for (const a of pairA) {
    for (const b of pairB) {
      const key = oppKey(a.id, b.id);
      const count = get(history.opponentCount, key);
      if (count > 0) cost += count * count * OPPONENT_REPEAT;
      if (prevOppIds.has(key)) cost += OPPONENT_BACK_TO_BACK;
    }
  }
  return cost;
}

interface CourtAssignment {
  courts: CourtGame[];
  opponentCost: number;
}

function assignCourts(
  pairs: [Player, Player][],
  numCourts: number,
  history: History,
  prevOppIds: Set<string>,
  players: Player[],
): CourtAssignment {
  const nPairs = pairs.length;
  if (nPairs < 2) return { courts: [], opponentCost: 0 };

  const cost: number[][] = Array.from({ length: nPairs }, () =>
    new Array(nPairs).fill(0),
  );
  for (let i = 0; i < nPairs; i++) {
    for (let j = i + 1; j < nPairs; j++) {
      const c = matchupCost(pairs[i], pairs[j], history, prevOppIds);
      cost[i][j] = c;
      cost[j][i] = c;
    }
  }

  const matches = minCostMatchingIndices(cost);

  const games = matches
    .map(([i, j]) => ({ i, j, cost: cost[i][j] }))
    .sort((a, b) => a.cost - b.cost);

  const courts: CourtGame[] = [];
  let courtNumber = 1;
  let opponentCost = 0;
  for (const g of games) {
    if (courts.length >= numCourts) break;
    const pairA = pairs[g.i];
    const pairB = pairs[g.j];
    opponentCost += g.cost;
    courts.push({
      courtNumber: courtNumber++,
      team1: [pairA[0], pairA[1]],
      team2: [pairB[0], pairB[1]],
    });
  }

  const metThisRound = new Set<string>();
  for (const court of courts) {
    for (const a of court.team1) {
      for (const b of court.team2) {
        metThisRound.add(oppKey(a.id, b.id));
      }
    }
  }
  const n = players.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const key = oppKey(players[i].id, players[j].id);
      if (get(history.opponentCount, key) === 0 && !metThisRound.has(key)) {
        opponentCost += OPPONENT_NOT_MET;
      }
    }
  }

  return { courts, opponentCost };
}

// ─── Generate one HYBRID round ────────────────────────────────────────────────

function generateHybridRound(
  players: Player[],
  numCourts: number,
  history: History,
  prevSittingOut: Player[],
  prevPairIds: Set<string>,
  prevOppIds: Set<string>,
): RoundResult {
  const prevSitOutIds = new Set(prevSittingOut.map(p => p.id));

  const males = players.filter(p => p.gender === 'male');
  const females = players.filter(p => p.gender === 'female');

  const maxMixedByGender = Math.min(
    Math.floor(males.length / 2),
    Math.floor(females.length / 2),
  );
  const mixedCourts = Math.min(numCourts, maxMixedByGender);

  const mixedMaleNeed = mixedCourts * 2;
  const mixedFemaleNeed = mixedCourts * 2;

  // Rank players for mixed-court selection:
      // Primary: fewer sit-outs → gets the playing slot first (rotation fairness)
      // Secondary: fewer mixed games → gets the mixed slot first
  // Tertiary: sat out last round → play this round
  const rankForMixed = (pool: Player[]): Player[] =>
    shuffle(pool).sort((a, b) => {
      const sa = get(history.sitOutCount, a.id);
      const sb = get(history.sitOutCount, b.id);
      if (sa !== sb) return sb - sa;          // more sit-outs first → gets to play
      const ma = get(history.mixedCount, a.id);
      const mb = get(history.mixedCount, b.id);
      if (ma !== mb) return ma - mb;          // fewer mixed games first → gets mixed slot
      const la = prevSitOutIds.has(a.id) ? 1 : 0;
      const lb = prevSitOutIds.has(b.id) ? 1 : 0;
      return lb - la;                          // sat out last round → play this round
    });

  const rankedMales = rankForMixed(males);
  const rankedFemales = rankForMixed(females);

  const mixedMales = rankedMales.slice(0, mixedMaleNeed);
  const mixedFemales = rankedFemales.slice(0, mixedFemaleNeed);
  const leftoverMales = rankedMales.slice(mixedMaleNeed);
  const leftoverFemales = rankedFemales.slice(mixedFemaleNeed);

  const courts: CourtGame[] = [];
  const seated = new Set<string>();

  if (mixedCourts > 0) {
    const mixedPlaying = [...mixedMales, ...mixedFemales];
    const candidates = candidatePartnerMatchings(
      mixedPlaying,
      history,
      prevPairIds,
      true,
    );
    let bestCourts: CourtGame[] = [];
    let bestCost = Infinity;
    for (const pairs of candidates) {
      const { courts: c, opponentCost } = assignCourts(
        pairs, mixedCourts, history, prevOppIds, players,
      );
      if (opponentCost < bestCost) { bestCost = opponentCost; bestCourts = c; }
    }
    for (const court of bestCourts) {
      courts.push(court);
      for (const p of [...court.team1, ...court.team2]) seated.add(p.id);
    }
  }

  const remainingCourts = numCourts - courts.length;
  if (remainingCourts > 0) {
    const leftovers = [...leftoverMales, ...leftoverFemales].filter(
      p => !seated.has(p.id),
    );
    const usableCourts = Math.min(remainingCourts, Math.floor(leftovers.length / 4));
    if (usableCourts > 0) {
      const sitOutGroups = candidateSitOutGroups(
        leftovers,
        leftovers.length - usableCourts * 4,
        history,
        prevSitOutIds,
      );
      let bestCourts: CourtGame[] = [];
      let bestCandidateCost: number[] | null = null;
      const matchAttempts = Math.max(1, Math.floor(CANDIDATE_ATTEMPTS / sitOutGroups.length));
      for (const sitting of sitOutGroups) {
        const sittingIds = new Set(sitting.map(p => p.id));
        const genderPlaying = leftovers.filter(p => !sittingIds.has(p.id));
        const candidates = candidatePartnerMatchings(
          genderPlaying,
          history,
          prevPairIds,
          false,
          matchAttempts,
        );
        const earlyCoSitCost = earlySitOutGroupRepeatCost(sitting, history);
        const coSitCost = sitOutGroupCost(sitting, history);
        const individualSitOutCost = sitOutFairnessCost(sitting, history, prevSitOutIds);
        const earlySitOutCost = earlySitOutRepeatCost(sitting, history);
        for (const pairs of candidates) {
          const earlyCost = matchingEarlyPartnerCost(pairs, history);
          const partnerCost = matchingPartnerCost(pairs, history, prevPairIds);
          const { courts: c, opponentCost } = assignCourts(
            pairs, usableCourts, history, prevOppIds, players,
          );
          const candidateCost = [earlySitOutCost, earlyCoSitCost, earlyCost, individualSitOutCost, coSitCost, opponentCost, partnerCost];
          if (bestCandidateCost === null || compareCostTuple(candidateCost, bestCandidateCost) < 0) {
            bestCandidateCost = candidateCost;
            bestCourts = c;
          }
        }
      }
      let n = courts.length + 1;
      for (const court of bestCourts) {
        courts.push({ ...court, courtNumber: n++ });
        for (const p of [...court.team1, ...court.team2]) seated.add(p.id);
      }
    }
  }

  const sitting = players.filter(p => !seated.has(p.id));
  return { courts, sittingOut: sitting };
}

// ─── Generate one round ───────────────────────────────────────────────────────

interface RoundResult {
  courts: CourtGame[];
  sittingOut: Player[];
}

function generateOneRound(
  players: Player[],
  numCourts: number,
  history: History,
  isMixed: boolean,
  allowSameGender: boolean,
  prevSittingOut: Player[],
  prevPairIds: Set<string>,
  prevOppIds: Set<string>,
): RoundResult {
  const prevSitOutIds = new Set(prevSittingOut.map(p => p.id));
  const restrictCrossGender = isMixed && !allowSameGender;
  let sitOutCandidates: Player[][];

  if (restrictCrossGender) {
    const males = players.filter(p => p.gender === 'male');
    const females = players.filter(p => p.gender === 'female');
    const maleSitOut = Math.max(0, males.length - numCourts * 2);
    const femaleSitOut = Math.max(0, females.length - numCourts * 2);
    const maleGroups = candidateSitOutGroups(males, maleSitOut, history, prevSitOutIds);
    const femaleGroups = candidateSitOutGroups(females, femaleSitOut, history, prevSitOutIds);
    const combinations = maleGroups.length * femaleGroups.length;
    const limit = 64;
    sitOutCandidates = [];
    if (combinations <= limit) {
      for (const maleGroup of maleGroups) {
        for (const femaleGroup of femaleGroups) {
          sitOutCandidates.push([...maleGroup, ...femaleGroup]);
        }
      }
    } else {
      // Keep the fairest sit-out choice represented when the gender-specific
      // candidate sets are too large to enumerate as a full cartesian product.
      sitOutCandidates.push([...maleGroups[0], ...femaleGroups[0]]);
      for (let i = 1; i < limit; i++) {
        sitOutCandidates.push([
          ...maleGroups[Math.floor(Math.random() * maleGroups.length)],
          ...femaleGroups[Math.floor(Math.random() * femaleGroups.length)],
        ]);
      }
    }
  } else {
    const numSitOut = Math.max(0, players.length - numCourts * 4);
    sitOutCandidates = candidateSitOutGroups(players, numSitOut, history, prevSitOutIds);
  }

  const matchAttempts = Math.max(1, Math.floor(CANDIDATE_ATTEMPTS / sitOutCandidates.length));
  let bestCourts: CourtGame[] = [];
  let bestSitting: Player[] = [];
  let bestCandidateCost: number[] | null = null;

  for (const sitting of sitOutCandidates) {
    const sittingIds = new Set(sitting.map(p => p.id));
    const playing = players.filter(p => !sittingIds.has(p.id));
    const candidates = candidatePartnerMatchings(
      playing,
      history,
      prevPairIds,
      restrictCrossGender,
      matchAttempts,
    );
    const earlyCoSitCost = earlySitOutGroupRepeatCost(sitting, history);
    const coSitCost = sitOutGroupCost(sitting, history);
    const individualSitOutCost = sitOutFairnessCost(sitting, history, prevSitOutIds);
    const earlySitOutCost = earlySitOutRepeatCost(sitting, history);

    for (const pairs of candidates) {
      const earlyCost = matchingEarlyPartnerCost(pairs, history);
      const partnerCost = matchingPartnerCost(pairs, history, prevPairIds);
      const { courts, opponentCost } = assignCourts(
        pairs,
        numCourts,
        history,
        prevOppIds,
        players,
      );
      const candidateCost = [earlySitOutCost, earlyCoSitCost, earlyCost, individualSitOutCost, coSitCost, opponentCost, partnerCost];
      if (bestCandidateCost === null || compareCostTuple(candidateCost, bestCandidateCost) < 0) {
        bestCandidateCost = candidateCost;
        bestCourts = courts;
        bestSitting = sitting;
      }
    }
  }

  const courts = bestCourts;

  const seated = new Set<string>();
  for (const court of courts) {
    for (const p of [...court.team1, ...court.team2]) seated.add(p.id);
  }
  const extraSit = players.filter(p => !seated.has(p.id) && !bestSitting.some(sit => sit.id === p.id));
  if (extraSit.length > 0) bestSitting = [...bestSitting, ...extraSit];

  return { courts, sittingOut: bestSitting };
}

// ─── History update ────────────────────────────────────────────────────────

function updateHistory(
  courts: CourtGame[],
  sittingOut: Player[],
  history: History,
): void {
  for (const court of courts) {
    const all = [...court.team1, ...court.team2];
    for (const p of all) inc(history.playCount, p.id);

    // Track mixed-court participation: increment mixedCount for all players
    // in any court that has at least one male and one female player.
    const isMixedCourt =
      all.some(p => p.gender === 'male') && all.some(p => p.gender === 'female');
    if (isMixedCourt) {
      for (const p of all) inc(history.mixedCount, p.id);
    }

    for (const team of [court.team1, court.team2]) {
      for (let i = 0; i < team.length; i++) {
        for (let j = i + 1; j < team.length; j++) {
          const key = pairKey(team[i].id, team[j].id);
          if (get(history.pairCount, key) === 0) {
            inc(history.uniquePartnerCount, team[i].id);
            inc(history.uniquePartnerCount, team[j].id);
          }
          inc(history.pairCount, key);
        }
      }
    }

    for (const a of court.team1) {
      for (const b of court.team2) {
        inc(history.opponentCount, oppKey(a.id, b.id));
      }
    }
  }

  for (let i = 0; i < sittingOut.length; i++) {
    for (let j = i + 1; j < sittingOut.length; j++) {
      const a = sittingOut[i];
      const b = sittingOut[j];
      const key = pairKey(a.id, b.id);
      if (get(history.sitOutPairCount, key) === 0) {
        inc(history.uniqueSitOutPartnerCount, a.id);
        inc(history.uniqueSitOutPartnerCount, b.id);
      }
      inc(history.sitOutPairCount, key);
    }
  }

  for (const p of sittingOut) inc(history.sitOutCount, p.id);
}

// ─── Validate setup ───────────────────────────────────────────────────────────

export function validateSetup(
  players: Player[],
  numCourts: number,
  rosterType: RosterType,
  allowSameGender = false,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (rosterType === 'mixed') {
    if (allowSameGender) {
      if (players.length < numCourts * 4) {
        errors.push(
          `Need at least ${numCourts * 4} players for ${numCourts} court${numCourts > 1 ? 's' : ''} (have ${players.length}).`,
        );
      }
    } else {
      const males = players.filter(p => p.gender === 'male').length;
      const females = players.filter(p => p.gender === 'female').length;
      if (males < numCourts * 2) {
        errors.push(
          `Need at least ${numCourts * 2} male players for ${numCourts} court${numCourts > 1 ? 's' : ''} (have ${males}).`,
        );
      }
      if (females < numCourts * 2) {
        errors.push(
          `Need at least ${numCourts * 2} female players for ${numCourts} court${numCourts > 1 ? 's' : ''} (have ${females}).`,
        );
      }
    }
  } else {
    if (players.length < numCourts * 4) {
      errors.push(
        `Need at least ${numCourts * 4} players for ${numCourts} court${numCourts > 1 ? 's' : ''} (have ${players.length}).`,
      );
    }
    if (rosterType === 'fixed' && players.length % 2 !== 0) {
      errors.push('Fixed Partner mode requires an even number of players so everyone has a partner.');
    }
  }

  return { valid: errors.length === 0, errors };
}

function hybridCanUseGenderCourt(players: Player[], numCourts: number): boolean {
  const males = players.filter(p => p.gender === 'male').length;
  const females = players.filter(p => p.gender === 'female').length;
  const mixedCourts = Math.min(numCourts, Math.floor(males / 2), Math.floor(females / 2));
  const remainingCourts = numCourts - mixedCourts;
  const leftovers = players.length - mixedCourts * 4;
  return remainingCourts > 0 && Math.floor(leftovers / 4) > 0;
}

interface ScheduleQuality {
  earlySitOutRepeats: number;
  earlyPartnerRepeats: number;
  earlySitOutPairRepeats: number;
  sitOutPairRepeats: number;
  partnerRepeatCost: number;
  sitOutSpread: number;
  backToBackSitOuts: number;
  opponentCost: number;
}

interface PartnerRotationRound {
  pairs: [Player, Player][];
  sittingOut: Player[];
}

/** Start a five-player, single-court game with a complete partner rotation. */
function fivePlayerPartnerRotation(players: Player[]): PartnerRotationRound[] {
  const ring: (Player | null)[] = [...shuffle(players), null];
  const rounds: PartnerRotationRound[] = [];

  for (let round = 0; round < players.length; round++) {
    const pairs: [Player, Player][] = [];
    let sittingOut: Player[] = [];
    for (let i = 0; i < ring.length / 2; i++) {
      const a = ring[i];
      const b = ring[ring.length - 1 - i];
      if (a === null || b === null) {
        sittingOut = [a ?? b!];
      } else {
        pairs.push([a, b]);
      }
    }
    rounds.push({ pairs, sittingOut });

    const last = ring.pop()!;
    ring.splice(1, 0, last);
  }

  return rounds;
}

function fivePlayerRotationSignature(rounds: PartnerRotationRound[]): string {
  return JSON.stringify(rounds.map(round => ({
    courts: [round.pairs.map(pair => pair.map(player => player.id).sort().join('|')).sort().join('::')],
    sitting: round.sittingOut.map(player => player.id).sort(),
  })));
}

function scoreSchedule(
  rounds: Round[],
  players: Player[],
  eligiblePartnerCount: Map<string, number>,
  eligibleSitOutPartnerCount: Map<string, number>,
  eligibleSitOutPlayerIds: Set<string>,
): ScheduleQuality {
  const partnerCounts = new Map<string, number>();
  const partnerSeen = new Map<string, Set<string>>();
  const sitOutPairCounts = new Map<string, number>();
  const sitOutPartnerSeen = new Map<string, Set<string>>();
  const sitOutCounts = new Map<string, number>();
  const opponentCounts = new Map<string, number>();
  const previouslySitting = new Set<string>();
  let previouslyPartnered = new Set<string>();
  let earlySitOutRepeats = 0;
  let earlyPartnerRepeats = 0;
  let earlySitOutPairRepeats = 0;
  let sitOutPairRepeats = 0;
  let partnerRepeatCost = 0;
  let backToBackSitOuts = 0;
  let opponentCost = 0;
  let previousOpponents = new Set<string>();

  for (const player of players) {
    partnerSeen.set(player.id, new Set());
    sitOutPartnerSeen.set(player.id, new Set());
    sitOutCounts.set(player.id, 0);
  }

  for (const round of rounds) {
    const currentSitting = new Set(round.sittingOut.map(p => p.id));
    const hasUnseatedEligiblePlayer = [...eligibleSitOutPlayerIds].some(
      id => get(sitOutCounts, id) === 0,
    );
    for (const player of round.sittingOut) {
      if (get(sitOutCounts, player.id) > 0 && hasUnseatedEligiblePlayer) earlySitOutRepeats++;
      inc(sitOutCounts, player.id);
      if (previouslySitting.has(player.id)) backToBackSitOuts++;
    }
    for (let i = 0; i < round.sittingOut.length; i++) {
      for (let j = i + 1; j < round.sittingOut.length; j++) {
        const a = round.sittingOut[i];
        const b = round.sittingOut[j];
        const key = pairKey(a.id, b.id);
        const count = get(sitOutPairCounts, key);
        const aPartners = sitOutPartnerSeen.get(a.id)!;
        const bPartners = sitOutPartnerSeen.get(b.id)!;
        if (count > 0) {
          sitOutPairRepeats++;
          if (
            aPartners.size < get(eligibleSitOutPartnerCount, a.id) ||
            bPartners.size < get(eligibleSitOutPartnerCount, b.id)
          ) {
            earlySitOutPairRepeats++;
          }
        }
        aPartners.add(b.id);
        bPartners.add(a.id);
        inc(sitOutPairCounts, key);
      }
    }

    const metThisRound = new Set<string>();
    for (const court of round.courts) {
      for (const team of [court.team1, court.team2]) {
        for (let i = 0; i < team.length; i++) {
          for (let j = i + 1; j < team.length; j++) {
            const a = team[i];
            const b = team[j];
            const key = pairKey(a.id, b.id);
            const count = get(partnerCounts, key);
            const aPartners = partnerSeen.get(a.id)!;
            const bPartners = partnerSeen.get(b.id)!;
            if (count > 0 && (
              aPartners.size < get(eligiblePartnerCount, a.id) ||
              bPartners.size < get(eligiblePartnerCount, b.id)
            )) {
              earlyPartnerRepeats++;
            }
            if (previouslyPartnered.has(key)) partnerRepeatCost += PARTNER_BACK_TO_BACK;
            aPartners.add(b.id);
            bPartners.add(a.id);
            inc(partnerCounts, key);
          }
        }
      }
      for (const a of court.team1) {
        for (const b of court.team2) {
          const key = oppKey(a.id, b.id);
          const count = get(opponentCounts, key);
          if (count > 0) opponentCost += count * count * OPPONENT_REPEAT;
          if (previousOpponents.has(key)) opponentCost += OPPONENT_BACK_TO_BACK;
          metThisRound.add(key);
        }
      }
    }

    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const key = oppKey(players[i].id, players[j].id);
        if (get(opponentCounts, key) === 0 && !metThisRound.has(key)) {
          opponentCost += OPPONENT_NOT_MET;
        }
      }
    }
    for (const key of metThisRound) inc(opponentCounts, key);

    const currentPartners = new Set<string>();
    for (const court of round.courts) {
      for (const team of [court.team1, court.team2]) {
        for (let i = 0; i < team.length; i++) {
          for (let j = i + 1; j < team.length; j++) currentPartners.add(pairKey(team[i].id, team[j].id));
        }
      }
    }
    previouslyPartnered = currentPartners;
    previousOpponents = metThisRound;
    previouslySitting.clear();
    for (const id of currentSitting) previouslySitting.add(id);
  }

  for (const count of partnerCounts.values()) partnerRepeatCost += count * count * PARTNER_REPEAT;
  const sitCounts = [...sitOutCounts.values()];
  const sitOutSpread = sitCounts.length ? Math.max(...sitCounts) - Math.min(...sitCounts) : 0;

  return {
    earlySitOutRepeats,
    earlyPartnerRepeats,
    earlySitOutPairRepeats,
    sitOutPairRepeats,
    partnerRepeatCost,
    sitOutSpread,
    backToBackSitOuts,
    opponentCost,
  };
}

function compareScheduleQuality(a: ScheduleQuality, b: ScheduleQuality): number {
  return a.earlySitOutRepeats - b.earlySitOutRepeats ||
    a.earlyPartnerRepeats - b.earlyPartnerRepeats ||
    a.earlySitOutPairRepeats - b.earlySitOutPairRepeats ||
    a.sitOutSpread - b.sitOutSpread ||
    a.sitOutPairRepeats - b.sitOutPairRepeats ||
    a.backToBackSitOuts - b.backToBackSitOuts ||
    a.opponentCost - b.opponentCost ||
    a.partnerRepeatCost - b.partnerRepeatCost;
}

/** Identify schedule changes while ignoring team-side flips and court ordering. */
function rotationSignature(rounds: Round[]): string {
  return JSON.stringify(rounds.map(round => {
    const courts = round.courts.map(court => [
      court.team1.map(player => player.id).sort().join('|'),
      court.team2.map(player => player.id).sort().join('|'),
    ].sort().join('::')).sort();
    const sitting = round.sittingOut.map(player => player.id).sort();
    return { courts, sitting };
  }));
}

// ─── Generate roster ──────────────────────────────────────────────────────────

export function generateRoster(
  players: Player[],
  numCourts: number,
  numRounds: number,
  rosterType: RosterType,
  sessionName: string,
  allowSameGender = false,
  partnerMode: PartnerMode = 'strict',
  avoidRoster?: RosterData,
): RosterData {
  if (rosterType === 'fixed') {
    // Pair players in entry order once. Those teams remain intact for every round
    // and each team sits or plays as a unit.
    const teams: [Player, Player][] = [];
    for (let i = 0; i + 1 < players.length; i += 2) teams.push([players[i], players[i + 1]]);
    const allTeams = teams.length;
    const sitCount = Math.max(0, allTeams - numCourts * 2);
    const eligibleSitting = makeEligibleSitOutPlayerIds(players, numCourts, false);
    const eligibleSitPartners = makeSitOutPartnerEligibility(players, numCourts, false);
    const eligiblePartners = makeHistory(players, false, eligibleSitPartners, eligibleSitting).eligiblePartnerCount;
    const attempts = players.length <= 12 ? 12 : 4;
    let best: Round[] = [];
    let bestQuality: ScheduleQuality | null = null;
    const avoidSignature = avoidRoster ? rotationSignature(avoidRoster.rounds) : null;
    let bestDifferent: Round[] | null = null;
    let bestDifferentQuality: ScheduleQuality | null = null;

    for (let attempt = 0; attempt < attempts; attempt++) {
      const history = makeHistory(players, false, eligibleSitPartners, eligibleSitting);
      const rounds: Round[] = [];
      let previousSit = new Set<string>();
      let previousOpp = new Set<string>();
      for (let r = 0; r < numRounds; r++) {
        const ranked = shuffle(teams).sort((a, b) => {
          const sitA = get(history.sitOutCount, a[0].id) + get(history.sitOutCount, a[1].id);
          const sitB = get(history.sitOutCount, b[0].id) + get(history.sitOutCount, b[1].id);
          if (sitA !== sitB) return sitA - sitB;
          const prevA = Number(previousSit.has(a[0].id)) + Number(previousSit.has(a[1].id));
          const prevB = Number(previousSit.has(b[0].id)) + Number(previousSit.has(b[1].id));
          return prevA - prevB;
        });
        const sittingTeams = ranked.slice(0, sitCount);
        const sittingIds = new Set(sittingTeams.flatMap(team => team.map(p => p.id)));
        const sittingOut = players.filter(p => sittingIds.has(p.id));
        const playingTeams = teams.filter(team => !sittingIds.has(team[0].id));
        const courts = assignCourts(playingTeams, numCourts, history, previousOpp, players).courts;
        rounds.push({ roundNumber: r + 1, courts, sittingOut });
        updateHistory(courts, sittingOut, history);
        previousSit = sittingIds;
        previousOpp = new Set();
        for (const court of courts) for (const a of court.team1) for (const b of court.team2) previousOpp.add(oppKey(a.id, b.id));
      }
      const quality = scoreSchedule(rounds, players, eligiblePartners, eligibleSitPartners, eligibleSitting);
      if (avoidSignature && rotationSignature(rounds) !== avoidSignature && (bestDifferentQuality === null || compareScheduleQuality(quality, bestDifferentQuality) < 0)) {
        bestDifferent = rounds;
        bestDifferentQuality = quality;
      }
      if (bestQuality === null || compareScheduleQuality(quality, bestQuality) < 0) {
        best = rounds;
        bestQuality = quality;
      }
    }
    return {
      rounds: bestDifferent ?? best,
      rosterType,
      partnerMode,
      allPlayers: players,
      numCourts,
      sessionName,
      allowSameGender: false,
    };
  }
  const isMixed = rosterType === 'mixed';
  const hybridRequested =
    partnerMode === 'hybrid' &&
    players.some(p => p.gender === 'male') &&
    players.some(p => p.gender === 'female');
  const useHybrid = hybridRequested && hybridCanUseGenderCourt(players, numCourts);
  const mixedOnlyHybrid = hybridRequested && !useHybrid;
  const restrictCrossGender = (isMixed && !allowSameGender) || mixedOnlyHybrid;
  const eligibleSitOutPlayerIds = makeEligibleSitOutPlayerIds(
    players,
    numCourts,
    restrictCrossGender,
  );
  const eligibleSitOutPartnerCount = makeSitOutPartnerEligibility(
    players,
    numCourts,
    restrictCrossGender,
  );
  const eligiblePartnerCount = makeHistory(
    players,
    restrictCrossGender,
    eligibleSitOutPartnerCount,
    eligibleSitOutPlayerIds,
  ).eligiblePartnerCount;
  // Small rosters have a short enough schedule horizon that a few complete
  // rotations can be compared cheaply. This avoids a locally reasonable round
  // choice creating an early repeat later in the same schedule.
  const basePlanningAttempts = players.length <= 5 && numRounds <= 20
    ? 10
    : players.length <= 12 && numRounds <= 15
      ? 4
      : 1;
  const variationAttempts = players.length <= 12 ? 8 : 3;
  const planningAttempts = avoidRoster
    ? Math.max(basePlanningAttempts, variationAttempts)
    : basePlanningAttempts;
  const avoidSignature = avoidRoster ? rotationSignature(avoidRoster.rounds) : null;

  let fivePlayerOpeners =
    players.length === 5 &&
    numCourts === 1 &&
    !restrictCrossGender &&
    !useHybrid
      ? fivePlayerPartnerRotation(players)
      : null;
  if (fivePlayerOpeners && avoidRoster) {
    const previousFirstCycle = rotationSignature(avoidRoster.rounds.slice(0, players.length));
    for (let attempt = 0; attempt < 20 && fivePlayerRotationSignature(fivePlayerOpeners) === previousFirstCycle; attempt++) {
      fivePlayerOpeners = fivePlayerPartnerRotation(players);
    }
  }

  let bestRounds: Round[] = [];
  let bestQuality: ScheduleQuality | null = null;
  let bestAlternativeRounds: Round[] | null = null;
  let bestAlternativeQuality: ScheduleQuality | null = null;

  for (let attempt = 0; attempt < planningAttempts; attempt++) {
    const history = makeHistory(
      players,
      restrictCrossGender,
      eligibleSitOutPartnerCount,
      eligibleSitOutPlayerIds,
    );
    const rounds: Round[] = [];
    let prevSittingOut: Player[] = [];
    let prevPairIds = new Set<string>();
    let prevOppIds = new Set<string>();

    for (let r = 0; r < numRounds; r++) {
      const openingRound = fivePlayerOpeners?.[r];
      const { courts, sittingOut } = openingRound
        ? {
            courts: assignCourts(
              openingRound.pairs,
              numCourts,
              history,
              prevOppIds,
              players,
            ).courts,
            sittingOut: openingRound.sittingOut,
          }
        : useHybrid
          ? generateHybridRound(
            players,
            numCourts,
            history,
            prevSittingOut,
            prevPairIds,
            prevOppIds,
            )
          : generateOneRound(
            players,
            numCourts,
            history,
            isMixed || mixedOnlyHybrid,
            isMixed && allowSameGender,
            prevSittingOut,
            prevPairIds,
            prevOppIds,
            );

      rounds.push({ roundNumber: r + 1, courts, sittingOut });
      updateHistory(courts, sittingOut, history);

      prevSittingOut = sittingOut;
      prevPairIds = new Set<string>();
      prevOppIds = new Set<string>();
      for (const court of courts) {
        for (const team of [court.team1, court.team2]) {
          for (let i = 0; i < team.length; i++) {
            for (let j = i + 1; j < team.length; j++) {
              prevPairIds.add(pairKey(team[i].id, team[j].id));
            }
          }
        }
        for (const a of court.team1) {
          for (const b of court.team2) {
            prevOppIds.add(oppKey(a.id, b.id));
          }
        }
      }
    }

    const quality = scoreSchedule(
      rounds,
      players,
      eligiblePartnerCount,
      eligibleSitOutPartnerCount,
      eligibleSitOutPlayerIds,
    );
    if (avoidSignature && rotationSignature(rounds) !== avoidSignature && (
      bestAlternativeQuality === null || compareScheduleQuality(quality, bestAlternativeQuality) < 0
    )) {
      bestAlternativeRounds = rounds;
      bestAlternativeQuality = quality;
    }
    if (bestQuality === null || compareScheduleQuality(quality, bestQuality) < 0) {
      bestRounds = rounds;
      bestQuality = quality;
    }
  }

  return {
    rounds: bestAlternativeRounds ?? bestRounds,
    rosterType,
    partnerMode,
    allPlayers: players,
    numCourts,
    sessionName,
    allowSameGender,
  };
}

// ─── Roster verification (for tests & diagnostics) ──────────────────────────

export interface RosterStats {
  partnerCounts: Map<string, number>;
  opponentCounts: Map<string, number>;
  sitOutCounts: Map<string, number>;
  playCounts: Map<string, number>;

  partnerMin: number;
  partnerMax: number;
  partnerSpread: number;

  opponentMin: number;
  opponentMax: number;
  opponentSpread: number;

  sitOutMin: number;
  sitOutMax: number;
  sitOutSpread: number;

  backToBackSitOut: string[];
  backToBackPartner: string[];
  backToBackOpponent: string[];
}

export function verifyRoster(
  data: RosterData,
  eligiblePairKeys?: Set<string>,
  eligibleOppKeys?: Set<string>,
): RosterStats {
  const partnerCounts = new Map<string, number>();
  const opponentCounts = new Map<string, number>();
  const sitOutCounts = new Map<string, number>();
  const playCounts = new Map<string, number>();

  for (const p of data.allPlayers) {
    sitOutCounts.set(p.id, 0);
    playCounts.set(p.id, 0);
  }

  const backToBackSitOut: string[] = [];
  const backToBackPartner: string[] = [];
  const backToBackOpponent: string[] = [];

  let prevSitOut = new Set<string>();
  let prevPartners = new Set<string>();
  let prevOpps = new Set<string>();

  for (const round of data.rounds) {
    const curSitOut = new Set<string>();
    const curPartners = new Set<string>();
    const curOpps = new Set<string>();

    for (const p of round.sittingOut) {
      curSitOut.add(p.id);
      inc(sitOutCounts, p.id);
      if (prevSitOut.has(p.id)) backToBackSitOut.push(p.id);
    }

    for (const court of round.courts) {
      const all = [...court.team1, ...court.team2];
      for (const p of all) inc(playCounts, p.id);

      for (const team of [court.team1, court.team2]) {
        for (let i = 0; i < team.length; i++) {
          for (let j = i + 1; j < team.length; j++) {
            const key = pairKey(team[i].id, team[j].id);
            inc(partnerCounts, key);
            curPartners.add(key);
            if (prevPartners.has(key)) backToBackPartner.push(key);
          }
        }
      }

      for (const a of court.team1) {
        for (const b of court.team2) {
          const key = oppKey(a.id, b.id);
          inc(opponentCounts, key);
          curOpps.add(key);
          if (prevOpps.has(key)) backToBackOpponent.push(key);
        }
      }
    }

    prevSitOut = curSitOut;
    prevPartners = curPartners;
    prevOpps = curOpps;
  }

  const spread = (
    counts: Map<string, number>,
    eligible?: Set<string>,
  ): [number, number] => {
    let min = Infinity;
    let max = 0;
    if (eligible && eligible.size > 0) {
      for (const key of eligible) {
        const v = counts.get(key) ?? 0;
        if (v < min) min = v;
        if (v > max) max = v;
      }
    } else {
      for (const v of counts.values()) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    if (min === Infinity) min = 0;
    return [min, max];
  };

  const [partnerMin, partnerMax] = spread(partnerCounts, eligiblePairKeys);
  const [opponentMin, opponentMax] = spread(opponentCounts, eligibleOppKeys);

  let sitOutMin = Infinity;
  let sitOutMax = 0;
  for (const v of sitOutCounts.values()) {
    if (v < sitOutMin) sitOutMin = v;
    if (v > sitOutMax) sitOutMax = v;
  }
  if (sitOutMin === Infinity) sitOutMin = 0;

  return {
    partnerCounts,
    opponentCounts,
    sitOutCounts,
    playCounts,
    partnerMin,
    partnerMax,
    partnerSpread: partnerMax - partnerMin,
    opponentMin,
    opponentMax,
    opponentSpread: opponentMax - opponentMin,
    sitOutMin,
    sitOutMax,
    sitOutSpread: sitOutMax - sitOutMin,
    backToBackSitOut,
    backToBackPartner,
    backToBackOpponent,
  };
}
