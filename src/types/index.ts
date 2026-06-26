export type Gender = 'male' | 'female';
export type RosterType = 'gender' | 'mixed';
export type Page = 'login' | 'setup' | 'roster';

export interface Player {
  id: string;
  name: string;
  gender?: Gender;
}

export interface CourtGame {
  courtNumber: number;
  team1: Player[];
  team2: Player[];
}

export interface Round {
  roundNumber: number;
  courts: CourtGame[];
  sittingOut: Player[];
}

export interface RosterData {
  rounds: Round[];
  rosterType: RosterType;
  allPlayers: Player[];
  numCourts: number;
  sessionName: string;
  allowSameGender: boolean;
}

export interface SetupState {
  rosterType: RosterType;
  numCourts: number;
  numRounds: number;
  players: Player[];
  sessionName: string;
  allowSameGender?: boolean;
}

