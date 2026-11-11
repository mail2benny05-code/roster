import { describe, expect, it } from 'vitest';
import type { Player, RosterData } from '../types';
import { reshuffleRounds, swapOptions, swapRoundPlayers } from './rosterAdjustments';

function player(id: string, gender?: Player['gender']): Player {
  return { id, name: id.toUpperCase(), gender };
}

function roster(players: Player[], rosterType: RosterData['rosterType'], rounds: RosterData['rounds']): RosterData {
  return { rosterType, rounds, allPlayers: players, partnerMode: 'strict', numCourts: 1, sessionName: '', allowSameGender: false };
}

describe('manual round swaps', () => {
  it('swaps a player with a sitter without duplicating anyone', () => {
    const [a, b, c, d, e] = ['a', 'b', 'c', 'd', 'e'].map(id => player(id));
    const data = roster([a, b, c, d, e], 'gender', [
      { roundNumber: 1, courts: [{ courtNumber: 1, team1: [a, b], team2: [c, d] }], sittingOut: [e] },
      { roundNumber: 2, courts: [{ courtNumber: 1, team1: [e, b], team2: [c, d] }], sittingOut: [a] },
    ]);
    const swapped = swapRoundPlayers(data, 1, 'b', 'e');
    expect(swapped?.courts[0].team1.map(p => p.id)).toEqual(['a', 'e']);
    expect(swapped?.sittingOut.map(p => p.id)).toEqual(['b']);
    expect(data.rounds[0].courts[0].team1.map(p => p.id)).toEqual(['a', 'b']);
    expect(swapRoundPlayers(data, 1, 'a', 'e')).toBeNull(); // would sit out in consecutive rounds
  });

  it('keeps strict mixed partners opposite gender', () => {
    const [m1, m2, m3] = ['m1', 'm2', 'm3'].map(id => player(id, 'male'));
    const [f1, f2, f3] = ['f1', 'f2', 'f3'].map(id => player(id, 'female'));
    const data = roster([m1, f1, m2, f2, m3, f3], 'mixed', [
      { roundNumber: 1, courts: [{ courtNumber: 1, team1: [m1, f1], team2: [m2, f2] }], sittingOut: [m3, f3] },
    ]);
    expect(swapRoundPlayers(data, 1, 'm1', 'm3')?.courts[0].team1.map(p => p.id)).toEqual(['m3', 'f1']);
    expect(swapRoundPlayers(data, 1, 'm1', 'f3')).toBeNull();
    expect(swapOptions(data, data.rounds[0])).toHaveLength(6);
  });

  it('moves fixed partners as a pair', () => {
    const [a, b, c, d, e, f] = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => player(id));
    const data = roster([a, b, c, d, e, f], 'fixed', [
      { roundNumber: 1, courts: [{ courtNumber: 1, team1: [a, b], team2: [c, d] }], sittingOut: [e, f] },
    ]);
    const swapped = swapRoundPlayers(data, 1, 'a', 'e');
    expect(swapped?.courts[0].team1.map(p => p.id)).toEqual(['e', 'f']);
    expect(swapped?.sittingOut.map(p => p.id)).toEqual(['a', 'b']);
    expect(swapOptions(data, data.rounds[0])).toHaveLength(3);
  });

  it('reshuffles only the requested and later rounds using the earlier rounds as history', () => {
    const [a, b, c, d, e] = ['a', 'b', 'c', 'd', 'e'].map(id => player(id));
    const data = roster([a, b, c, d, e], 'gender', [
      { roundNumber: 1, courts: [{ courtNumber: 1, team1: [a, b], team2: [c, d] }], sittingOut: [e] },
      { roundNumber: 2, courts: [{ courtNumber: 1, team1: [a, e], team2: [b, c] }], sittingOut: [d] },
    ]);
    const reshuffled = reshuffleRounds(data, 2);
    expect(reshuffled?.rounds[0]).toBe(data.rounds[0]);
    expect(reshuffled?.rounds.map(round => round.roundNumber)).toEqual([1, 2]);
    expect(new Set([
      ...reshuffled!.rounds[1].courts[0].team1,
      ...reshuffled!.rounds[1].courts[0].team2,
      ...reshuffled!.rounds[1].sittingOut,
    ].map(player => player.id)).size).toBe(5);
    expect(reshuffleRounds(data, 3)).toBeNull();
  });

  it('allows repeated swaps on a scored court while preserving scores by court', () => {
    const players = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map(id => player(id));
    const data = roster(players, 'gender', [{
      roundNumber: 1,
      courts: [
        { courtNumber: 1, team1: players.slice(0, 2), team2: players.slice(2, 4) },
        { courtNumber: 2, team1: players.slice(4, 6), team2: players.slice(6, 8) },
      ],
      sittingOut: [players[8]],
    }]);
    data.numCourts = 2;
    const swapped = swapRoundPlayers(data, 1, 'a', 'i');
    expect(swapped?.courts[0].team1[0].id).toBe('i');
    expect(swapped?.sittingOut[0].id).toBe('a');
    const twice = swapRoundPlayers({ ...data, rounds: [swapped!] }, 1, 'b', 'e');
    expect(twice?.courts[0].team1.map(player => player.id)).toEqual(['i', 'e']);
    expect(twice?.courts[1].team1[0].id).toBe('b');
  });
});
