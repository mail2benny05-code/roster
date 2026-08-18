import type { Player, CourtGame, Round, RosterData, RosterType } from '../types';

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
  opponentCount: Map<string, number>;    // times two players opposed
  sitOutCount: Map<string, number>;      // times a player sat out
  playCount: Map<string, number>;        // times a player played
}

function makeHistory(players: Player[]): History {
  const playCount = new Map<string, number>();
  const sitOutCount = new Map<string, number>();
  for (const p of players) {
    playCount.set(p.id, 0);
    sitOutCount.set(p.id, 0);
  }
  return {
    pairCount: new Map(),
    opponentCount: new Map(),
    sitOutCount,
    playCount,
  };
}

function get(map: Map<string, number>, key: string): number {
  return map.get(key) ?? 0;
}

function inc(map: Map<string, number>, key: string): void {
  map.set(key, get(map, key) + 1);
}

// ─── Sit-out selection ──────────────────────────────────────────────────────

/**
 * Pick which players sit out this round from a single pool.
 *
 * Fairness rules, in strict priority:
 *   1. Prefer players with the fewest prior sit-outs.
 *   2. Never pick a player who sat out last round, unless forced (i.e. every
 *      remaining lowest-sit-out candidate also sat out last round).
 *   3. Break remaining ties randomly.
 *
 * Returns { playing, sitting }.
 */
function selectSitOuts(
  pool: Player[],
  numSitOut: number,
  history: History,
  prevSitOutIds: Set<string>,
): { playing: Player[]; sitting: Player[] } {
  if (numSitOut <= 0) {
    return { playing: [...pool], sitting: [] };
  }
  if (numSitOut >= pool.length) {
    return { playing: [], sitting: [...pool] };
  }

  // Sort candidates by (sitOutCount asc, satOutLastRound asc, random).
  const ranked = shuffle(pool).sort((a, b) => {
    const sa = get(history.sitOutCount, a.id);
    const sb = get(history.sitOutCount, b.id);
    if (sa !== sb) return sa - sb;
    const la = prevSitOutIds.has(a.id) ? 1 : 0;
    const lb = prevSitOutIds.has(b.id) ? 1 : 0;
    return la - lb;
  });

  const sitting = ranked.slice(0, numSitOut);
  const sittingIds = new Set(sitting.map(p => p.id));
  const playing = pool.filter(p => !sittingIds.has(p.id));
  return { playing, sitting };
}

// ─── Partner cost ─────────────────────────────────────────────────────────────

/**
 * Cost of pairing two players as partners. Lower is better.
 *   - Never partnered:           0
 *   - Partnered before:          escalates steeply with repeat count
 *   - Partnered last round:      huge penalty (back-to-back forbidden)
 */
function partnerCost(
  a: Player,
  b: Player,
  history: History,
  prevPairIds: Set<string>,
): number {
  const key = pairKey(a.id, b.id);
  const count = get(history.pairCount, key);
  let cost = count * 1_000_000; // repeat count dominates
  if (prevPairIds.has(key)) cost += 100_000_000; // back-to-back repeat
  return cost;
}

// ─── Optimal min-cost bipartite matching (Hungarian algorithm) ────────────────

/**
 * Solve the assignment problem for a square cost matrix (n x n).
 * Returns rowMatch where rowMatch[i] is the column assigned to row i.
 * O(n^3). Used for strict-mixed male↔female partner assignment.
 */
function hungarian(cost: number[][]): number[] {
  const n = cost.length;
  if (n === 0) return [];
  const INF = Number.MAX_SAFE_INTEGER;
  const u = new Array(n + 1).fill(0);
  const v = new Array(n + 1).fill(0);
  const p = new Array(n + 1).fill(0); // p[j] = row matched to column j
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

/**
 * Optimal min-cost perfect matching on a single pool of an even number of
 * players, via DP over a bitmask of unmatched players. Exact for pools up to
 * 16; greedy fallback above that so it never fails.
 */
function optimalGeneralMatching(
  players: Player[],
  history: History,
  prevPairIds: Set<string>,
): [Player, Player][] {
  const n = players.length;
  if (n === 0) return [];

  const c: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const cost = partnerCost(players[i], players[j], history, prevPairIds);
      c[i][j] = cost;
      c[j][i] = cost;
    }
  }

  if (n <= 16) {
    const full = (1 << n) - 1;
    const dp = new Float64Array(1 << n).fill(Infinity);
    const choice = new Int32Array(1 << n).fill(-1); // encodes (i<<8 | j)
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
        const cand = dp[mask] + c[i][j];
        if (cand < dp[nextMask]) {
          dp[nextMask] = cand;
          choice[nextMask] = (i << 8) | j;
        }
      }
    }

    const pairs: [Player, Player][] = [];
    let mask = full;
    while (mask > 0) {
      const enc = choice[mask];
      if (enc < 0) break;
      const i = enc >> 8;
      const j = enc & 0xff;
      pairs.push([players[i], players[j]]);
      mask &= ~((1 << i) | (1 << j));
    }
    return pairs;
  }

  return greedyGeneralMatching(players, c);
}

/** Greedy fallback: repeatedly take the globally cheapest available pair. */
function greedyGeneralMatching(players: Player[], c: number[][]): [Player, Player][] {
  const remaining = players.map((_, i) => i);
  const pairs: [Player, Player][] = [];
  while (remaining.length >= 2) {
    let bestI = 0, bestJ = 1, bestCost = Infinity;
    for (let x = 0; x < remaining.length; x++) {
      for (let y = x + 1; y < remaining.length; y++) {
        const cost = c[remaining[x]][remaining[y]];
        if (cost < bestCost) {
          bestCost = cost;
          bestI = x;
          bestJ = y;
        }
      }
    }
    pairs.push([players[remaining[bestI]], players[remaining[bestJ]]]);
    remaining.splice(bestJ, 1);
    remaining.splice(bestI, 1);
  }
  return pairs;
}

// ─── Pairing dispatch ─────────────────────────────────────────────────────────

/**
 * Form partner pairs for the playing set.
 *   - Strict mixed: optimal male↔female assignment via Hungarian algorithm.
 *   - Otherwise:    optimal general matching (exact for ≤16, greedy above).
 */
function formPairs(
  playing: Player[],
  history: History,
  prevPairIds: Set<string>,
  restrictCrossGender: boolean,
): [Player, Player][] {
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
      if (j >= 0 && j < females.length) {
        pairs.push([males[i], females[j]]);
      }
    }
    return pairs;
  }

  return optimalGeneralMatching(shuffle(playing), history, prevPairIds);
}

// ─── Court / opponent assignment ───────────────────────────────────────────

/**
 * Opponent cost between two teams facing each other. Every cross-team pairing
 * of players is an opponent interaction. Repeats are penalised progressively
 * and same-round-previous opponents (back-to-back) are heavily penalised.
 *
 * Because in strict mixed the two males on a court always oppose each other and
 * the two females always oppose each other, this same function naturally
 * spreads same-gender opponents when we evaluate every team split.
 */
function matchupCost(
  team1: Player[],
  team2: Player[],
  history: History,
  prevOppIds: Set<string>,
): number {
  let cost = 0;
  for (const a of team1) {
    for (const b of team2) {
      const key = oppKey(a.id, b.id);
      const count = get(history.opponentCount, key);
      // Squared so repeats are progressively worse; new opponents cost 0.
      cost += count * count * 1_000;
      if (prevOppIds.has(key)) cost += 1_000_000; // back-to-back opponent
    }
  }
  return cost;
}

/**
 * Given two pairs assigned to the same court, choose how to arrange them into
 * Team 1 vs Team 2 so that opponent fairness is best.
 *
 * The two players in each pair are fixed partners, so there is really only one
 * meaningful "matchup": pairA vs pairB. But we still evaluate the opponent cost
 * (which counts every cross pairing) and keep the pairs intact.
 */
function bestCourtArrangement(
  pairA: [Player, Player],
  pairB: [Player, Player],
  history: History,
  prevOppIds: Set<string>,
): { team1: Player[]; team2: Player[]; cost: number } {
  const team1 = [pairA[0], pairA[1]];
  const team2 = [pairB[0], pairB[1]];
  const cost = matchupCost(team1, team2, history, prevOppIds);
  return { team1, team2, cost };
}

/**
 * Assign pairs to courts minimising repeat / back-to-back opponents.
 *
 * Strategy: repeatedly take an anchor pair and find the opposing pair that
 * yields the lowest opponent cost (including same-gender opponents in strict
 * mixed, since those are simply cross-team pairings). This directly fixes the
 * "males meet the same male twice before meeting everyone" and back-to-back
 * opponent problems.
 */
function assignCourts(
  pairs: [Player, Player][],
  numCourts: number,
  history: History,
  prevOppIds: Set<string>,
): CourtGame[] {
  const remaining = shuffle(pairs);
  const courts: CourtGame[] = [];
  let courtNumber = 1;

  while (remaining.length >= 2 && courts.length < numCourts) {
    const first = remaining.shift()!;
    let bestIdx = 0;
    let bestCost = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const { cost } = bestCourtArrangement(first, remaining[i], history, prevOppIds);
      if (cost < bestCost) {
        bestCost = cost;
        bestIdx = i;
      }
    }
    const second = remaining.splice(bestIdx, 1)[0];
    const { team1, team2 } = bestCourtArrangement(first, second, history, prevOppIds);

    courts.push({
      courtNumber: courtNumber++,
      team1,
      team2,
    });
  }

  return courts;
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
  const slots = numCourts * 4;

  let playing: Player[];
  let sitting: Player[];

  if (isMixed && !allowSameGender) {
    // Strict mixed: independent male / female sit-out pools; each court needs
    // exactly 2 males and 2 females.
    const males = players.filter(p => p.gender === 'male');
    const females = players.filter(p => p.gender === 'female');

    const maleSitOut = Math.max(0, males.length - numCourts * 2);
    const femaleSitOut = Math.max(0, females.length - numCourts * 2);

    const m = selectSitOuts(males, maleSitOut, history, prevSitOutIds);
    const f = selectSitOuts(females, femaleSitOut, history, prevSitOutIds);

    playing = [...m.playing, ...f.playing];
    sitting = [...m.sitting, ...f.sitting];
  } else {
    // Gender-based OR flexible mixed: one combined pool.
    const numSitOut = Math.max(0, players.length - slots);
    const sel = selectSitOuts(players, numSitOut, history, prevSitOutIds);
    playing = sel.playing;
    sitting = sel.sitting;
  }

  // Form partner pairs (optimal matching).
  const restrictCrossGender = isMixed && !allowSameGender;
  const pairs = formPairs(playing, history, prevPairIds, restrictCrossGender);

  // Assign pairs to courts, minimising repeat / back-to-back opponents.
  const courts = assignCourts(pairs, numCourts, history, prevOppIds);

  return { courts, sittingOut: sitting };
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

    // Partners.
    for (const team of [court.team1, court.team2]) {
      for (let i = 0; i < team.length; i++) {
        for (let j = i + 1; j < team.length; j++) {
          inc(history.pairCount, pairKey(team[i].id, team[j].id));
        }
      }
    }

    // Opponents.
    for (const a of court.team1) {
      for (const b of court.team2) {
        inc(history.opponentCount, oppKey(a.id, b.id));
      }
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
  }

  return { valid: errors.length === 0, errors };
}

// ─── Generate roster ──────────────────────────────────────────────────────────

export function generateRoster(
  players: Player[],
  numCourts: number,
  numRounds: number,
  rosterType: RosterType,
  sessionName: string,
  allowSameGender = false,
): RosterData {
  const history = makeHistory(players);
  const isMixed = rosterType === 'mixed';
  const rounds: Round[] = [];

  let prevSittingOut: Player[] = [];
  let prevPairIds = new Set<string>();
  let prevOppIds = new Set<string>();

  for (let r = 0; r < numRounds; r++) {
    const { courts, sittingOut } = generateOneRound(
      players,
      numCourts,
      history,
      isMixed,
      allowSameGender,
      prevSittingOut,
      prevPairIds,
      prevOppIds,
    );

    rounds.push({ roundNumber: r + 1, courts, sittingOut });
    updateHistory(courts, sittingOut, history);

    // Record state for next round's back-to-back checks.
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

  return { rounds, rosterType, allPlayers: players, numCourts, sessionName, allowSameGender };
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

/**
 * Analyse a generated roster and return fairness statistics + rule violations.
 * `eligiblePairKeys` / `eligibleOppKeys` (optional) restrict the min/max spread
 * computation to pairings that can legally occur (e.g. male↔female partners, or
 * same-gender opponents in strict mixed), so structurally impossible pairings
 * don't skew the spread toward 0.
 */
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
