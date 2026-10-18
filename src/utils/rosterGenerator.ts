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
  eligiblePartnerIds: Map<string, Set<string>>;
  minimumPartnerCount: Map<string, number>;
  opponentCount: Map<string, number>;    // times two players opposed
  eligibleOpponentIds: Map<string, Set<string>>;
  minimumOpponentCount: Map<string, number>;
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
  eligiblePartnerIds?: Map<string, Set<string>>,
  eligibleOpponentIds?: Map<string, Set<string>>,
): History {
  const playCount = new Map<string, number>();
  const sitOutCount = new Map<string, number>();
  const mixedCount = new Map<string, number>();
  const uniquePartnerCount = new Map<string, number>();
  const partnerEligibility = eligiblePartnerIds ?? new Map(players.map(player => [
    player.id,
    new Set(players
      .filter(other => other.id !== player.id && (!restrictCrossGender || other.gender !== player.gender))
      .map(other => other.id)),
  ]));
  const opponentEligibility = eligibleOpponentIds ?? new Map(players.map(player => [
    player.id,
    new Set(players.filter(other => other.id !== player.id).map(other => other.id)),
  ]));
  const eligiblePartnerCount = new Map<string, number>();
  const uniqueSitOutPartnerCount = new Map<string, number>();
  for (const p of players) {
    playCount.set(p.id, 0);
    sitOutCount.set(p.id, 0);
    mixedCount.set(p.id, 0);
    uniquePartnerCount.set(p.id, 0);
    uniqueSitOutPartnerCount.set(p.id, 0);
    eligiblePartnerCount.set(p.id, partnerEligibility.get(p.id)?.size ?? 0);
  }
  return {
    pairCount: new Map(),
    uniquePartnerCount,
    eligiblePartnerCount,
    eligiblePartnerIds: partnerEligibility,
    minimumPartnerCount: new Map(players.map(player => [
      player.id,
      partnerEligibility.get(player.id)?.size ? 0 : Number.POSITIVE_INFINITY,
    ])),
    opponentCount: new Map(),
    eligibleOpponentIds: opponentEligibility,
    minimumOpponentCount: new Map(players.map(player => [
      player.id,
      opponentEligibility.get(player.id)?.size ? 0 : Number.POSITIVE_INFINITY,
    ])),
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

function relationshipCycleComplete(
  playerId: string,
  targetCount: number,
  relationCounts: Map<string, number>,
  eligibleIds: Map<string, Set<string>>,
  makeKey: (a: string, b: string) => string,
  currentRoundLinks?: Map<string, Set<string>>,
  minimumCounts?: Map<string, number>,
): boolean {
  const currentLinks = currentRoundLinks?.get(playerId);
  if (!currentLinks?.size && minimumCounts && get(minimumCounts, playerId) >= targetCount) {
    return true;
  }
  for (const otherId of eligibleIds.get(playerId) ?? []) {
    const count = get(relationCounts, makeKey(playerId, otherId)) +
      Number(currentLinks?.has(otherId) ?? false);
    if (count < targetCount) return false;
  }
  return true;
}

function earlyOpponentRepeatCost(
  opponentPairs: [Player, Player][],
  opponentCounts: Map<string, number>,
  eligibleOpponentIds: Map<string, Set<string>>,
  minimumOpponentCount?: Map<string, number>,
): number {
  const linksByPlayer = new Map<string, Set<string>>();
  for (const [a, b] of opponentPairs) {
    if (!linksByPlayer.has(a.id)) linksByPlayer.set(a.id, new Set());
    if (!linksByPlayer.has(b.id)) linksByPlayer.set(b.id, new Set());
    linksByPlayer.get(a.id)!.add(b.id);
    linksByPlayer.get(b.id)!.add(a.id);
  }

  let total = 0;
  const seenPairs = new Set<string>();
  for (const [a, b] of opponentPairs) {
    const key = oppKey(a.id, b.id);
    if (seenPairs.has(key)) continue;
    seenPairs.add(key);
    const priorCount = get(opponentCounts, key);
    if (priorCount === 0) continue;
    if (
      !relationshipCycleComplete(a.id, priorCount, opponentCounts, eligibleOpponentIds, oppKey, linksByPlayer, minimumOpponentCount) ||
      !relationshipCycleComplete(b.id, priorCount, opponentCounts, eligibleOpponentIds, oppKey, linksByPlayer, minimumOpponentCount)
    ) {
      total++;
    }
  }
  return total;
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

  // Treat consecutive sit-outs as a hard constraint whenever the round has
  // enough other players to fill all sit-out places. Filtering before sampling
  // also prevents a capped candidate list from accidentally omitting a valid
  // no-repeat rotation.
  const availableWithoutRepeat = pool.filter(player => !prevSitOutIds.has(player.id));
  const candidatePool = availableWithoutRepeat.length >= numSitOut
    ? availableWithoutRepeat
    : pool;

  const ranked = shuffle(candidatePool).sort((a, b) => {
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
    for (let i = start; i <= candidatePool.length - (numSitOut - chosen.length); i++) {
      choose(i + 1, [...chosen, candidatePool[i]]);
      if (groups.length >= limit) return;
    }
  };

  const combinationCount = (n: number, k: number): number => {
    const count = Math.min(k, n - k);
    let result = 1;
    for (let i = 1; i <= count; i++) result = result * (n - count + i) / i;
    return result;
  };
  if (combinationCount(candidatePool.length, numSitOut) <= limit) {
    groups.length = 0;
    seen.clear();
    choose(0, []);
  } else {
    const attempts = limit * 4;
    for (let attempt = 0; attempt < attempts && groups.length < limit; attempt++) {
      add(shuffle(candidatePool).slice(0, numSitOut));
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
  if (history.eligibleSitOutPlayerIds.size === 0) return 0;
  const leastSitOuts = Math.min(
    ...[...history.eligibleSitOutPlayerIds].map(id => get(history.sitOutCount, id)),
  );
  return sitting.reduce(
    (total, player) => total + Number(get(history.sitOutCount, player.id) > leastSitOuts),
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
  if (earlyPartnerRepeatCost(a, b, history) > 0) {
    cost += EARLY_PARTNER_REPEAT;
  }
  if (prevPairIds.has(key)) cost += PARTNER_BACK_TO_BACK;
  return cost;
}

function earlyPartnerRepeatCost(a: Player, b: Player, history: History): number {
  const count = get(history.pairCount, pairKey(a.id, b.id));
  if (count === 0) return 0;
  const aCycleComplete = relationshipCycleComplete(
    a.id,
    count,
    history.pairCount,
    history.eligiblePartnerIds,
    pairKey,
    undefined,
    history.minimumPartnerCount,
  );
  const bCycleComplete = relationshipCycleComplete(
    b.id,
    count,
    history.pairCount,
    history.eligiblePartnerIds,
    pairKey,
    undefined,
    history.minimumPartnerCount,
  );
  return aCycleComplete && bCycleComplete ? 0 : 1;
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
  earlyRepeatWeight: number,
): number {
  let cost = 0;
  const opponentPairs: [Player, Player][] = [];
  for (const a of pairA) {
    for (const b of pairB) {
      opponentPairs.push([a, b]);
      const key = oppKey(a.id, b.id);
      const count = get(history.opponentCount, key);
      if (count > 0) cost += count * count * OPPONENT_REPEAT;
      if (prevOppIds.has(key)) cost += OPPONENT_BACK_TO_BACK;
    }
  }
  return earlyOpponentRepeatCost(
    opponentPairs,
    history.opponentCount,
    history.eligibleOpponentIds,
    history.minimumOpponentCount,
  ) * earlyRepeatWeight + cost;
}

function courtOpponentPairs(court: CourtGame): [Player, Player][] {
  const pairs: [Player, Player][] = [];
  for (const a of court.team1) {
    for (const b of court.team2) pairs.push([a, b]);
  }
  return pairs;
}

interface CourtAssignment {
  courts: CourtGame[];
  earlyOpponentRepeats: number;
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
  if (nPairs < 2) return { courts: [], earlyOpponentRepeats: 0, opponentCost: 0 };

  const maxOpponentCount = Math.max(0, ...history.opponentCount.values());
  // The early-cycle penalty dominates every lower-priority opponent repeat,
  // back-to-back, and first-exposure improvement available in this round.
  const earlyRepeatWeight = numCourts * 4 * (
    maxOpponentCount * maxOpponentCount * OPPONENT_REPEAT + OPPONENT_BACK_TO_BACK
  ) + 1;

  const cost: number[][] = Array.from({ length: nPairs }, () =>
    new Array(nPairs).fill(0),
  );
  for (let i = 0; i < nPairs; i++) {
    for (let j = i + 1; j < nPairs; j++) {
      const c = matchupCost(pairs[i], pairs[j], history, prevOppIds, earlyRepeatWeight);
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
  let earlyOpponentRepeats = 0;
  let opponentCost = 0;
  for (const g of games) {
    if (courts.length >= numCourts) break;
    const pairA = pairs[g.i];
    const pairB = pairs[g.j];
    const court: CourtGame = {
      courtNumber: courtNumber++,
      team1: [pairA[0], pairA[1]],
      team2: [pairB[0], pairB[1]],
    };
    courts.push(court);
    earlyOpponentRepeats += earlyOpponentRepeatCost(
      courtOpponentPairs(court),
      history.opponentCount,
      history.eligibleOpponentIds,
      history.minimumOpponentCount,
    );
    for (const [a, b] of courtOpponentPairs(court)) {
      const key = oppKey(a.id, b.id);
      const count = get(history.opponentCount, key);
      if (count > 0) opponentCost += count * count * OPPONENT_REPEAT;
      if (prevOppIds.has(key)) opponentCost += OPPONENT_BACK_TO_BACK;
    }
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
      const eligible = history.eligibleOpponentIds.get(players[i].id)?.has(players[j].id) ?? false;
      if (eligible && get(history.opponentCount, key) === 0 && !metThisRound.has(key)) {
        opponentCost += OPPONENT_NOT_MET;
      }
    }
  }

  return { courts, earlyOpponentRepeats, opponentCost };
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

  // Previous-round sitters get playing slots first whenever possible; remaining
  // ties preserve the existing sit-out and mixed-court fairness priorities.
  const rankForMixed = (pool: Player[]): Player[] =>
    shuffle(pool).sort((a, b) => {
      const la = prevSitOutIds.has(a.id) ? 1 : 0;
      const lb = prevSitOutIds.has(b.id) ? 1 : 0;
      if (la !== lb) return lb - la;
      const sa = get(history.sitOutCount, a.id);
      const sb = get(history.sitOutCount, b.id);
      if (sa !== sb) return sb - sa;          // more sit-outs first → gets to play
      const ma = get(history.mixedCount, a.id);
      const mb = get(history.mixedCount, b.id);
      if (ma !== mb) return ma - mb;          // fewer mixed games first → gets mixed slot
      return 0;
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
    let bestCost: number[] | null = null;
    for (const pairs of candidates) {
      const { courts: c, earlyOpponentRepeats, opponentCost } = assignCourts(
        pairs, mixedCourts, history, prevOppIds, players,
      );
      const candidateCost = [
        matchingEarlyPartnerCost(pairs, history),
        earlyOpponentRepeats,
        matchingPartnerCost(pairs, history, prevPairIds),
        opponentCost,
      ];
      if (bestCost === null || compareCostTuple(candidateCost, bestCost) < 0) {
        bestCost = candidateCost;
        bestCourts = c;
      }
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
        const backToBackSitOutCount = sitting.reduce(
          (count, player) => count + Number(prevSitOutIds.has(player.id)),
          0,
        );
        for (const pairs of candidates) {
          const earlyCost = matchingEarlyPartnerCost(pairs, history);
          const partnerCost = matchingPartnerCost(pairs, history, prevPairIds);
          const { courts: c, earlyOpponentRepeats, opponentCost } = assignCourts(
            pairs, usableCourts, history, prevOppIds, players,
          );
          const candidateCost = [
            backToBackSitOutCount,
            earlySitOutCost,
            earlyCost,
            earlyOpponentRepeats,
            earlyCoSitCost,
            individualSitOutCost,
            partnerCost,
            opponentCost,
            coSitCost,
          ];
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
    const backToBackSitOutCount = sitting.reduce(
      (count, player) => count + Number(prevSitOutIds.has(player.id)),
      0,
    );

    for (const pairs of candidates) {
      const earlyCost = matchingEarlyPartnerCost(pairs, history);
      const partnerCost = matchingPartnerCost(pairs, history, prevPairIds);
      const { courts, earlyOpponentRepeats, opponentCost } = assignCourts(
        pairs,
        numCourts,
        history,
        prevOppIds,
        players,
      );
      const candidateCost = [
        backToBackSitOutCount,
        earlySitOutCost,
        earlyCost,
        earlyOpponentRepeats,
        earlyCoSitCost,
        individualSitOutCost,
        partnerCost,
        opponentCost,
        coSitCost,
      ];
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

function refreshMinimumRelationCount(
  playerId: string,
  relationCounts: Map<string, number>,
  eligibleIds: Map<string, Set<string>>,
  minimumCounts: Map<string, number>,
  makeKey: (a: string, b: string) => string,
): void {
  const relatedIds = eligibleIds.get(playerId) ?? new Set<string>();
  minimumCounts.set(
    playerId,
    relatedIds.size === 0
      ? Number.POSITIVE_INFINITY
      : Math.min(...[...relatedIds].map(otherId => get(relationCounts, makeKey(playerId, otherId)))),
  );
}

function updateHistory(
  courts: CourtGame[],
  sittingOut: Player[],
  history: History,
): void {
  const changedPartnerIds = new Set<string>();
  const changedOpponentIds = new Set<string>();
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
          changedPartnerIds.add(team[i].id);
          changedPartnerIds.add(team[j].id);
        }
      }
    }

    for (const a of court.team1) {
      for (const b of court.team2) {
        inc(history.opponentCount, oppKey(a.id, b.id));
        changedOpponentIds.add(a.id);
        changedOpponentIds.add(b.id);
      }
    }
  }

  for (const id of changedPartnerIds) {
    refreshMinimumRelationCount(
      id,
      history.pairCount,
      history.eligiblePartnerIds,
      history.minimumPartnerCount,
      pairKey,
    );
  }
  for (const id of changedOpponentIds) {
    refreshMinimumRelationCount(
      id,
      history.opponentCount,
      history.eligibleOpponentIds,
      history.minimumOpponentCount,
      oppKey,
    );
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
  earlyOpponentRepeats: number;
  earlySitOutPairRepeats: number;
  sitOutPairRepeats: number;
  partnerRepeatCost: number;
  partnerSpread: number;
  sitOutSpread: number;
  backToBackSitOuts: number;
  opponentCost: number;
  opponentSpread: number;
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

/**
 * Sample 3M/3F single-court rotations that satisfy the first two priorities,
 * then score their partner and opponent cycles lexicographically. Do not make
 * co-sitter uniqueness a structural constraint: it is a lower-priority
 * tie-breaker and must not hide a better opponent rotation.
 */
function threeByThreeMixedPartnerRotation(
  players: Player[],
  eligiblePartnerIds: Map<string, Set<string>>,
  eligibleSitOutPartnerCount: Map<string, number>,
  eligibleSitOutPlayerIds: Set<string>,
  eligibleOpponentIds: Map<string, Set<string>>,
): PartnerRotationRound[] {
  const males = shuffle(players.filter(player => player.gender === 'male'));
  const females = shuffle(players.filter(player => player.gender === 'female'));
  const sitOutOrders: [number, number][][] = [];
  const seenSitOutOrders = new Set<string>();
  const addSitOutOrder = (order: [number, number][]) => {
    if (order.some(([male, female], index) => index > 0 && (
      male === order[index - 1][0] || female === order[index - 1][1]
    ))) return;
    const key = order.map(([male, female]) => `${male}${female}`).join('');
    if (seenSitOutOrders.has(key)) return;
    seenSitOutOrders.add(key);
    sitOutOrders.push(order);
  };

  // Keep a known partner-cycle-perfect rotation with 11 opponent-cycle
  // violations represented, then sample more sitter orderings. The 3M/3F
  // constraint search found no lower opponent-cycle score while preserving
  // the sit-out and partner cycles.
  addSitOutOrder([
    [0, 0], [1, 1], [2, 2], [0, 1], [1, 0], [2, 2], [0, 0], [1, 2], [2, 1],
  ]);
  for (let attempt = 0; sitOutOrders.length < 128 && attempt < 1024; attempt++) {
    const order: [number, number][] = [];
    let previousMale = -1;
    let previousFemale = -1;
    for (let block = 0; block < 3; block++) {
      let maleOrder = shuffle([0, 1, 2]);
      let femaleOrder = shuffle([0, 1, 2]);
      for (let retry = 0; retry < 12 && maleOrder[0] === previousMale; retry++) {
        maleOrder = shuffle([0, 1, 2]);
      }
      for (let retry = 0; retry < 12 && femaleOrder[0] === previousFemale; retry++) {
        femaleOrder = shuffle([0, 1, 2]);
      }
      for (let round = 0; round < 3; round++) {
        order.push([maleOrder[round], femaleOrder[round]]);
      }
      previousMale = maleOrder[2];
      previousFemale = femaleOrder[2];
    }
    addSitOutOrder(order);
  }

  const orientations: Map<number, [Player, Player][]>[] = [];
  for (let mask = 0; mask < 1 << 9; mask++) {
    const partnersByCell = new Map<number, [Player, Player][]>();
    for (let maleSitOut = 0; maleSitOut < 3; maleSitOut++) {
      for (let femaleSitOut = 0; femaleSitOut < 3; femaleSitOut++) {
        const activeMales = males.filter((_, index) => index !== maleSitOut);
        const activeFemales = females.filter((_, index) => index !== femaleSitOut);
        const crossed = (mask & (1 << (maleSitOut * 3 + femaleSitOut))) !== 0;
        const pairs: [Player, Player][] = crossed
          ? [[activeMales[0], activeFemales[1]], [activeMales[1], activeFemales[0]]]
          : [[activeMales[0], activeFemales[0]], [activeMales[1], activeFemales[1]]];
        partnersByCell.set(maleSitOut * 3 + femaleSitOut, pairs);
      }
    }
    orientations.push(partnersByCell);
  }

  let bestPartnerCycleCost = Number.POSITIVE_INFINITY;
  let bestOpponentCycleCost = Number.POSITIVE_INFINITY;
  const cycleOptimalRotations: PartnerRotationRound[][] = [];
  for (const sitOutOrder of sitOutOrders) {
    for (const orientation of orientations) {
      const rotation = sitOutOrder.map(([maleSitOut, femaleSitOut]) => ({
        pairs: orientation.get(maleSitOut * 3 + femaleSitOut)!,
        sittingOut: [males[maleSitOut], females[femaleSitOut]],
      }));
      const partnerCounts = new Map<string, number>();
      let partnerCycleCost = 0;
      for (const round of rotation) {
        for (const [a, b] of round.pairs) {
          const previousCount = get(partnerCounts, pairKey(a.id, b.id));
          if (previousCount > 0 && (
            !relationshipCycleComplete(a.id, previousCount, partnerCounts, eligiblePartnerIds, pairKey) ||
            !relationshipCycleComplete(b.id, previousCount, partnerCounts, eligiblePartnerIds, pairKey)
          )) partnerCycleCost++;
          inc(partnerCounts, pairKey(a.id, b.id));
        }
      }
      if (partnerCycleCost > bestPartnerCycleCost) continue;

      const opponentCounts = new Map<string, number>();
      let opponentCycleCost = 0;
      for (const round of rotation) {
        const [team1, team2] = round.pairs;
        const opponentPairs: [Player, Player][] = [];
        for (const a of team1) {
          for (const b of team2) opponentPairs.push([a, b]);
        }
        opponentCycleCost += earlyOpponentRepeatCost(
          opponentPairs,
          opponentCounts,
          eligibleOpponentIds,
        );
        for (const [a, b] of opponentPairs) inc(opponentCounts, oppKey(a.id, b.id));
      }

      if (
        partnerCycleCost < bestPartnerCycleCost ||
        (partnerCycleCost === bestPartnerCycleCost && opponentCycleCost < bestOpponentCycleCost)
      ) {
        bestPartnerCycleCost = partnerCycleCost;
        bestOpponentCycleCost = opponentCycleCost;
        cycleOptimalRotations.length = 0;
      }
      if (partnerCycleCost === bestPartnerCycleCost && opponentCycleCost === bestOpponentCycleCost) {
        cycleOptimalRotations.push(rotation);
      }
    }
  }

  let bestRotation = cycleOptimalRotations[0] ?? [];
  let bestQuality: ScheduleQuality | null = null;
  for (const rotation of cycleOptimalRotations) {
    const rounds: Round[] = rotation.map((round, index) => ({
      roundNumber: index + 1,
      courts: [{ courtNumber: 1, team1: round.pairs[0], team2: round.pairs[1] }],
      sittingOut: round.sittingOut,
    }));
    const quality = scoreSchedule(
      rounds,
      players,
      eligiblePartnerIds,
      eligibleSitOutPartnerCount,
      eligibleSitOutPlayerIds,
      eligibleOpponentIds,
    );
    if (bestQuality === null || compareScheduleQuality(quality, bestQuality) < 0) {
      bestQuality = quality;
      bestRotation = rotation;
    }
  }
  return bestRotation;
}

function partnerRotationSignature(rounds: PartnerRotationRound[]): string {
  return JSON.stringify(rounds.map(round => ({
    courts: [round.pairs.map(pair => pair.map(player => player.id).sort().join('|')).sort().join('::')],
    sitting: round.sittingOut.map(player => player.id).sort(),
  })));
}

function scoreSchedule(
  rounds: Round[],
  players: Player[],
  eligiblePartnerIds: Map<string, Set<string>>,
  eligibleSitOutPartnerCount: Map<string, number>,
  eligibleSitOutPlayerIds: Set<string>,
  eligibleOpponentIds: Map<string, Set<string>>,
  balancePartners = true,
  balanceOpponents = true,
): ScheduleQuality {
  const partnerCounts = new Map<string, number>();
  const sitOutPairCounts = new Map<string, number>();
  const sitOutPartnerSeen = new Map<string, Set<string>>();
  const sitOutCounts = new Map<string, number>();
  const opponentCounts = new Map<string, number>();
  let earlyOpponentRepeats = 0;
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
    sitOutPartnerSeen.set(player.id, new Set());
    sitOutCounts.set(player.id, 0);
  }

  for (const round of rounds) {
    const currentSitting = new Set(round.sittingOut.map(p => p.id));
    const leastSitOuts = eligibleSitOutPlayerIds.size > 0
      ? Math.min(...[...eligibleSitOutPlayerIds].map(id => get(sitOutCounts, id)))
      : 0;
    for (const player of round.sittingOut) {
      if (
        eligibleSitOutPlayerIds.has(player.id) &&
        get(sitOutCounts, player.id) > leastSitOuts
      ) earlySitOutRepeats++;
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
            if (count > 0 && (
              !relationshipCycleComplete(a.id, count, partnerCounts, eligiblePartnerIds, pairKey) ||
              !relationshipCycleComplete(b.id, count, partnerCounts, eligiblePartnerIds, pairKey)
            )) {
              earlyPartnerRepeats++;
            }
            if (previouslyPartnered.has(key)) partnerRepeatCost += PARTNER_BACK_TO_BACK;
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

    const opponentPairs = round.courts.flatMap(court => courtOpponentPairs(court));
    earlyOpponentRepeats += earlyOpponentRepeatCost(
      opponentPairs,
      opponentCounts,
      eligibleOpponentIds,
    );

    for (let i = 0; i < players.length; i++) {
      for (const otherId of eligibleOpponentIds.get(players[i].id) ?? []) {
        const key = oppKey(players[i].id, otherId);
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
  const sitCounts = [...eligibleSitOutPlayerIds].map(id => get(sitOutCounts, id));
  const sitOutSpread = sitCounts.length ? Math.max(...sitCounts) - Math.min(...sitCounts) : 0;
  const partnerSpread = balancePartners
    ? Math.max(0, ...players.map(player => {
        const counts = [...(eligiblePartnerIds.get(player.id) ?? [])]
          .map(otherId => get(partnerCounts, pairKey(player.id, otherId)));
        return counts.length ? Math.max(...counts) - Math.min(...counts) : 0;
      }))
    : 0;
  const opponentSpread = balanceOpponents
    ? Math.max(0, ...players.map(player => {
        const counts = [...(eligibleOpponentIds.get(player.id) ?? [])]
          .map(otherId => get(opponentCounts, oppKey(player.id, otherId)));
        return counts.length ? Math.max(...counts) - Math.min(...counts) : 0;
      }))
    : 0;

  return {
    earlySitOutRepeats,
    earlyPartnerRepeats,
    earlySitOutPairRepeats,
    sitOutPairRepeats,
    partnerRepeatCost,
    partnerSpread,
    sitOutSpread,
    backToBackSitOuts,
    earlyOpponentRepeats,
    opponentCost,
    opponentSpread,
  };
}

function compareScheduleQuality(a: ScheduleQuality, b: ScheduleQuality): number {
  return a.backToBackSitOuts - b.backToBackSitOuts ||
    a.earlySitOutRepeats - b.earlySitOutRepeats ||
    a.earlyPartnerRepeats - b.earlyPartnerRepeats ||
    a.earlyOpponentRepeats - b.earlyOpponentRepeats ||
    a.earlySitOutPairRepeats - b.earlySitOutPairRepeats ||
    a.sitOutSpread - b.sitOutSpread ||
    a.partnerSpread - b.partnerSpread ||
    a.partnerRepeatCost - b.partnerRepeatCost ||
    a.opponentSpread - b.opponentSpread ||
    a.opponentCost - b.opponentCost ||
    a.sitOutPairRepeats - b.sitOutPairRepeats;
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
  continueFrom?: RosterData,
): RosterData {
  const previousRounds = continueFrom?.rounds ?? [];
  const firstNewRoundNumber = previousRounds.length + 1;
  if (rosterType === 'fixed') {
    // Pair players in entry order once. Those teams remain intact for every round
    // and each team sits or plays as a unit.
    const teams: [Player, Player][] = [];
    for (let i = 0; i + 1 < players.length; i += 2) teams.push([players[i], players[i + 1]]);
    const allTeams = teams.length;
    const sitCount = Math.max(0, allTeams - numCourts * 2);
    const eligibleSitting = makeEligibleSitOutPlayerIds(players, numCourts, false);
    const eligibleSitPartners = makeSitOutPartnerEligibility(players, numCourts, false);
    const teamByPlayer = new Map<string, number>();
    teams.forEach((team, index) => team.forEach(player => teamByPlayer.set(player.id, index)));
    const fixedPartnerIds = new Map(players.map(player => [
      player.id,
      new Set(teams.find(team => team.some(teammate => teammate.id === player.id))
        ?.filter(teammate => teammate.id !== player.id)
        .map(teammate => teammate.id) ?? []),
    ]));
    const fixedOpponentIds = new Map(players.map(player => [
      player.id,
      new Set(players.filter(other =>
        other.id !== player.id && teamByPlayer.get(other.id) !== teamByPlayer.get(player.id),
      ).map(other => other.id)),
    ]));
    const eligiblePartners = makeHistory(
      players,
      false,
      eligibleSitPartners,
      eligibleSitting,
      fixedPartnerIds,
      fixedOpponentIds,
    ).eligiblePartnerIds;
    const attempts = players.length <= 12 ? 12 : 4;
    let best: Round[] = [];
    let bestQuality: ScheduleQuality | null = null;
    const avoidSignature = avoidRoster ? rotationSignature(avoidRoster.rounds) : null;
    let bestDifferent: Round[] | null = null;
    let bestDifferentQuality: ScheduleQuality | null = null;

    for (let attempt = 0; attempt < attempts; attempt++) {
      const history = makeHistory(
        players,
        false,
        eligibleSitPartners,
        eligibleSitting,
        fixedPartnerIds,
        fixedOpponentIds,
      );
      const rounds: Round[] = [];
      for (const previousRound of previousRounds) updateHistory(previousRound.courts, previousRound.sittingOut, history);
      const lastPreviousRound = previousRounds.at(-1);
      let previousSit = new Set(lastPreviousRound?.sittingOut.map(player => player.id) ?? []);
      let previousOpp = new Set<string>();
      if (lastPreviousRound) {
        for (const court of lastPreviousRound.courts) for (const a of court.team1) for (const b of court.team2) previousOpp.add(oppKey(a.id, b.id));
      }
      for (let r = 0; r < numRounds; r++) {
        const ranked = shuffle(teams).sort((a, b) => {
          const prevA = Number(previousSit.has(a[0].id)) + Number(previousSit.has(a[1].id));
          const prevB = Number(previousSit.has(b[0].id)) + Number(previousSit.has(b[1].id));
          if (prevA !== prevB) return prevA - prevB;
          const sitA = get(history.sitOutCount, a[0].id) + get(history.sitOutCount, a[1].id);
          const sitB = get(history.sitOutCount, b[0].id) + get(history.sitOutCount, b[1].id);
          return sitA - sitB;
        });
        const sittingTeams = ranked.slice(0, sitCount);
        const sittingIds = new Set(sittingTeams.flatMap(team => team.map(p => p.id)));
        const sittingOut = players.filter(p => sittingIds.has(p.id));
        const playingTeams = teams.filter(team => !sittingIds.has(team[0].id));
        const courts = assignCourts(playingTeams, numCourts, history, previousOpp, players).courts;
        rounds.push({ roundNumber: firstNewRoundNumber + r, courts, sittingOut });
        updateHistory(courts, sittingOut, history);
        previousSit = sittingIds;
        previousOpp = new Set();
        for (const court of courts) for (const a of court.team1) for (const b of court.team2) previousOpp.add(oppKey(a.id, b.id));
      }
      const quality = scoreSchedule(
        [...previousRounds, ...rounds],
        players,
        eligiblePartners,
        eligibleSitPartners,
        eligibleSitting,
        fixedOpponentIds,
        false,
      );
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
  const eligibility = makeHistory(
    players,
    restrictCrossGender,
    eligibleSitOutPartnerCount,
    eligibleSitOutPlayerIds,
  );
  const eligiblePartnerIds = eligibility.eligiblePartnerIds;
  const eligibleOpponentIds = eligibility.eligibleOpponentIds;
  const usesThreeByThreeRotation =
    !continueFrom && rosterType === 'mixed' && !allowSameGender && partnerMode === 'strict' &&
    players.length === 6 && players.filter(player => player.gender === 'male').length === 3 &&
    players.filter(player => player.gender === 'female').length === 3 &&
    numCourts === 1 && numRounds === 9;
  // Small rosters have a short enough schedule horizon that a few complete
  // rotations can be compared cheaply. This avoids a locally reasonable round
  // choice creating an early repeat later in the same schedule.
  const basePlanningAttempts = usesThreeByThreeRotation
    ? 1
    : players.length <= 5 && numRounds <= 20
      ? 10
      : players.length <= 6 && numRounds <= 20
        ? 16
        : players.length <= 8 && numRounds <= 10
          ? 16
        : players.length <= 12 && numRounds <= 15
          ? 4
          : 1;
  const variationAttempts = players.length <= 12 ? 8 : 3;
  const planningAttempts = usesThreeByThreeRotation
    ? 1
    : avoidRoster
      ? Math.max(basePlanningAttempts, variationAttempts)
      : basePlanningAttempts;
  const avoidSignature = avoidRoster ? rotationSignature(avoidRoster.rounds) : null;

  let fivePlayerOpeners =
    !continueFrom && players.length === 5 &&
    numCourts === 1 &&
    !restrictCrossGender &&
    !useHybrid
      ? fivePlayerPartnerRotation(players)
      : null;
  if (fivePlayerOpeners && avoidRoster) {
    const previousFirstCycle = rotationSignature(avoidRoster.rounds.slice(0, players.length));
    for (let attempt = 0; attempt < 20 && partnerRotationSignature(fivePlayerOpeners) === previousFirstCycle; attempt++) {
      fivePlayerOpeners = fivePlayerPartnerRotation(players);
    }
  }

  const createThreeByThreeOpeners = () => threeByThreeMixedPartnerRotation(
      players,
      eligiblePartnerIds,
      eligibleSitOutPartnerCount,
      eligibleSitOutPlayerIds,
      eligibleOpponentIds,
    );
  let threeByThreeOpeners = usesThreeByThreeRotation
    ? createThreeByThreeOpeners()
    : null;
  if (threeByThreeOpeners && avoidRoster) {
    const previousRotation = rotationSignature(avoidRoster.rounds.slice(0, numRounds));
    let attempts = 0;
    while (attempts < 20 && partnerRotationSignature(threeByThreeOpeners) === previousRotation) {
      attempts++;
      threeByThreeOpeners = createThreeByThreeOpeners();
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
    for (const previousRound of previousRounds) updateHistory(previousRound.courts, previousRound.sittingOut, history);
    const rounds: Round[] = [];
    let prevSittingOut: Player[] = previousRounds.at(-1)?.sittingOut ?? [];
    let prevPairIds = new Set<string>();
    let prevOppIds = new Set<string>();
    const lastPreviousRound = previousRounds.at(-1);
    if (lastPreviousRound) {
      for (const court of lastPreviousRound.courts) {
        for (const team of [court.team1, court.team2]) {
          for (let i = 0; i < team.length; i++) for (let j = i + 1; j < team.length; j++) prevPairIds.add(pairKey(team[i].id, team[j].id));
        }
        for (const a of court.team1) for (const b of court.team2) prevOppIds.add(oppKey(a.id, b.id));
      }
    }

    for (let r = 0; r < numRounds; r++) {
      const openingRound = threeByThreeOpeners?.[r] ?? fivePlayerOpeners?.[r];
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

      rounds.push({ roundNumber: firstNewRoundNumber + r, courts, sittingOut });
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
      [...previousRounds, ...rounds],
      players,
      eligiblePartnerIds,
      eligibleSitOutPartnerCount,
      eligibleSitOutPlayerIds,
      eligibleOpponentIds,
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
