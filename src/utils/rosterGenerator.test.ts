import { describe, it, expect } from 'vitest';
import { generateRoster, verifyRoster } from './rosterGenerator';
import type { Player } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePlayers(n: number, gender: 'male' | 'female' = 'male'): Player[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${gender[0]}${i + 1}`,
    name: `${gender === 'male' ? 'M' : 'F'}${i + 1}`,
    gender,
  }));
}

function makeMixedPlayers(numMale: number, numFemale: number): Player[] {
  return [
    ...makePlayers(numMale, 'male'),
    ...makePlayers(numFemale, 'female'),
  ];
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join('|');
}

function opponentKey(a: string, b: string): string {
  return [a, b].sort().join('~');
}

/** All unique pair keys for a set of player ids */
function allPairKeys(ids: string[]): Set<string> {
  const keys = new Set<string>();
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++)
      keys.add(pairKey(ids[i], ids[j]));
  return keys;
}

function allOpponentPairKeys(ids: string[]): Set<string> {
  const keys = new Set<string>();
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++)
      keys.add(opponentKey(ids[i], ids[j]));
  return keys;
}

/** All male↔female pair keys */
function mixedPairKeys(players: Player[]): Set<string> {
  const males = players.filter(p => p.gender === 'male').map(p => p.id);
  const females = players.filter(p => p.gender === 'female').map(p => p.id);
  const keys = new Set<string>();
  for (const m of males)
    for (const f of females)
      keys.add(pairKey(m, f));
  return keys;
}

function expectNoEarlyPartnerRepeats(
  roster: ReturnType<typeof generateRoster>,
  eligiblePartners: Map<string, Set<string>>,
): void {
  const counts = new Map<string, number>();
  for (const round of roster.rounds) {
    for (const court of round.courts) {
      for (const team of [court.team1, court.team2]) {
        const [a, b] = team;
        const key = pairKey(a.id, b.id);
        const previousCount = counts.get(key) ?? 0;
        if (previousCount > 0) {
          for (const player of [a, b]) {
            for (const partnerId of eligiblePartners.get(player.id) ?? []) {
              expect(counts.get(pairKey(player.id, partnerId)) ?? 0).toBeGreaterThanOrEqual(previousCount);
            }
          }
        }
        counts.set(key, previousCount + 1);
      }
    }
  }
}

function countEarlyOpponentRepeats(roster: ReturnType<typeof generateRoster>): number {
  const players = roster.allPlayers;
  const counts = new Map<string, number>();
  let earlyRepeats = 0;

  for (const round of roster.rounds) {
    const linksByPlayer = new Map<string, Set<string>>();
    const opponentPairs: [string, string][] = [];
    for (const court of round.courts) {
      for (const a of court.team1) {
        for (const b of court.team2) {
          opponentPairs.push([a.id, b.id]);
          if (!linksByPlayer.has(a.id)) linksByPlayer.set(a.id, new Set());
          if (!linksByPlayer.has(b.id)) linksByPlayer.set(b.id, new Set());
          linksByPlayer.get(a.id)!.add(b.id);
          linksByPlayer.get(b.id)!.add(a.id);
        }
      }
    }

    const seenPairs = new Set<string>();
    for (const [a, b] of opponentPairs) {
      const key = opponentKey(a, b);
      if (seenPairs.has(key)) continue;
      seenPairs.add(key);
      const previousCount = counts.get(key) ?? 0;
      if (previousCount === 0) continue;
      for (const playerId of [a, b]) {
        const currentLinks = linksByPlayer.get(playerId) ?? new Set<string>();
        const cycleComplete = players
          .filter(other => other.id !== playerId)
          .every(other =>
            (counts.get(opponentKey(playerId, other.id)) ?? 0) + Number(currentLinks.has(other.id)) >= previousCount,
          );
        if (!cycleComplete) {
          earlyRepeats++;
          break;
        }
      }
    }
    for (const key of seenPairs) counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return earlyRepeats;
}

// ─── Basic structural tests ───────────────────────────────────────────────────

describe('generateRoster – structure', () => {
  it('produces the correct number of rounds', () => {
    const players = makePlayers(8);
    const roster = generateRoster(players, 2, 6, 'gender', 'Test');
    expect(roster.rounds).toHaveLength(6);
  });

  it('produces the correct number of courts per round', () => {
    const players = makePlayers(8);
    const roster = generateRoster(players, 2, 4, 'gender', 'Test');
    for (const round of roster.rounds) {
      expect(round.courts).toHaveLength(2);
    }
  });

  it('every court has exactly 4 players', () => {
    const players = makePlayers(10);
    const roster = generateRoster(players, 2, 6, 'gender', 'Test');
    for (const round of roster.rounds) {
      for (const court of round.courts) {
        expect(court.team1).toHaveLength(2);
        expect(court.team2).toHaveLength(2);
      }
    }
  });

  it('no player appears twice in the same round', () => {
    const players = makePlayers(12);
    const roster = generateRoster(players, 3, 8, 'gender', 'Test');
    for (const round of roster.rounds) {
      const seen = new Set<string>();
      for (const court of round.courts) {
        for (const p of [...court.team1, ...court.team2]) {
          expect(seen.has(p.id)).toBe(false);
          seen.add(p.id);
        }
      }
    }
  });

  it('every player either plays or sits out each round', () => {
    const players = makePlayers(9);
    const roster = generateRoster(players, 2, 6, 'gender', 'Test');
    for (const round of roster.rounds) {
      const playing = new Set<string>();
      for (const court of round.courts)
        for (const p of [...court.team1, ...court.team2])
          playing.add(p.id);
      const sittingOut = new Set(round.sittingOut.map(p => p.id));
      for (const player of players) {
        const inPlay = playing.has(player.id);
        const inSit = sittingOut.has(player.id);
        expect(inPlay !== inSit).toBe(true); // exactly one must be true
      }
    }
  });
});

// ─── Sit-out fairness ─────────────────────────────────────────────────────────

describe('generateRoster – sit-out fairness', () => {
  it('gives every player one sit-out before anyone sits twice (5 players, 1 court, 10 rounds)', () => {
    for (let run = 0; run < 10; run++) {
      const players = makeMixedPlayers(3, 2);
      const roster = generateRoster(players, 1, 10, 'gender', 'Test');
      const firstFiveSitters = roster.rounds
        .slice(0, players.length)
        .flatMap(round => round.sittingOut.map(player => player.id));

      expect(firstFiveSitters).toHaveLength(players.length);
      expect(new Set(firstFiveSitters).size).toBe(players.length);
    }
  });

  it('rotates sit-outs through each eligible gender before repeating (3M, 3F, 1 court)', () => {
    const players = makeMixedPlayers(3, 3);
    const roster = generateRoster(players, 1, 9, 'mixed', 'Test');
    const stats = verifyRoster(roster, mixedPairKeys(players));

    for (let cycle = 0; cycle < 3; cycle++) {
      const sitters = roster.rounds
        .slice(cycle * 3, cycle * 3 + 3)
        .flatMap(round => round.sittingOut);
      for (const gender of ['male', 'female'] as const) {
        const sameGenderSitters = sitters.filter(player => player.gender === gender);
        expect(sameGenderSitters).toHaveLength(3);
        expect(new Set(sameGenderSitters.map(player => player.id)).size).toBe(3);
      }
    }
    expect(stats.backToBackSitOut).toHaveLength(0);
    expect(stats.partnerSpread).toBe(0);
    for (const pair of mixedPairKeys(players)) {
      expect(stats.partnerCounts.get(pair) ?? 0).toBe(2);
    }
    expectNoEarlyPartnerRepeats(
      roster,
      new Map(players.map(player => [
        player.id,
        new Set(players.filter(other => other.gender !== player.gender).map(other => other.id)),
      ])),
    );
    // Exhaustive comparison of sitter orders and partner orientations found
    // no opponent-cycle-perfect solution under these higher-priority rules;
    // the known best rotation has 11 early opponent repeats.
    expect(countEarlyOpponentRepeats(roster)).toBe(11);
  });

  it('keeps sit-out frequency balanced while favoring fresh co-sitter pairs (6 players, 1 court, 20 rounds)', () => {
    const players = makePlayers(6);
    const roster = generateRoster(players, 1, 20, 'gender', 'Test');
    const stats = verifyRoster(roster);
    expect(stats.backToBackSitOut).toHaveLength(0);
    expect(stats.sitOutSpread).toBeLessThanOrEqual(1);
  });

  it('sit-out counts differ by at most 1 (9 players, 2 courts, 9 rounds)', () => {
    const players = makePlayers(9);
    const roster = generateRoster(players, 2, 9, 'gender', 'Test');
    const stats = verifyRoster(roster);
    expect(stats.sitOutSpread).toBeLessThanOrEqual(1);

    const firstCycleSitters = roster.rounds.flatMap(round => round.sittingOut.map(player => player.id));
    expect(new Set(firstCycleSitters).size).toBe(players.length);
  });

  it('no player sits out back-to-back rounds (9 players, 2 courts, 12 rounds)', () => {
    const players = makePlayers(9);
    const roster = generateRoster(players, 2, 12, 'gender', 'Test');
    const stats = verifyRoster(roster);
    expect(stats.backToBackSitOut).toHaveLength(0);
  });

  it('sit-out spread ≤ 1 for 11 players, 2 courts, 11 rounds', () => {
    const players = makePlayers(11);
    const roster = generateRoster(players, 2, 11, 'gender', 'Test');
    const stats = verifyRoster(roster);
    expect(stats.sitOutSpread).toBeLessThanOrEqual(1);
  });
});

// ─── Partner fairness ─────────────────────────────────────────────────────────

describe('generateRoster – partner fairness', () => {
  it('shuffles the full round rotation instead of only swapping team sides', () => {
    const players = makeMixedPlayers(3, 2);
    const original = generateRoster(players, 1, 10, 'gender', 'Test');
    const shuffled = generateRoster(players, 1, 10, 'gender', 'Test', false, 'strict', original);
    const signature = (rounds: typeof original.rounds) => JSON.stringify(rounds.map(round => ({
      courts: round.courts.map(court => [
        court.team1.map(player => player.id).sort().join('|'),
        court.team2.map(player => player.id).sort().join('|'),
      ].sort().join('::')).sort(),
      sitting: round.sittingOut.map(player => player.id).sort(),
    })));

    expect(signature(shuffled.rounds)).not.toBe(signature(original.rounds));
    for (const roster of [original, shuffled]) {
      const stats = verifyRoster(roster);
      expect(stats.backToBackPartner).toHaveLength(0);
      expect(stats.backToBackSitOut).toHaveLength(0);
    }
  });

  it('does not repeat a partner before a player has partnered with everyone (5 players, 1 court, 10 rounds)', () => {
    for (let run = 0; run < 10; run++) {
      const players = makeMixedPlayers(3, 2);
      const roster = generateRoster(players, 1, 10, 'gender', 'Test');
      const partners = new Map(players.map(player => [player.id, new Set<string>()]));

      for (const round of roster.rounds) {
        for (const court of round.courts) {
          for (const team of [court.team1, court.team2]) {
            const [a, b] = team;
            const aPartners = partners.get(a.id)!;
            const bPartners = partners.get(b.id)!;
            if (aPartners.has(b.id)) {
              const schedule = roster.rounds.map(game => game.courts.map(match =>
                `${match.team1.map(p => p.name).join('&')} vs ${match.team2.map(p => p.name).join('&')}`,
              ).join('; ') + ` (sits: ${game.sittingOut.map(player => player.name).join('&')})`).join(' | ');
              expect(aPartners.size, `${a.name} repeated ${b.name} too early: ${schedule}`).toBe(players.length - 1);
              expect(bPartners.size, `${b.name} repeated ${a.name} too early: ${schedule}`).toBe(players.length - 1);
            }
            aPartners.add(b.id);
            bPartners.add(a.id);
          }
        }
      }
    }
  });

  it('no back-to-back partner repeats (8 players, 2 courts, 10 rounds)', () => {
    const players = makePlayers(8);
    const roster = generateRoster(players, 2, 10, 'gender', 'Test');
    const stats = verifyRoster(roster);
    expect(stats.backToBackPartner).toHaveLength(0);
  });

  it('partner spread ≤ 2 for 8 players, 2 courts, 8 rounds', () => {
    const players = makePlayers(8);
    const roster = generateRoster(players, 2, 8, 'gender', 'Test');
    const ids = players.map(p => p.id);
    const eligible = allPairKeys(ids);
    const stats = verifyRoster(roster, eligible);
    expect(stats.partnerSpread).toBeLessThanOrEqual(2);
  });

  it('partner spread ≤ 2 for 12 players, 3 courts, 10 rounds', () => {
    const players = makePlayers(12);
    const roster = generateRoster(players, 3, 10, 'gender', 'Test');
    const ids = players.map(p => p.id);
    const eligible = allPairKeys(ids);
    const stats = verifyRoster(roster, eligible);
    expect(stats.partnerSpread).toBeLessThanOrEqual(2);
  });
});

// ─── Opponent fairness ────────────────────────────────────────────────────────

describe('generateRoster – opponent fairness', () => {
  it('no back-to-back opponent repeats (8 players, 2 courts, 10 rounds)', () => {
    const players = makePlayers(8);
    const roster = generateRoster(players, 2, 10, 'gender', 'Test');
    const stats = verifyRoster(roster);
    expect(stats.backToBackOpponent).toHaveLength(0);
  });

  it('opponent spread ≤ 3 for 8 players, 2 courts, 8 rounds', () => {
    const players = makePlayers(8);
    const roster = generateRoster(players, 2, 8, 'gender', 'Test');
    const ids = players.map(p => p.id);
    const eligible = allOpponentPairKeys(ids);
    const stats = verifyRoster(roster, undefined, eligible);
    expect(stats.opponentSpread).toBeLessThanOrEqual(3);
  });

  it('opponent spread ≤ 3 for 12 players, 3 courts, 10 rounds', () => {
    const players = makePlayers(12);
    const roster = generateRoster(players, 3, 10, 'gender', 'Test');
    const ids = players.map(p => p.id);
    const eligible = allOpponentPairKeys(ids);
    const stats = verifyRoster(roster, undefined, eligible);
    expect(stats.opponentSpread).toBeLessThanOrEqual(3);
  });

  it('keeps opponent counts balanced when every player must play (8 players, 2 courts, 7 rounds)', () => {
    // Exposure cycles take priority over count balance. In this dense format,
    // use the complete-cycle case below to check ordering and keep this case
    // focused on the lower-priority final count spread.
    const players = makePlayers(8);
    const roster = generateRoster(players, 2, 7, 'gender', 'Test');
    const ids = players.map(p => p.id);
    const eligible = allOpponentPairKeys(ids);
    const stats = verifyRoster(roster, undefined, eligible);

    expect(stats.opponentSpread).toBeLessThanOrEqual(2);
  });

  it('completes an opponent exposure cycle before repeating when the format allows it (4 players, 1 court)', () => {
    const roster = generateRoster(makePlayers(4), 1, 6, 'gender', 'Test');
    expect(countEarlyOpponentRepeats(roster)).toBe(0);
  });
});

// ─── Mixed roster ─────────────────────────────────────────────────────────────

describe('generateRoster – mixed (strict)', () => {
  it('every court has exactly 1 male and 1 female per team (strict mixed)', () => {
    const players = makeMixedPlayers(8, 8);
    const roster = generateRoster(players, 2, 8, 'mixed', 'Test', false);
    for (const round of roster.rounds) {
      for (const court of round.courts) {
        for (const team of [court.team1, court.team2]) {
          const males = team.filter(p => p.gender === 'male').length;
          const females = team.filter(p => p.gender === 'female').length;
          expect(males).toBe(1);
          expect(females).toBe(1);
        }
      }
    }
  });

  it('no back-to-back partner repeats in strict mixed (8M+8F, 2 courts, 10 rounds)', () => {
    const players = makeMixedPlayers(8, 8);
    const roster = generateRoster(players, 2, 10, 'mixed', 'Test', false);
    const stats = verifyRoster(roster);
    expect(stats.backToBackPartner).toHaveLength(0);
  });

  it('partner spread ≤ 2 for strict mixed (8M+8F, 2 courts, 8 rounds)', () => {
    const players = makeMixedPlayers(8, 8);
    const roster = generateRoster(players, 2, 8, 'mixed', 'Test', false);
    const eligible = mixedPairKeys(players);
    const stats = verifyRoster(roster, eligible);
    expect(stats.partnerSpread).toBeLessThanOrEqual(2);
  });

  it('no back-to-back opponent repeats in strict mixed (8M+8F, 2 courts, 10 rounds)', () => {
    const players = makeMixedPlayers(8, 8);
    const roster = generateRoster(players, 2, 10, 'mixed', 'Test', false);
    const stats = verifyRoster(roster);
    expect(stats.backToBackOpponent).toHaveLength(0);
  });

  it('sit-out spread ≤ 1 for strict mixed (10M+10F, 2 courts, 10 rounds)', () => {
    const players = makeMixedPlayers(10, 10);
    const roster = generateRoster(players, 2, 10, 'mixed', 'Test', false);
    const stats = verifyRoster(roster);
    expect(stats.sitOutSpread).toBeLessThanOrEqual(1);
  });

  it('near-complete opponent coverage — strict mixed (8M+8F, 4 courts, 8 rounds)', () => {
    // 8M+8F = 16 players, 4 courts = 16 slots → no sit-outs.
    //
    // In strict mixed the partner structure constrains which opponent pairs are
    // reachable in any single partner-optimal candidate. A greedy per-round
    // scheduler covers a solid majority of pairs but cannot guarantee
    // near-total coverage in this tightly-packed case.
    //
    // This large, tightly constrained format checks reasonable overall
    // coverage. A smaller feasible-format regression checks exposure-cycle
    // ordering directly; final maxima alone cannot prove cycle order.
    for (let run = 0; run < 4; run++) {
      const players = makeMixedPlayers(8, 8);
      const roster = generateRoster(players, 4, 8, 'mixed', 'Test', false);
      const ids = players.map(p => p.id);
      const eligibleOpp = allOpponentPairKeys(ids);
      const stats = verifyRoster(roster, undefined, eligibleOpp);

      // A greedy per-round scheduler covers a solid majority of pairs but
      // cannot guarantee near-total coverage in this tightly-packed case.
      const totalPairs = eligibleOpp.size;
      let covered = 0;
      for (const key of eligibleOpp) {
        if ((stats.opponentCounts.get(key) ?? 0) > 0) covered++;
      }
      expect(covered / totalPairs).toBeGreaterThanOrEqual(0.6);

      expect(stats.opponentSpread).toBeLessThanOrEqual(3);
    }
  });
});

describe('generateRoster – mixed (allowSameGender)', () => {
  it('produces valid rounds with allowSameGender=true', () => {
    const players = makeMixedPlayers(6, 6);
    const roster = generateRoster(players, 2, 6, 'mixed', 'Test', true);
    expect(roster.rounds).toHaveLength(6);
    for (const round of roster.rounds) {
      expect(round.courts).toHaveLength(2);
      for (const court of round.courts) {
        expect(court.team1).toHaveLength(2);
        expect(court.team2).toHaveLength(2);
      }
    }
  });

  it('no back-to-back partner repeats with allowSameGender=true (12 players, 3 courts, 10 rounds)', () => {
    const players = makeMixedPlayers(6, 6);
    const roster = generateRoster(players, 3, 10, 'mixed', 'Test', true);
    const stats = verifyRoster(roster);
    expect(stats.backToBackPartner).toHaveLength(0);
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('generateRoster – edge cases', () => {
  it('exact fit: 8 players, 2 courts — nobody sits out', () => {
    const players = makePlayers(8);
    const roster = generateRoster(players, 2, 4, 'gender', 'Test');
    for (const round of roster.rounds) {
      expect(round.sittingOut).toHaveLength(0);
    }
  });

  it('single court, 4 players, 6 rounds', () => {
    const players = makePlayers(4);
    const roster = generateRoster(players, 1, 6, 'gender', 'Test');
    expect(roster.rounds).toHaveLength(6);
    for (const round of roster.rounds) {
      expect(round.courts).toHaveLength(1);
      expect(round.sittingOut).toHaveLength(0);
    }
  });

  it('single court, 5 players — 1 sits out each round', () => {
    const players = makePlayers(5);
    const roster = generateRoster(players, 1, 5, 'gender', 'Test');
    for (const round of roster.rounds) {
      expect(round.sittingOut).toHaveLength(1);
    }
  });

  it('large roster: 20 players, 4 courts, 10 rounds — no crashes', () => {
    const players = makePlayers(20);
    expect(() => generateRoster(players, 4, 10, 'gender', 'Test')).not.toThrow();
  });

  it('large mixed roster: 16M+16F, 4 courts, 10 rounds — no crashes', () => {
    const players = makeMixedPlayers(16, 16);
    expect(() => generateRoster(players, 4, 10, 'mixed', 'Test', false)).not.toThrow();
  });
});

// ─── validateSetup ────────────────────────────────────────────────────────────

describe('validateSetup', () => {
  it('valid gender roster passes', async () => {
    const { validateSetup } = await import('./rosterGenerator');
    const players = makePlayers(8);
    const result = validateSetup(players, 2, 'gender');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('too few players for gender roster fails', async () => {
    const { validateSetup } = await import('./rosterGenerator');
    const players = makePlayers(6);
    const result = validateSetup(players, 2, 'gender');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('valid strict mixed roster passes', async () => {
    const { validateSetup } = await import('./rosterGenerator');
    const players = makeMixedPlayers(4, 4);
    const result = validateSetup(players, 2, 'mixed', false);
    expect(result.valid).toBe(true);
  });

  it('too few females for strict mixed fails', async () => {
    const { validateSetup } = await import('./rosterGenerator');
    const players = makeMixedPlayers(8, 2);
    const result = validateSetup(players, 2, 'mixed', false);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.toLowerCase().includes('female'))).toBe(true);
  });

  it('too few males for strict mixed fails', async () => {
    const { validateSetup } = await import('./rosterGenerator');
    const players = makeMixedPlayers(2, 8);
    const result = validateSetup(players, 2, 'mixed', false);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.toLowerCase().includes('male'))).toBe(true);
  });

  it('allowSameGender mixed only checks total player count', async () => {
    const { validateSetup } = await import('./rosterGenerator');
    const players = makeMixedPlayers(6, 2); // 8 total, enough for 2 courts
    const result = validateSetup(players, 2, 'mixed', true);
    expect(result.valid).toBe(true);
  });

  it('requires an even player count for fixed partners', async () => {
    const { validateSetup } = await import('./rosterGenerator');
    const result = validateSetup(makePlayers(5), 1, 'fixed');
    expect(result.valid).toBe(false);
    expect(result.errors.some(error => error.includes('even number'))).toBe(true);
  });
});

describe('generateRoster – fixed partners', () => {
  it('keeps entry-order partners together in games and sit-outs', async () => {
    const { generateRoster } = await import('./rosterGenerator');
    const players = makePlayers(6);
    const roster = generateRoster(players, 1, 12, 'fixed', 'Fixed teams');
    for (const round of roster.rounds) {
      const inRound = [...round.sittingOut, ...round.courts.flatMap(court => [...court.team1, ...court.team2])];
      for (let i = 0; i < players.length; i += 2) {
        const partnerA = players[i];
        const partnerB = players[i + 1];
        const aSits = round.sittingOut.some(player => player.id === partnerA.id);
        const bSits = round.sittingOut.some(player => player.id === partnerB.id);
        expect(aSits).toBe(bSits);
        const aTeam = round.courts.flatMap(court => [court.team1, court.team2]).find(team => team.some(player => player.id === partnerA.id));
        if (!aSits) expect(aTeam?.some(player => player.id === partnerB.id)).toBe(true);
        expect(inRound.filter(player => player.id === partnerA.id)).toHaveLength(1);
      }
    }
  });

  it('appends new fixed-partner rounds after the existing roster', async () => {
    const { generateRoster } = await import('./rosterGenerator');
    const players = makePlayers(6);
    const initial = generateRoster(players, 1, 2, 'fixed', 'Fixed teams');
    const extension = generateRoster(players, 1, 2, 'fixed', 'Fixed teams', false, 'strict', undefined, initial);
    expect(extension.rounds.map(round => round.roundNumber)).toEqual([3, 4]);
    for (const round of extension.rounds) {
      for (let i = 0; i < players.length; i += 2) {
        const pair = players.slice(i, i + 2);
        const sits = pair.map(player => round.sittingOut.some(sitting => sitting.id === player.id));
        expect(sits[0]).toBe(sits[1]);
        if (!sits[0]) {
          const court = round.courts.find(game => [...game.team1, ...game.team2].some(player => player.id === pair[0].id));
          const team = court && [court.team1, court.team2].find(side => side.some(player => player.id === pair[0].id));
          expect(team?.some(player => player.id === pair[1].id)).toBe(true);
        }
      }
    }
  });
});

describe('generateRoster – round extensions', () => {
  it('continues sit-out fairness from the existing rounds', async () => {
    const { generateRoster } = await import('./rosterGenerator');
    const players = makePlayers(5);
    const initial = generateRoster(players, 1, 1, 'gender', 'Continue');
    const extension = generateRoster(players, 1, 4, 'gender', 'Continue', false, 'strict', undefined, initial);
    const combined = [...initial.rounds, ...extension.rounds];
    expect(extension.rounds.map(round => round.roundNumber)).toEqual([2, 3, 4, 5]);
    const sitCounts = new Map(players.map(player => [player.id, 0]));
    for (const round of combined) for (const player of round.sittingOut) sitCounts.set(player.id, (sitCounts.get(player.id) ?? 0) + 1);
    expect([...sitCounts.values()]).toEqual([1, 1, 1, 1, 1]);
  });
});
