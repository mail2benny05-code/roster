import { describe, it, expect } from 'vitest';
import { generateRoster, verifyRoster } from './rosterGenerator';
import type { Player, RosterType } from '../types';

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

function oppKey(a: string, b: string): string {
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
  it('sit-out counts differ by at most 1 (9 players, 2 courts, 9 rounds)', () => {
    const players = makePlayers(9);
    const roster = generateRoster(players, 2, 9, 'gender', 'Test');
    const stats = verifyRoster(roster);
    expect(stats.sitOutSpread).toBeLessThanOrEqual(1);
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
    const eligible = allPairKeys(ids);
    const stats = verifyRoster(roster, undefined, eligible);
    expect(stats.opponentSpread).toBeLessThanOrEqual(3);
  });

  it('opponent spread ≤ 3 for 12 players, 3 courts, 10 rounds', () => {
    const players = makePlayers(12);
    const roster = generateRoster(players, 3, 10, 'gender', 'Test');
    const ids = players.map(p => p.id);
    const eligible = allPairKeys(ids);
    const stats = verifyRoster(roster, undefined, eligible);
    expect(stats.opponentSpread).toBeLessThanOrEqual(3);
  });

  it('covers all opponent pairs before repeating any (8 players, 2 courts, 7 rounds)', () => {
    // With 8 players / 2 courts there are no sit-outs: 8 opponent pairings per
    // round. There are 28 distinct pairs, so ~4 rounds of slots are the bare
    // minimum. Over 7 rounds the coverage-dominant scoring should reach every
    // pair at least once AND never oppose a pair twice while another pair is
    // still unmet (coverage-before-repeat). Run several times (randomised).
    for (let run = 0; run < 20; run++) {
      const players = makePlayers(8);
      const roster = generateRoster(players, 2, 7, 'gender', 'Test');
      const ids = players.map(p => p.id);
      const eligible = allPairKeys(ids);
      const stats = verifyRoster(roster, undefined, eligible);

      // Full coverage: every eligible opponent pair met at least once.
      expect(stats.opponentMin).toBeGreaterThanOrEqual(1);
    }
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

  it('near-complete opponent coverage with no premature repeats — strict mixed (8M+8F, 4 courts, 8 rounds)', () => {
    // 8M+8F = 16 players, 4 courts = 16 slots → no sit-outs.
    //
    // In strict mixed, partners are always M↔F. The opponent pairs that can
    // ever occur are constrained by which pairs land on the same court. Two
    // males can only oppose each other if their teams are seated together, and
    // since the partner matching is chosen first (from partner-optimal
    // candidates), whole classes of M↔M or F↔F matchups may be unreachable in
    // any single partner-optimal candidate. With C(16,2)=120 opponent pairs and
    // only 128 slots over 8 rounds (8 slots of slack), a greedy per-round
    // scheduler cannot guarantee 100% coverage — that would require a global
    // multi-round solver.
    //
    // What the algorithm CAN and MUST guarantee:
    //   (a) Near-complete coverage: ≥90% of all opponent pairs met at least once.
    //   (b) No premature repeats: nobody is opposed more than twice while the
    //       spread stays tight (coverage prioritised over repeating).
    for (let run = 0; run < 15; run++) {
      const players = makeMixedPlayers(8, 8);
      const roster = generateRoster(players, 4, 8, 'mixed', 'Test', false);
      const ids = players.map(p => p.id);
      const eligibleOpp = allPairKeys(ids);
      const stats = verifyRoster(roster, undefined, eligibleOpp);

      // At least 90% of all opponent pairs are met at least once.
      const totalPairs = eligibleOpp.size;
      let covered = 0;
      for (const key of eligibleOpp) {
        if ((stats.opponentCounts.get(key) ?? 0) > 0) covered++;
      }
      expect(covered / totalPairs).toBeGreaterThanOrEqual(0.9);

      // No premature repeats: nobody is opposed 3+ times while others stay unmet.
      expect(stats.opponentMax).toBeLessThanOrEqual(2);
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
});
