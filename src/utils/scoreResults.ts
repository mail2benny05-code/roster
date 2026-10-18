import type { GameScore, Player, RosterData } from '../types';

export interface Standing {
  id: string;
  name: string;
  members: Player[];
  wins: number;
  losses: number;
  draws: number;
  played: number;
  pointsFor: number;
  pointsAgainst: number;
  winPercentage: number;
  pointDifference: number;
  lossMarginTotal: number;
}

export interface GameHighlight {
  winner: string;
  loser: string;
  winnerScore: number;
  loserScore: number;
  margin: number;
}

export interface ScoreResults {
  standings: Standing[];
  biggestWin: GameHighlight | null;
  toughestLoss: { name: string; averageMargin: number; losses: number } | null;
  spoilers: Array<{ name: string; count: number }>;
  cleanSweepLeader: { name: string; percentage: number; cleanSweeps: number; matches: number } | null;
  comebackLeader: { name: string; wins: number } | null;
  giantSlayer: { name: string; wins: number } | null;
}

export function scoreKey(roundNumber: number, courtNumber: number): string {
  return `${roundNumber}:${courtNumber}`;
}

export function getScore(scores: GameScore[], roundNumber: number, courtNumber: number): GameScore {
  return scores.find(score => score.roundNumber === roundNumber && score.courtNumber === courtNumber) ?? {
    roundNumber,
    courtNumber,
    team1Score: 0,
    team2Score: 0,
  };
}

export function calculateResults(data: RosterData, scores: GameScore[]): ScoreResults {
  const fixed = data.rosterType === 'fixed';
  const entities: Standing[] = fixed
    ? Array.from({ length: Math.floor(data.allPlayers.length / 2) }, (_, index) => {
        const members = data.allPlayers.slice(index * 2, index * 2 + 2);
        return createStanding(members.map(player => player.id).sort().join('|'), members.map(player => player.name).join(' & '), members);
      })
    : data.allPlayers.map(player => createStanding(player.id, player.name, [player]));
  const byMembers = new Map<string, Standing>();
  for (const entity of entities) byMembers.set(entity.members.map(player => player.id).sort().join('|'), entity);

  const highlights: GameHighlight[] = [];
  const matchRecords: Array<{ first: Standing[]; second: Standing[]; winner: 1 | 2; firstName: string; secondName: string; games: NonNullable<GameScore['games']> }> = [];
  for (const round of data.rounds) {
    for (const court of round.courts) {
      const score = getScore(scores, round.roundNumber, court.courtNumber);
      if (score.doNotPlay || (score.team1Score === 0 && score.team2Score === 0)) continue;
      const first = entitiesForSide(court.team1, fixed, byMembers);
      const second = entitiesForSide(court.team2, fixed, byMembers);
      const side1Name = court.team1.map(player => player.name).join(' & ');
      const side2Name = court.team2.map(player => player.name).join(' & ');
      for (const entity of first) applyScore(entity, score.team1Score, score.team2Score);
      for (const entity of second) applyScore(entity, score.team2Score, score.team1Score);

      if (score.team1Score !== score.team2Score) {
        const firstWon = score.team1Score > score.team2Score;
        matchRecords.push({ first, second, winner: firstWon ? 1 : 2, firstName: side1Name, secondName: side2Name, games: score.games ?? [] });
        highlights.push({
          winner: firstWon ? side1Name : side2Name,
          loser: firstWon ? side2Name : side1Name,
          winnerScore: Math.max(score.team1Score, score.team2Score),
          loserScore: Math.min(score.team1Score, score.team2Score),
          margin: Math.abs(score.team1Score - score.team2Score),
        });
      }
    }
  }

  for (const standing of entities) {
    standing.winPercentage = standing.played ? standing.wins / standing.played * 100 : 0;
    standing.pointDifference = standing.pointsFor - standing.pointsAgainst;
  }
  entities.sort((a, b) => b.winPercentage - a.winPercentage || b.wins - a.wins || b.pointDifference - a.pointDifference || b.pointsFor - a.pointsFor || a.name.localeCompare(b.name));

  const rankById = new Map(entities.map((entity, index) => [entity.id, index + 1]));
  const spoilerCounts = new Map<string, number>();
  const cleanSweeps = new Map<string, number>();
  const recordedMatches = new Map<string, number>();
  const comebacks = new Map<string, number>();
  const giantSlayerLosses = new Map<string, number>();
  const topRanked = entities[0];
  for (const match of matchRecords) {
    const winners = match.winner === 1 ? match.first : match.second;
    const losers = match.winner === 1 ? match.second : match.first;
      const winnerIds = winners.map(entity => entity.id);
      const winnerRank = winnerIds.reduce((sum, id) => sum + (rankById.get(id) ?? Infinity), 0) / winnerIds.length;
    const loserRank = losers.reduce((sum, entity) => sum + (rankById.get(entity.id) ?? Infinity), 0) / losers.length;
    if (loserRank <= 3 && winnerRank > 3) {
      for (const winner of winners) spoilerCounts.set(winner.id, (spoilerCounts.get(winner.id) ?? 0) + 1);
    }
    const recordedGames = match.games.filter(game => game.team1Score !== 0 || game.team2Score !== 0);
    if (recordedGames.length) {
      for (const entity of [...match.first, ...match.second]) recordedMatches.set(entity.id, (recordedMatches.get(entity.id) ?? 0) + 1);
      const firstGame = recordedGames[0];
      const firstWins = recordedGames.filter(game => game.team1Score > game.team2Score).length;
      const secondWins = recordedGames.filter(game => game.team2Score > game.team1Score).length;
      const winnerGameCount = match.winner === 1 ? firstWins : secondWins;
      const loserGameCount = match.winner === 1 ? secondWins : firstWins;
      if (recordedGames.length === 2 && winnerGameCount === 2 && loserGameCount === 0) {
        for (const entity of winners) cleanSweeps.set(entity.id, (cleanSweeps.get(entity.id) ?? 0) + 1);
      }
      const lostFirst = firstGame && (match.winner === 1 ? firstGame.team1Score < firstGame.team2Score : firstGame.team2Score < firstGame.team1Score);
      if (recordedGames.length >= 3 && lostFirst && winnerGameCount > loserGameCount) {
        for (const entity of winners) comebacks.set(entity.id, (comebacks.get(entity.id) ?? 0) + 1);
      }
    }
    if (topRanked && losers.some(entity => entity.id === topRanked.id)) {
      // In rotating formats the pair is the unit credited with the upset; in
      // fixed format this resolves to the opponent's stable team identity.
      const slayer = winners.map(entity => entity.name).join(' & ');
      giantSlayerLosses.set(slayer, (giantSlayerLosses.get(slayer) ?? 0) + 1);
    }
  }

  const metricLeaders = (counts: Map<string, number>, requirePositive = true) => {
    const entries = [...counts].filter(([, count]) => !requirePositive || count > 0);
    const nameForId = new Map(entities.map(entity => [entity.id, entity.name]));
    return entries.map(([id, count]) => ({ id, name: nameForId.get(id) ?? id, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  };
  const spoilerLeaders = metricLeaders(spoilerCounts);
  const cleanSweepEntries = [...cleanSweeps].map(([id, clean]) => ({
    id,
    name: entities.find(entity => entity.id === id)?.name ?? id,
    clean,
    matches: recordedMatches.get(id) ?? 0,
    percentage: (clean / (recordedMatches.get(id) ?? 0)) * 100,
  })).filter(entry => entry.matches > 0).sort((a, b) => b.percentage - a.percentage || b.clean - a.clean || a.name.localeCompare(b.name));
  const comebackLeaders = metricLeaders(comebacks);
  const giantSlayers = [...giantSlayerLosses].map(([name, wins]) => ({ name, wins }))
    .sort((a, b) => b.wins - a.wins || a.name.localeCompare(b.name));

  const lossLeaders = entities.filter(entity => entity.losses > 0)
    .map(entity => ({ name: entity.name, averageMargin: entity.lossMarginTotal / entity.losses, losses: entity.losses }))
    .sort((a, b) => a.averageMargin - b.averageMargin || b.losses - a.losses || a.name.localeCompare(b.name));

  return {
    standings: entities,
    biggestWin: highlights.sort((a, b) => b.margin - a.margin)[0] ?? null,
    toughestLoss: lossLeaders[0] ?? null,
    spoilers: spoilerLeaders.map(({ name, count }) => ({ name, count })),
    cleanSweepLeader: cleanSweepEntries[0] ? { name: cleanSweepEntries[0].name, percentage: cleanSweepEntries[0].percentage, cleanSweeps: cleanSweepEntries[0].clean, matches: cleanSweepEntries[0].matches } : null,
    comebackLeader: comebackLeaders[0] ? { name: comebackLeaders[0].name, wins: comebackLeaders[0].count } : null,
    giantSlayer: giantSlayers[0] ?? null,
  };
}

function createStanding(id: string, name: string, members: Player[]): Standing {
  return { id, name, members, wins: 0, losses: 0, draws: 0, played: 0, pointsFor: 0, pointsAgainst: 0, winPercentage: 0, pointDifference: 0, lossMarginTotal: 0 };
}

function entitiesForSide(players: Player[], fixed: boolean, byMembers: Map<string, Standing>): Standing[] {
  if (fixed) {
    const entity = byMembers.get(players.map(player => player.id).sort().join('|'));
    return entity ? [entity] : [];
  }
  return players.map(player => byMembers.get(player.id)).filter((entity): entity is Standing => Boolean(entity));
}

function applyScore(standing: Standing, scored: number, conceded: number): void {
  standing.played++;
  standing.pointsFor += scored;
  standing.pointsAgainst += conceded;
  if (scored > conceded) standing.wins++;
  else if (scored < conceded) {
    standing.losses++;
    standing.lossMarginTotal += conceded - scored;
  } else standing.draws++;
}
