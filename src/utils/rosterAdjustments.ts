import type { GameScore, Player, RosterData, Round } from '../types';
import { generateRoster } from './rosterGenerator';

export function reshuffleRounds(data: RosterData, fromRound: number): RosterData | null {
  if (!Number.isInteger(fromRound) || fromRound < 1 || fromRound > data.rounds.length) return null;
  const previousRounds = data.rounds.slice(0, fromRound - 1);
  const extension = generateRoster(
    data.allPlayers,
    data.numCourts,
    data.rounds.length - previousRounds.length,
    data.rosterType,
    data.sessionName,
    data.allowSameGender,
    data.partnerMode,
    previousRounds.length ? undefined : data,
    previousRounds.length ? { ...data, rounds: previousRounds } : undefined,
  );
  return { ...data, rounds: [...previousRounds, ...extension.rounds] };
}

export function scoredCourtPlayerIds(round: Round, scores: GameScore[]): Set<string> {
  const scoredCourts = new Set(scores.filter(score => score.roundNumber === round.roundNumber).map(score => score.courtNumber));
  return new Set(round.courts
    .filter(court => scoredCourts.has(court.courtNumber))
    .flatMap(court => [...court.team1, ...court.team2].map(player => player.id)));
}

export function swapUnscoredRoundPlayers(data: RosterData, scores: GameScore[], roundNumber: number, firstId: string, secondId: string): Round | null {
  const round = data.rounds.find(item => item.roundNumber === roundNumber);
  if (!round) return null;
  const locked = scoredCourtPlayerIds(round, scores);
  if (locked.has(firstId) || locked.has(secondId)) return null;
  return swapRoundPlayers(data, roundNumber, firstId, secondId);
}

export function swapOptions(data: RosterData, round: Round): Array<{ id: string; label: string }> {
  const options: Array<{ id: string; label: string }> = [];
  for (const court of round.courts) {
    for (const [index, team] of [court.team1, court.team2].entries()) {
      const label = `Court ${court.courtNumber}, Team ${index + 1}`;
      if (data.rosterType === 'fixed') options.push({ id: team[0].id, label: `${team.map(player => player.name).join(' & ')} — ${label}` });
      else for (const player of team) options.push({ id: player.id, label: `${player.name} — ${label}` });
    }
  }
  if (data.rosterType === 'fixed') {
    const sitting = new Set(round.sittingOut.map(player => player.id));
    for (let index = 0; index < data.allPlayers.length; index += 2) {
      const pair = data.allPlayers.slice(index, index + 2);
      if (pair.length === 2 && pair.every(player => sitting.has(player.id))) {
        options.push({ id: pair[0].id, label: `${pair.map(player => player.name).join(' & ')} — Sitting out` });
      }
    }
  } else {
    for (const player of round.sittingOut) options.push({ id: player.id, label: `${player.name} — Sitting out` });
  }
  return options;
}

function unit(data: RosterData, id: string): Player[] {
  const index = data.allPlayers.findIndex(player => player.id === id);
  if (index < 0) return [];
  return data.rosterType === 'fixed'
    ? data.allPlayers.slice(Math.floor(index / 2) * 2, Math.floor(index / 2) * 2 + 2)
    : [data.allPlayers[index]];
}

function validSwap(data: RosterData, before: Round, after: Round): boolean {
  if (after.courts.length !== data.numCourts) return false;
  const assigned = [...after.courts.flatMap(court => [...court.team1, ...court.team2]), ...after.sittingOut];
  const ids = assigned.map(player => player.id);
  if (ids.length !== data.allPlayers.length || new Set(ids).size !== ids.length ||
      data.allPlayers.some(player => !ids.includes(player.id))) return false;

  const adjacent = data.rounds.filter(round => Math.abs(round.roundNumber - before.roundNumber) === 1);
  const sitOutOverlap = (first: Round, second: Round) => {
    const firstIds = new Set(first.sittingOut.map(player => player.id));
    return second.sittingOut.filter(player => firstIds.has(player.id)).length;
  };
  if (adjacent.some(round => sitOutOverlap(after, round) > sitOutOverlap(before, round))) return false;

  const fixedTeam = new Map(data.allPlayers.map((player, index) => [player.id, Math.floor(index / 2)]));
  const sitting = new Set(after.sittingOut.map(player => player.id));
  if (data.rosterType === 'fixed') {
    for (let index = 0; index < data.allPlayers.length; index += 2) {
      if (sitting.has(data.allPlayers[index].id) !== sitting.has(data.allPlayers[index + 1].id)) return false;
    }
  }
  for (const [courtIndex, court] of after.courts.entries()) {
    if (court.team1.length !== 2 || court.team2.length !== 2) return false;
    for (const [teamIndex, team] of [court.team1, court.team2].entries()) {
      if (data.rosterType === 'fixed' && fixedTeam.get(team[0].id) !== fixedTeam.get(team[1].id)) return false;
      if (data.rosterType === 'mixed' && !data.allowSameGender && team[0].gender === team[1].gender) return false;
      if (data.rosterType === 'gender' && data.partnerMode === 'hybrid') {
        const oldCourt = before.courts[courtIndex];
        const oldTeam = teamIndex === 0 ? oldCourt.team1 : oldCourt.team2;
        const pattern = (players: Player[]) => players.map(player => player.gender).sort().join('|');
        if (pattern(team) !== pattern(oldTeam)) return false;
      }
    }
  }
  return true;
}

export function swapRoundPlayers(data: RosterData, roundNumber: number, firstId: string, secondId: string): Round | null {
  const round = data.rounds.find(item => item.roundNumber === roundNumber);
  if (!round) return null;
  const first = unit(data, firstId);
  const second = unit(data, secondId);
  if (!first.length || first.length !== second.length || first[0].id === second[0].id) return null;
  const replacements = new Map<string, Player>();
  first.forEach((player, index) => {
    replacements.set(player.id, second[index]);
    replacements.set(second[index].id, player);
  });
  const replace = (player: Player) => replacements.get(player.id) ?? player;
  const swapped: Round = {
    ...round,
    courts: round.courts.map(court => ({ ...court, team1: court.team1.map(replace), team2: court.team2.map(replace) })),
    sittingOut: round.sittingOut.map(replace),
  };
  return validSwap(data, round, swapped) ? swapped : null;
}
