import { describe, expect, it } from 'vitest';
import type { RosterData } from '../types';
import { calculateResults } from './scoreResults';

const players = [
  { id: 'a', name: 'Alex' }, { id: 'b', name: 'Blair' },
  { id: 'c', name: 'Casey' }, { id: 'd', name: 'Drew' },
];

function roster(rosterType: RosterData['rosterType']): RosterData {
  return {
    rosterType,
    partnerMode: 'strict',
    allPlayers: players,
    numCourts: 1,
    sessionName: 'Test',
    allowSameGender: false,
    rounds: [{
      roundNumber: 1,
      sittingOut: [],
      courts: [{ courtNumber: 1, team1: [players[0], players[1]], team2: [players[2], players[3]] }],
    }],
  };
}

describe('calculateResults', () => {
  it('tracks non-fixed results for each player and skips do-not-play games', () => {
    const results = calculateResults(roster('gender'), [
      { roundNumber: 1, courtNumber: 1, team1Score: 11, team2Score: 7 },
      { roundNumber: 2, courtNumber: 1, team1Score: 0, team2Score: 0, doNotPlay: true },
    ]);
    expect(results.standings.find(row => row.id === 'a')).toMatchObject({ wins: 1, losses: 0, pointsFor: 11, pointsAgainst: 7, winPercentage: 100 });
    expect(results.standings.find(row => row.id === 'c')).toMatchObject({ wins: 0, losses: 1, pointsFor: 7, pointsAgainst: 11, winPercentage: 0 });
    expect(results.biggestWin).toMatchObject({ winner: 'Alex & Blair', margin: 4 });
  });

  it('aggregates fixed partner stats by team', () => {
    const results = calculateResults(roster('fixed'), [
      { roundNumber: 1, courtNumber: 1, team1Score: 11, team2Score: 7 },
    ]);
    expect(results.standings).toHaveLength(2);
    expect(results.standings[0]).toMatchObject({ name: 'Alex & Blair', wins: 1, pointsFor: 11, pointsAgainst: 7 });
    expect(results.standings[1]).toMatchObject({ name: 'Casey & Drew', losses: 1 });
  });

  it('calculates clean sweeps, comeback wins, and giant slayers from individual game scores', () => {
    const data = roster('fixed');
    data.rounds.push({
      roundNumber: 2,
      sittingOut: [],
      courts: [{ courtNumber: 1, team1: [players[0], players[1]], team2: [players[2], players[3]] }],
    });
    const results = calculateResults(data, [
      { roundNumber: 1, courtNumber: 1, team1Score: 21, team2Score: 16, games: [{ team1Score: 11, team2Score: 8 }, { team1Score: 10, team2Score: 8 }] },
      { roundNumber: 2, courtNumber: 1, team1Score: 18, team2Score: 21, games: [{ team1Score: 11, team2Score: 8 }, { team1Score: 7, team2Score: 10 }, { team1Score: 3, team2Score: 8 }] },
    ]);

    expect(results.cleanSweepLeader).toEqual({ name: 'Alex & Blair', percentage: 50, cleanSweeps: 1, matches: 2 });
    expect(results.comebackLeader).toEqual({ name: 'Casey & Drew', wins: 1 });
    expect(results.giantSlayer).toEqual({ name: 'Casey & Drew', wins: 1 });
  });

  it('does not count empty individual game rows as scored matches', () => {
    const results = calculateResults(roster('fixed'), [
      { roundNumber: 1, courtNumber: 1, team1Score: 11, team2Score: 7, games: [{ team1Score: 0, team2Score: 0 }, { team1Score: 0, team2Score: 0 }, { team1Score: 0, team2Score: 0 }] },
    ]);
    expect(results.cleanSweepLeader).toBeNull();
    expect(results.comebackLeader).toBeNull();
  });
});
