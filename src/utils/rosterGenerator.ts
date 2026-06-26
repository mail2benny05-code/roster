import type { Player, CourtGame, Round, RosterData, RosterType } from '../types';

// ─── Helper keys ─────────────────────────────────────────────────────────────

function pairKey(a: string, b: string): string {
  return [a, b].sort().join('|');
}

function oppKey(a: string, b: string): string {
  return [a, b].sort().join('~');
}

// ─── GlobalHistory ────────────────────────────────────────────────────────────

interface GlobalHistory {
  pairCount: Map<string, number>;
  opponentCount: Map<string, number>;
  courtTogetherCount: Map<string, number>;
  sitOutTogetherCount: Map<string, number>;
  sitOutCount: Map<string, number>;
  playCount: Map<string, number>;
}

function makeHistory(players: Player[]): GlobalHistory {
  const playCount = new Map<string, number>();
  const sitOutCount = new Map<string, number>();
  for (const p of players) {
    playCount.set(p.id, 0);
    sitOutCount.set(p.id, 0);
  }
  return {
    pairCount: new Map(),
    opponentCount: new Map(),
    courtTogetherCount: new Map(),
    sitOutTogetherCount: new Map(),
    sitOutCount,
    playCount,
  };
}

function inc(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function updateHistory(
  courts: CourtGame[],
  sittingOut: Player[],
  history: GlobalHistory,
): void {
  for (const court of courts) {
    const allOnCourt = [...court.team1, ...court.team2];

    // playCount
    for (const p of allOnCourt) {
      inc(history.playCount, p.id);
    }

    // pairCount for each team
    for (const team of [court.team1, court.team2]) {
      for (let i = 0; i < team.length; i++) {
        for (let j = i + 1; j < team.length; j++) {
          inc(history.pairCount, pairKey(team[i].id, team[j].id));
        }
      }
    }

    // opponentCount: every cross-team pair
    for (const p1 of court.team1) {
      for (const p2 of court.team2) {
        inc(history.opponentCount, oppKey(p1.id, p2.id));
      }
    }

    // courtTogetherCount: every pair sharing a court
    for (let i = 0; i < allOnCourt.length; i++) {
      for (let j = i + 1; j < allOnCourt.length; j++) {
        inc(history.courtTogetherCount, pairKey(allOnCourt[i].id, allOnCourt[j].id));
      }
    }
  }

  // sitOutCount and sitOutTogetherCount
  for (const p of sittingOut) {
    inc(history.sitOutCount, p.id);
  }
  for (let i = 0; i < sittingOut.length; i++) {
    for (let j = i + 1; j < sittingOut.length; j++) {
      inc(history.sitOutTogetherCount, pairKey(sittingOut[i].id, sittingOut[j].id));
    }
  }
}

// ─── Weighted shuffle ─────────────────────────────────────────────────────────

function weightedShuffle(players: Player[], history: GlobalHistory): Player[] {
  const counts = players.map(p => history.playCount.get(p.id) ?? 0);
  const maxCount = Math.max(...counts, 0);
  const weights = counts.map(c => maxCount - c + 1);
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  const result: Player[] = [];
  const remaining = [...players];
  const remainingWeights = [...weights];

  while (remaining.length > 0) {
    let r = Math.random() * remainingWeights.reduce((a, b) => a + b, 0);
    let idx = 0;
    for (let i = 0; i < remainingWeights.length; i++) {
      r -= remainingWeights[i];
      if (r <= 0) { idx = i; break; }
    }
    result.push(remaining[idx]);
    remaining.splice(idx, 1);
    remainingWeights.splice(idx, 1);
  }

  void totalWeight;
  return result;
}

// ─── Split scoring ────────────────────────────────────────────────────────────

function splitScore(t1: Player[], t2: Player[], history: GlobalHistory): number {
  let score = 0;

  // pair scores
  for (const team of [t1, t2]) {
    for (let i = 0; i < team.length; i++) {
      for (let j = i + 1; j < team.length; j++) {
        const k = pairKey(team[i].id, team[j].id);
        const count = history.pairCount.get(k) ?? 0;
        score += count === 0 ? 2000 : -count * 5000;
      }
    }
  }

  // opponent scores
  for (const p1 of t1) {
    for (const p2 of t2) {
      const k = oppKey(p1.id, p2.id);
      const count = history.opponentCount.get(k) ?? 0;
      score += count === 0 ? 500 : -count * 1000;
    }
  }

  return score;
}

function bestGenericSplit(
  group: Player[],
  history: GlobalHistory,
): [Player[], Player[]] {
  // 3 ways to split 4 players into 2 pairs
  const splits: [Player[], Player[]][] = [
    [[group[0], group[1]], [group[2], group[3]]],
    [[group[0], group[2]], [group[1], group[3]]],
    [[group[0], group[3]], [group[1], group[2]]],
  ];

  let best = splits[0];
  let bestScore = splitScore(splits[0][0], splits[0][1], history);

  for (let i = 1; i < splits.length; i++) {
    const s = splitScore(splits[i][0], splits[i][1], history);
    if (s > bestScore) {
      bestScore = s;
      best = splits[i];
    }
  }

  return best;
}

function bestMixedSplit(
  group: Player[], // [m1, m2, f1, f2]
  history: GlobalHistory,
): [Player[], Player[]] {
  const [m1, m2, f1, f2] = group;
  // 2 valid male+female pairings:
  // Option A: (m1+f1) vs (m2+f2)
  // Option B: (m1+f2) vs (m2+f1)
  const optA: [Player[], Player[]] = [[m1, f1], [m2, f2]];
  const optB: [Player[], Player[]] = [[m1, f2], [m2, f1]];

  const scoreA = splitScore(optA[0], optA[1], history);
  const scoreB = splitScore(optB[0], optB[1], history);

  return scoreA >= scoreB ? optA : optB;
}

// ─── Round scoring ────────────────────────────────────────────────────────────

function scoreAssignment(
  courts: CourtGame[],
  sittingOut: Player[],
  history: GlobalHistory,
  allPlayers: Player[],
  prevSittingOut: Player[],
): number {
  let score = 0;

  // Sum splitScore for each court
  for (const court of courts) {
    score += splitScore(court.team1, court.team2, history);
  }

  // Court-together diversity bonus
  for (const court of courts) {
    const all = [...court.team1, ...court.team2];
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const k = pairKey(all[i].id, all[j].id);
        const count = history.courtTogetherCount.get(k) ?? 0;
        score += count === 0 ? 300 : -count * 400;
      }
    }
  }

  // Sit-out pair diversity
  for (let i = 0; i < sittingOut.length; i++) {
    for (let j = i + 1; j < sittingOut.length; j++) {
      const k = pairKey(sittingOut[i].id, sittingOut[j].id);
      const count = history.sitOutTogetherCount.get(k) ?? 0;
      score += count === 0 ? 500 : -count * 2000;
    }
  }

  // Sit-out rotation fairness penalty:
  // Heavily penalise picking a player to sit out who has already sat out
  // more times than the current minimum across ALL players.
  if (sittingOut.length > 0) {
    const minSitOutCount = Math.min(
      ...allPlayers.map(p => history.sitOutCount.get(p.id) ?? 0),
    );
    for (const p of sittingOut) {
      const excess = (history.sitOutCount.get(p.id) ?? 0) - minSitOutCount;
      if (excess > 0) {
        score -= excess * 10000;
      }
    }
  }

  // Consecutive sit-out penalty: very strongly penalise any player who sat out
  // last round sitting out again. This steers lower-priority fallback buckets
  // away from consecutive sit-outs even before the hard constraint is applied.
  if (sittingOut.length > 0 && prevSittingOut.length > 0) {
    const prevSitOutIds = new Set(prevSittingOut.map(p => p.id));
    for (const p of sittingOut) {
      if (prevSitOutIds.has(p.id)) {
        score -= 50000;
      }
    }
  }

  // Fair-play penalty: prefer sitting out players who have played more
  if (sittingOut.length > 0) {
    const playCounts = allPlayers.map(p => history.playCount.get(p.id) ?? 0);
    const sitOutPlayCounts = sittingOut.map(p => history.playCount.get(p.id) ?? 0);
    const maxPlay = Math.max(...playCounts);
    const minSitOutPlay = Math.min(...sitOutPlayCounts);
    if (maxPlay > minSitOutPlay) {
      score -= (maxPlay - minSitOutPlay) * 100;
    }
  }

  return score;
}

// ─── Constraint checkers ──────────────────────────────────────────────────────

function isSitOutUnfair(
  sittingOut: Player[],
  allPlayers: Player[],
  history: GlobalHistory,
  isMixed: boolean,
  allowSameGender: boolean,
): boolean {
  // A player is only eligible to sit out if their sit-out count equals the
  // current minimum across their pool. This enforces fairness across ALL
  // cycles — not just the first one — so no player can sit out twice before
  // everyone else has sat out once, three times before everyone has sat out
  // twice, and so on.

  if (isMixed && !allowSameGender) {
    // Strict mixed: males and females have independent sit-out pools.
    for (const gender of ['male', 'female'] as const) {
      const genderSittingOut = sittingOut.filter(p => p.gender === gender);
      if (genderSittingOut.length === 0) continue;

      const genderPlayers = allPlayers.filter(p => p.gender === gender);
      const minSitOut = Math.min(
        ...genderPlayers.map(p => history.sitOutCount.get(p.id) ?? 0),
      );

      // Unfair if any sitting-out player has a higher sit-out count than the minimum
      if (genderSittingOut.some(p => (history.sitOutCount.get(p.id) ?? 0) > minSitOut)) {
        return true;
      }
    }
    return false;
  }

  // Gender-based mode OR flexible mixed (allowSameGender=true): single combined pool.
  const minSitOut = Math.min(
    ...allPlayers.map(p => history.sitOutCount.get(p.id) ?? 0),
  );

  // Unfair if any sitting-out player has already sat out more than the minimum
  return sittingOut.some(p => (history.sitOutCount.get(p.id) ?? 0) > minSitOut);
}

function isConsecutivePair(
  courts: CourtGame[],
  prevRoundPairIds: Set<string>,
): boolean {
  for (const court of courts) {
    for (const team of [court.team1, court.team2]) {
      for (let i = 0; i < team.length; i++) {
        for (let j = i + 1; j < team.length; j++) {
          if (prevRoundPairIds.has(pairKey(team[i].id, team[j].id))) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

function isPrematurePairRepeat(
  courts: CourtGame[],
  allPlayers: Player[],
  history: GlobalHistory,
): boolean {
  for (const court of courts) {
    for (const team of [court.team1, court.team2]) {
      for (let i = 0; i < team.length; i++) {
        for (let j = i + 1; j < team.length; j++) {
          const k = pairKey(team[i].id, team[j].id);
          const count = history.pairCount.get(k) ?? 0;
          if (count > 0) {
            // Check if both players have someone they've partnered fewer times
            const pA = team[i];
            const pB = team[j];
            const aMin = Math.min(
              ...allPlayers
                .filter(p => p.id !== pA.id)
                .map(p => history.pairCount.get(pairKey(pA.id, p.id)) ?? 0),
            );
            const bMin = Math.min(
              ...allPlayers
                .filter(p => p.id !== pB.id)
                .map(p => history.pairCount.get(pairKey(pB.id, p.id)) ?? 0),
            );
            if (aMin < count && bMin < count) {
              return true;
            }
          }
        }
      }
    }
  }
  return false;
}

function isPrematureSitOutRepeat(
  sittingOut: Player[],
  allPlayers: Player[],
  history: GlobalHistory,
): boolean {
  // Build the eligible sit-out pool: only players who have sat out before OR are
  // sitting out in this round. This excludes players who can never sit out (e.g.
  // females in a mixed-mode setup where the female count exactly fills the courts),
  // which would otherwise make every sit-out pair permanently "premature".
  const sittingOutIds = new Set(sittingOut.map(p => p.id));
  const eligiblePool = new Set(
    allPlayers
      .filter(p => sittingOutIds.has(p.id) || (history.sitOutCount.get(p.id) ?? 0) > 0)
      .map(p => p.id),
  );

  for (let i = 0; i < sittingOut.length; i++) {
    for (let j = i + 1; j < sittingOut.length; j++) {
      const pA = sittingOut[i];
      const pB = sittingOut[j];
      const k = pairKey(pA.id, pB.id);
      const count = history.sitOutTogetherCount.get(k) ?? 0;
      if (count > 0) {
        // Others = eligible sit-out players, excluding the two under review
        const others = allPlayers.filter(
          p => p.id !== pA.id && p.id !== pB.id && eligiblePool.has(p.id),
        );

        // Premature if EITHER person still has an eligible partner they haven't
        // sat out with as many times as they've sat out with each other.
        const aHasUntapped =
          others.length > 0 &&
          others.some(
            p => (history.sitOutTogetherCount.get(pairKey(pA.id, p.id)) ?? 0) < count,
          );
        const bHasUntapped =
          others.length > 0 &&
          others.some(
            p => (history.sitOutTogetherCount.get(pairKey(pB.id, p.id)) ?? 0) < count,
          );

        if (aHasUntapped || bHasUntapped) {
          return true;
        }
      }
    }
  }
  return false;
}

// ─── Generate one round ───────────────────────────────────────────────────────

interface RoundResult {
  courts: CourtGame[];
  sittingOut: Player[];
}

function generateOneRound(
  players: Player[],
  numCourts: number,
  history: GlobalHistory,
  isMixed: boolean,
  allowSameGender: boolean,
  prevSittingOut: Player[],
  prevRoundPairIds: Set<string>,
): RoundResult {
  const allPlayers = players;
  // 6 priority buckets (0=fallback, 5=ideal)
  const buckets: Array<{ result: RoundResult; score: number } | null> = [
    null, null, null, null, null, null,
  ];

  for (let attempt = 0; attempt < 1000; attempt++) {
    const courts: CourtGame[] = [];
    let sittingOut: Player[];

    if (isMixed && !allowSameGender) {
      // Strict mixed: separate M/F pools, every pair must be 1M + 1F.
      const males = players.filter(p => p.gender === 'male');
      const females = players.filter(p => p.gender === 'female');
      const shuffledMales = weightedShuffle(males, history);
      const shuffledFemales = weightedShuffle(females, history);

      const playingMales = shuffledMales.slice(0, numCourts * 2);
      const playingFemales = shuffledFemales.slice(0, numCourts * 2);
      sittingOut = [
        ...shuffledMales.slice(numCourts * 2),
        ...shuffledFemales.slice(numCourts * 2),
      ];

      for (let c = 0; c < numCourts; c++) {
        const group = [
          playingMales[c * 2],
          playingMales[c * 2 + 1],
          playingFemales[c * 2],
          playingFemales[c * 2 + 1],
        ];
        const [team1, team2] = bestMixedSplit(group, history);
        courts.push({ courtNumber: c + 1, team1, team2 });
      }
    } else {
      // Gender-based mode OR flexible mixed (allowSameGender=true):
      // single combined pool, any pairing allowed. Players still carry their
      // gender attribute so the table can display ♂/♀ indicators.
      const shuffled = weightedShuffle(players, history);
      const playing = shuffled.slice(0, numCourts * 4);
      sittingOut = shuffled.slice(numCourts * 4);

      for (let c = 0; c < numCourts; c++) {
        const group = playing.slice(c * 4, c * 4 + 4);
        const [team1, team2] = bestGenericSplit(group, history);
        courts.push({ courtNumber: c + 1, team1, team2 });
      }
    }

    const score = scoreAssignment(courts, sittingOut, history, allPlayers, prevSittingOut);

    // Bucket 0: always store fallback
    if (!buckets[0] || score > buckets[0].score) {
      buckets[0] = { result: { courts, sittingOut }, score };
    }

    // Bucket 1: sit-out is fair.
    // *** Checked FIRST among hard constraints ***
    // Pair-diversity checks (buckets 2 & 3) must never be allowed to cascade
    // and block fairness. Example: with 5 players (3M+2F), 1 court, after 3
    // rounds where only males have sat out, every possible playing group for
    // the remaining fair candidates (F1 or F2 sitting out) triggers a premature
    // pair repeat — because F1/F2 have now played with everyone. If fairness
    // were downstream of pair diversity, bucket 3 would always be empty and we
    // would fall back to bucket 2 with an unfair (male) sit-out.
    if (isSitOutUnfair(sittingOut, allPlayers, history, isMixed, allowSameGender)) continue;
    if (!buckets[1] || score > buckets[1].score) {
      buckets[1] = { result: { courts, sittingOut }, score };
    }

    // Bucket 2: also no consecutive pair
    if (isConsecutivePair(courts, prevRoundPairIds)) continue;
    if (!buckets[2] || score > buckets[2].score) {
      buckets[2] = { result: { courts, sittingOut }, score };
    }

    // Bucket 3: also no premature pair repeat
    if (isPrematurePairRepeat(courts, allPlayers, history)) continue;
    if (!buckets[3] || score > buckets[3].score) {
      buckets[3] = { result: { courts, sittingOut }, score };
    }

    // Bucket 4: also no consecutive sit-out (no player sits out twice in a row).
    // Checked BEFORE premature-sit-out-repeat: in certain combinations (e.g.
    // 12 players, 2 courts) it becomes mathematically impossible to avoid a
    // sit-out pair repeat after the first cycle, which would otherwise
    // permanently block this bucket and leave consecutive sit-outs unguarded.
    const prevSitOutIds = new Set(prevSittingOut.map(p => p.id));
    const hasConsecutiveSitOut = sittingOut.some(p => prevSitOutIds.has(p.id));
    if (hasConsecutiveSitOut) continue;
    if (!buckets[4] || score > buckets[4].score) {
      buckets[4] = { result: { courts, sittingOut }, score };
    }

    // Bucket 5: also no premature sit-out repeat (nice-to-have on top of above)
    if (isPrematureSitOutRepeat(sittingOut, allPlayers, history)) continue;
    if (!buckets[5] || score > buckets[5].score) {
      buckets[5] = { result: { courts, sittingOut }, score };
    }
  }

  // Return best from highest priority non-null bucket
  for (let i = 5; i >= 0; i--) {
    if (buckets[i]) return buckets[i]!.result;
  }

  // Should never reach here, but safety fallback
  return buckets[0]!.result;
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
      // Flexible mixed: only requires enough total players (same as gender-based).
      if (players.length < numCourts * 4) {
        errors.push(
          `Need at least ${numCourts * 4} players for ${numCourts} court${numCourts > 1 ? 's' : ''} (have ${players.length}).`,
        );
      }
    } else {
      // Strict mixed: need at least numCourts * 2 of each gender.
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
  let prevRoundPairIds = new Set<string>();

  for (let r = 0; r < numRounds; r++) {
    const { courts, sittingOut } = generateOneRound(
      players,
      numCourts,
      history,
      isMixed,
      allowSameGender,
      prevSittingOut,
      prevRoundPairIds,
    );

    rounds.push({ roundNumber: r + 1, courts, sittingOut });
    updateHistory(courts, sittingOut, history);

    prevSittingOut = sittingOut;
    prevRoundPairIds = new Set<string>();
    for (const court of courts) {
      for (const team of [court.team1, court.team2]) {
        for (let i = 0; i < team.length; i++) {
          for (let j = i + 1; j < team.length; j++) {
            prevRoundPairIds.add(pairKey(team[i].id, team[j].id));
          }
        }
      }
    }
  }

  return { rounds, rosterType, allPlayers: players, numCourts, sessionName, allowSameGender };
}
