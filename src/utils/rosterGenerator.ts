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

// ─── Pairing (greedy min-cost matching) ───────────────────────────────────────

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
  let cost = count * 10_000; // strong preference to partner someone new
  if (prevPairIds.has(key)) cost += 1_000_000; // back-to-back repeat
  return cost;
}

/**
 * Greedily match a list of players into pairs, always taking the globally
 * cheapest available pair next. `restrictCrossGender` forces every pair to be
 * one male + one female (strict mixed mode).
 */
function greedyPairs(
  players: Player[],
  history: History,
  prevPairIds: Set<string>,
  restrictCrossGender: boolean,
): [Player, Player][] {
  const remaining = shuffle(players); // randomised so ties differ each run
  const pairs: [Player, Player][] = [];

  while (remaining.length >= 2) {
    // Anchor on the first remaining player, find its cheapest partner.
    const a = remaining[0];
    let bestIdx = -1;
    let bestCost = Infinity;

    for (let i = 1; i < remaining.length; i++) {
      const b = remaining[i];
      if (restrictCrossGender && a.gender === b.gender) continue;
      const cost = partnerCost(a, b, history, prevPairIds);
      if (cost < bestCost) {
        bestCost = cost;
        bestIdx = i;
      }
    }

    // Fallback: if cross-gender restriction left no partner (shouldn't happen
    // when validated), pair with the next player regardless.
    if (bestIdx === -1) bestIdx = 1;

    const b = remaining[bestIdx];
    pairs.push([a, b]);
    remaining.splice(bestIdx, 1);
    remaining.splice(0, 1);
  }

  return pairs;
}

// ─── Court / opponent assignment ───────────────────────────────────────────

/**
 * Opponent cost between two pairs facing each other on a court.
 * Counts every cross-pair opponent interaction; repeats cost more.
 */
function matchupCost(
  p1: [Player, Player],
  p2: [Player, Player],
  history: History,
): number {
  let cost = 0;
  for (const a of p1) {
    for (const b of p2) {
      const count = get(history.opponentCount, oppKey(a.id, b.id));
      cost += count * count; // squared so repeats are progressively worse
    }
  }
  return cost;
}

/**
 * Greedily assign pairs to courts: repeatedly take the two remaining pairs
 * whose matchup has the lowest opponent-repeat cost and place them together.
 */
function assignCourts(
  pairs: [Player, Player][],
  numCourts: number,
  history: History,
): CourtGame[] {
  const remaining = shuffle(pairs);
  const courts: CourtGame[] = [];
  let courtNumber = 1;

  while (remaining.length >= 2 && courts.length < numCourts) {
    // Pick anchor pair, then the opposing pair that shares the fewest prior
    // opponents with it.
    const first = remaining.shift()!;
    let bestIdx = 0;
    let bestCost = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const cost = matchupCost(first, remaining[i], history);
      if (cost < bestCost) {
        bestCost = cost;
        bestIdx = i;
      }
    }
    const second = remaining.splice(bestIdx, 1)[0];

    courts.push({
      courtNumber: courtNumber++,
      team1: [first[0], first[1]],
      team2: [second[0], second[1]],
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

  // Form partner pairs.
  const restrictCrossGender = isMixed && !allowSameGender;
  const pairs = greedyPairs(playing, history, prevPairIds, restrictCrossGender);

  // Assign pairs to courts, minimising repeat opponents.
  const courts = assignCourts(pairs, numCourts, history);

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

  for (let r = 0; r < numRounds; r++) {
    const { courts, sittingOut } = generateOneRound(
      players,
      numCourts,
      history,
      isMixed,
      allowSameGender,
      prevSittingOut,
      prevPairIds,
    );

    rounds.push({ roundNumber: r + 1, courts, sittingOut });
    updateHistory(courts, sittingOut, history);

    // Record state for next round's back-to-back checks.
    prevSittingOut = sittingOut;
    prevPairIds = new Set<string>();
    for (const court of courts) {
      for (const team of [court.team1, court.team2]) {
        for (let i = 0; i < team.length; i++) {
          for (let j = i + 1; j < team.length; j++) {
            prevPairIds.add(pairKey(team[i].id, team[j].id));
          }
        }
      }
    }
  }

  return { rounds, rosterType, allPlayers: players, numCourts, sessionName, allowSameGender };
}
