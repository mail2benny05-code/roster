import { describe, expect, it } from 'vitest';
import type { RosterData } from '../types';
import { calculateResults, getScore } from './scoreResults';

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
  it('builds player cards from scored matches and skips DNP matches', () => {
    const data = roster('gender');
    data.rounds = [
      data.rounds[0],
      { roundNumber: 2, sittingOut: [], courts: [{ courtNumber: 1, team1: [players[0], players[2]], team2: [players[1], players[3]] }] },
      { roundNumber: 3, sittingOut: [], courts: [{ courtNumber: 1, team1: [players[0], players[1]], team2: [players[2], players[3]] }] },
    ];
    const results = calculateResults(data, [
      { roundNumber: 1, courtNumber: 1, team1Score: 11, team2Score: 7 },
      { roundNumber: 2, courtNumber: 1, team1Score: 9, team2Score: 11 },
      { roundNumber: 3, courtNumber: 1, team1Score: 11, team2Score: 0, doNotPlay: true },
    ]);
    const alex = results.playerCards.find(card => card.id === 'a');
    expect(alex?.bestPartner).toEqual({ name: 'Blair', wins: 1 });
    expect(alex?.toughestOpponent).toEqual({ name: 'Blair', losses: 1 });
    expect(alex?.bestWin).toEqual({ opponent: 'Casey & Drew', score: '11–7', margin: 4 });
    expect(alex?.badges).toContain('Heartbreaker');
  });
  it('counts 1- and 2-point losses for Heartbreaker and ignores larger losses and DNP', () => {
    const data = roster('fixed');
    data.rounds = [1, 2, 3, 4].map(roundNumber => ({ ...data.rounds[0], roundNumber }));
    const results = calculateResults(data, [
      { roundNumber: 1, courtNumber: 1, team1Score: 10, team2Score: 11 },
      { roundNumber: 2, courtNumber: 1, team1Score: 9, team2Score: 11 },
      { roundNumber: 3, courtNumber: 1, team1Score: 5, team2Score: 11 },
      { roundNumber: 4, courtNumber: 1, team1Score: 10, team2Score: 11, doNotPlay: true },
    ]);
    expect(results.heartbreaker).toEqual({ name: 'Alex & Blair', count: 2 });
    expect(calculateResults(roster('fixed'), []).heartbreaker).toBeNull();
  });
  it('starts scores blank and counts an entered zero', () => {
    const data = roster('gender');
    expect(getScore([], 1, 1)).toMatchObject({ team1Score: null, team2Score: null });
    expect(calculateResults(data, [{ roundNumber: 1, courtNumber: 1, team1Score: 0, team2Score: null }]).standings.every(row => row.played === 0)).toBe(true);
    const results = calculateResults(data, [{ roundNumber: 1, courtNumber: 1, team1Score: 0, team2Score: 11 }]);
    expect(results.standings.find(row => row.id === 'a')).toMatchObject({ played: 1, losses: 1, pointsFor: 0 });
    const tied = calculateResults(data, [{ roundNumber: 1, courtNumber: 1, team1Score: 0, team2Score: 0 }]);
    expect(tied.standings.find(row => row.id === 'a')).toMatchObject({ played: 1, draws: 1 });
  });
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

  it('calculates match results without a separate giant-slayer metric', () => {
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

    expect(results.spoilers).toEqual([]);
    expect(results).not.toHaveProperty('giantSlayer');
  });
});
