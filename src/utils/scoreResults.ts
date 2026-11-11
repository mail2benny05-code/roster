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

export interface PlayerCard {
  id: string;
  bestPartner: { name: string; wins: number } | null;
  toughestOpponent: { name: string; losses: number } | null;
  bestWin: { opponent: string; score: string; margin: number } | null;
  badges: string[];
}

export interface ScoreResults {
  standings: Standing[];
  biggestWin: GameHighlight | null;
  toughestLoss: { name: string; averageMargin: number; losses: number } | null;
  heartbreaker: { name: string; count: number } | null;
  spoilers: Array<{ name: string; count: number }>;
  playerCards: PlayerCard[];
}

export function scoreKey(roundNumber: number, courtNumber: number): string {
  return `${roundNumber}:${courtNumber}`;
}

export function getScore(scores: GameScore[], roundNumber: number, courtNumber: number): GameScore {
  return scores.find(score => score.roundNumber === roundNumber && score.courtNumber === courtNumber) ?? {
    roundNumber,
    courtNumber,
    team1Score: null,
    team2Score: null,
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
  const closeLosses = new Map<string, number>();
  const partnerWins = new Map<string, Map<string, number>>();
  const opponentLosses = new Map<string, Map<string, number>>();
  const bestWins = new Map<string, PlayerCard['bestWin']>();
  const increment = (counts: Map<string, Map<string, number>>, id: string, otherId: string) => {
    const byOther = counts.get(id) ?? new Map<string, number>();
    byOther.set(otherId, (byOther.get(otherId) ?? 0) + 1);
    counts.set(id, byOther);
  };
  const matchRecords: Array<{ first: Standing[]; second: Standing[]; winner: 1 | 2; firstName: string; secondName: string }> = [];
  for (const round of data.rounds) {
    for (const court of round.courts) {
      const score = getScore(scores, round.roundNumber, court.courtNumber);
      if (score.doNotPlay || score.team1Score === null || score.team2Score === null) continue;
      const first = entitiesForSide(court.team1, fixed, byMembers);
      const second = entitiesForSide(court.team2, fixed, byMembers);
      const side1Name = court.team1.map(player => player.name).join(' & ');
      const side2Name = court.team2.map(player => player.name).join(' & ');
      for (const entity of first) applyScore(entity, score.team1Score, score.team2Score);
      for (const entity of second) applyScore(entity, score.team2Score, score.team1Score);

      if (score.team1Score !== score.team2Score) {
        const firstWon = score.team1Score > score.team2Score;
        const winners = firstWon ? first : second;
        const losers = firstWon ? second : first;
        const margin = Math.abs(score.team1Score - score.team2Score);
        const winningScore = Math.max(score.team1Score, score.team2Score);
        const losingScore = Math.min(score.team1Score, score.team2Score);
        for (const winner of winners) {
          for (const partner of winners) if (partner.id !== winner.id) increment(partnerWins, winner.id, partner.id);
          if (fixed) increment(partnerWins, winner.id, winner.id);
          const previous = bestWins.get(winner.id);
          if (!previous || margin > previous.margin) {
            bestWins.set(winner.id, { opponent: firstWon ? side2Name : side1Name, score: `${winningScore}–${losingScore}`, margin });
          }
        }
        for (const loser of losers) for (const opponent of winners) increment(opponentLosses, loser.id, opponent.id);
        if (Math.abs(score.team1Score - score.team2Score) <= 2) {
          for (const entity of firstWon ? second : first) {
            closeLosses.set(entity.id, (closeLosses.get(entity.id) ?? 0) + 1);
          }
        }
        matchRecords.push({ first, second, winner: firstWon ? 1 : 2, firstName: side1Name, secondName: side2Name });
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
  for (const match of matchRecords) {
    const winners = match.winner === 1 ? match.first : match.second;
    const losers = match.winner === 1 ? match.second : match.first;
      const winnerIds = winners.map(entity => entity.id);
      const winnerRank = winnerIds.reduce((sum, id) => sum + (rankById.get(id) ?? Infinity), 0) / winnerIds.length;
    const loserRank = losers.reduce((sum, entity) => sum + (rankById.get(entity.id) ?? Infinity), 0) / losers.length;
    if (loserRank <= 3 && winnerRank > 3) {
      for (const winner of winners) spoilerCounts.set(winner.id, (spoilerCounts.get(winner.id) ?? 0) + 1);
    }
  }

  const metricLeaders = (counts: Map<string, number>, requirePositive = true) => {
    const entries = [...counts].filter(([, count]) => !requirePositive || count > 0);
    const nameForId = new Map(entities.map(entity => [entity.id, entity.name]));
    return entries.map(([id, count]) => ({ id, name: nameForId.get(id) ?? id, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  };
  const spoilerLeaders = metricLeaders(spoilerCounts);
  const heartbreaker = metricLeaders(closeLosses)[0] ?? null;
  const nameById = new Map(entities.map(entity => [entity.id, entity.name]));
  const leading = (counts: Map<string, Map<string, number>>, id: string) =>
    [...(counts.get(id) ?? [])].map(([otherId, count]) => ({ name: fixed && otherId === id
      ? entities.find(entity => entity.id === id)?.members.map(member => member.name).join(' & ') ?? ''
      : nameById.get(otherId) ?? otherId, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))[0] ?? null;

  const lossLeaders = entities.filter(entity => entity.losses > 0)
    .map(entity => ({ name: entity.name, averageMargin: entity.lossMarginTotal / entity.losses, losses: entity.losses }))
    .sort((a, b) => a.averageMargin - b.averageMargin || b.losses - a.losses || a.name.localeCompare(b.name));

  const biggestWin = highlights.sort((a, b) => b.margin - a.margin)[0] ?? null;
  const mostWins = [...entities].filter(entity => entity.played > 0).sort((a, b) => b.wins - a.wins || b.winPercentage - a.winPercentage || b.pointDifference - a.pointDifference)[0];
  const dominant = [...entities].filter(entity => entity.played > 0).sort((a, b) => b.pointDifference - a.pointDifference || b.winPercentage - a.winPercentage || b.wins - a.wins)[0];
  const playerCards: PlayerCard[] = entities.map(entity => {
    const partner = leading(partnerWins, entity.id);
    const opponent = leading(opponentLosses, entity.id);
    const badges: string[] = [];
    if (dominant?.id === entity.id) badges.push('Dominant performance');
    if (mostWins?.id === entity.id) badges.push('Most wins');
    if (lossLeaders[0]?.name === entity.name) badges.push('Toughest fight');
    if (heartbreaker?.id === entity.id) badges.push('Heartbreaker');
    if (spoilerLeaders[0]?.id === entity.id) badges.push('Spoiler Index');
    if (biggestWin && bestWins.get(entity.id)?.margin === biggestWin.margin) badges.push('Biggest win');
    return { id: entity.id, bestPartner: partner ? { name: partner.name, wins: partner.count } : null,
      toughestOpponent: opponent ? { name: opponent.name, losses: opponent.count } : null,
      bestWin: bestWins.get(entity.id) ?? null, badges };
  });

  return {
    standings: entities,
    biggestWin,
    toughestLoss: lossLeaders[0] ?? null,
    heartbreaker: heartbreaker ? { name: heartbreaker.name, count: heartbreaker.count } : null,
    spoilers: spoilerLeaders.map(({ name, count }) => ({ name, count })),
    playerCards,
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
