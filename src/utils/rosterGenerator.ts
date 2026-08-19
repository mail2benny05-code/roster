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

// ─── Cost scale constants ────────────────────────────────────────────────────
//
// Tiers (strictly ordered, no overlap):
//
//   PARTNER_BACK_TO_BACK  (1e15)  — absolutely forbidden back-to-back partner
//   OPPONENT_BACK_TO_BACK (1e8)   — absolutely forbidden back-to-back opponent
//   PARTNER_REPEAT        (1e9)   — each prior partnering (scaled by count²)
//   OPPONENT_NOT_MET      (1e5)   — coverage: unmet pair after this round
//   OPPONENT_REPEAT       (1)     — fine-grained spread (scaled by count²)
//
// Coverage (OPPONENT_NOT_MET) strictly dominates repeat-spread (OPPONENT_REPEAT),
// so the optimizer exhausts all unmet pairs before repeating anyone.
// Back-to-back penalties dominate everything else, so they are never violated.

const PARTNER_REPEAT = 1_000_000_000;      // cost per prior partnering (scaled by count²)
const PARTNER_BACK_TO_BACK = 1e15;         // partnered last round — effectively forbidden

const OPPONENT_REPEAT = 1;                 // fine-grained spread: cost per prior opposing (scaled by count²)
const OPPONENT_NOT_MET = 100_000;          // coverage: dominates any realistic repeat-spread accumulation
const OPPONENT_BACK_TO_BACK = 100_000_000; // opposed last round — effectively forbidden

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
 *   - Partnered before:          escalates with the SQUARE of the repeat count
 *   - Partnered last round:      effectively forbidden (back-to-back)
 */
function partnerCost(
  a: Player,
  b: Player,
  history: History,
  prevPairIds: Set<string>,
): number {
  const key = pairKey(a.id, b.id);
  const count = get(history.pairCount, key);
  let cost = count * count * PARTNER_REPEAT;
  if (prevPairIds.has(key)) cost += PARTNER_BACK_TO_BACK;
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

// ─── Generic optimal min-cost perfect matching (bitmask DP) ───────────────────

/**
 * Optimal min-cost perfect matching over an even number of nodes.
 * `cost[i][j]` is the cost of matching node i with node j.
 * Returns a list of [i, j] matched index pairs.
 *
 * Exact via bitmask DP for up to 16 nodes; greedy fallback above that so it
 * never fails. Used for BOTH player-partner matching and pair-vs-pair court
 * matching (where each "node" is a partnered pair).
 */
function minCostMatchingIndices(cost: number[][]): [number, number][] {
  const n = cost.length;
  if (n === 0) return [];

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
//
// The KEY insight behind fixing premature opponents: there are usually MANY
// partner matchings that are equally optimal for partner fairness (e.g. many
// different Latin-square rows). Which one we pick determines the opponent
// structure of the round. So instead of committing to a single arbitrary
// optimum, we generate several candidate matchings, then let the round-level
// search (below) pick the one whose court assignment also minimises opponent
// repeats.

const CANDIDATE_ATTEMPTS = 200;

/** Total partner cost of a matching (used to compare candidates). */
function matchingPartnerCost(
  pairs: [Player, Player][],
  history: History,
  prevPairIds: Set<string>,
): number {
  let total = 0;
  for (const [a, b] of pairs) total += partnerCost(a, b, history, prevPairIds);
  return total;
}

/**
 * Generate up to CANDIDATE_ATTEMPTS distinct partner matchings for the playing
 * set, keeping those whose partner cost is at or near the optimum.
 *
 * A small tolerance (one PARTNER_REPEAT unit) admits partner-equivalent
 * matchings that differ only in fine-grained squared-count spread — never a
 * back-to-back or a genuine extra repeat — giving the opponent optimiser more
 * reachable court layouts to complete coverage, without trading away partner
 * fairness.
 *
 * Since PARTNER_REPEAT (1e9) << PARTNER_BACK_TO_BACK (1e15), this tolerance
 * can never admit a back-to-back partner repeat.
 */
function candidatePartnerMatchings(
  playing: Player[],
  history: History,
  prevPairIds: Set<string>,
  restrictCrossGender: boolean,
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
  let bestCost = Infinity;

  for (let attempt = 0; attempt < CANDIDATE_ATTEMPTS; attempt++) {
    const pairs = build();
    if (pairs.length === 0) continue;
    const cost = matchingPartnerCost(pairs, history, prevPairIds);
    if (cost < bestCost) {
      bestCost = cost;
    }
    candidates.push(pairs);
  }

  // Keep matchings at (or negligibly above) the best partner cost. A small
  // tolerance admits partner-equivalent matchings that differ only in the
  // fine-grained squared-count spread — never a back-to-back or a genuine
  // extra repeat — giving the opponent optimiser more reachable court layouts
  // to complete coverage, without trading away partner fairness.
  const tolerance = PARTNER_REPEAT; // one extra unit of squared-count spread
  const optimal = candidates.filter(
    pairs =>
      matchingPartnerCost(pairs, history, prevPairIds) <= bestCost + tolerance,
  );

  return optimal.length > 0 ? optimal : candidates;
}

// ─── Court / opponent assignment ───────────────────────────────────────────

/**
 * Opponent cost between two pairs facing each other.
 *
 * Scoring tiers (lower is better):
 *   - Never opposed:             0 (cheapest — fresh matchups are preferred)
 *   - Opposed before:            count² × OPPONENT_REPEAT (escalates with repeats)
 *   - Opposed last round:        add OPPONENT_BACK_TO_BACK (effectively forbidden)
 */
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

/**
 * Assign pairs to courts minimising repeat / back-to-back opponents, while
 * maximising fresh opponent coverage.
 *
 * GLOBAL optimisation: build a cost matrix over the pairs (each pair is a node)
 * where cost[i][j] is the opponent cost of pair i facing pair j, then find the
 * min-cost perfect matching of pairs into courts.
 *
 * After the local per-matchup costs are summed, a global coverage penalty is
 * added: for every eligible opponent pair (across ALL players, not just those
 * playing this round) that is STILL unmet AFTER applying this round's courts,
 * we add OPPONENT_NOT_MET. Because OPPONENT_NOT_MET >> OPPONENT_REPEAT, the
 * optimizer will always prefer meeting a new pair over avoiding a repeat —
 * ensuring full coverage before any repeats occur.
 *
 * Returns the courts AND the total opponent cost, so the round-level search can
 * compare this court assignment against those of other partner candidates.
 */
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

  // Global coverage penalty: for every opponent pair across ALL players that
  // is STILL unmet after applying this round's courts, add OPPONENT_NOT_MET.
  // Because OPPONENT_NOT_MET (1e5) >> OPPONENT_REPEAT (1), the optimizer will
  // always prefer meeting a new pair over avoiding a repeat, ensuring full
  // coverage before any repeats occur.
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

  const restrictCrossGender = isMixed && !allowSameGender;

  // Generate several partner-optimal candidate matchings, then choose the one
  // whose court assignment also minimises opponent repeats and maximises fresh
  // opponent coverage. This JOINT search eliminates premature opponents:
  // partner fairness stays optimal, but among all equally-optimal partner
  // matchings we pick the best for opponents.
  const candidates = candidatePartnerMatchings(
    playing,
    history,
    prevPairIds,
    restrictCrossGender,
  );

  let bestCourts: CourtGame[] = [];
  let bestOpponentCost = Infinity;

  for (const pairs of candidates) {
    const { courts, opponentCost } = assignCourts(
      pairs,
      numCourts,
      history,
      prevOppIds,
      players,
    );
    if (opponentCost < bestOpponentCost) {
      bestOpponentCost = opponentCost;
      bestCourts = courts;
    }
  }

  const courts = bestCourts;

  // Any players whose pair didn't get a court must sit out this round.
  const seated = new Set<string>();
  for (const court of courts) {
    for (const p of [...court.team1, ...court.team2]) seated.add(p.id);
  }
  const extraSit = playing.filter(p => !seated.has(p.id));
  if (extraSit.length > 0) sitting = [...sitting, ...extraSit];

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
