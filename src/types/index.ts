export type Gender = 'male' | 'female';
export type RosterType = 'gender' | 'mixed';
export type PartnerMode = 'strict' | 'hybrid' | 'flexible';
export type Page = 'login' | 'setup' | 'roster' | 'history';

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
  partnerMode: PartnerMode;
  allPlayers: Player[];
  numCourts: number;
  sessionName: string;
  allowSameGender: boolean;
}

export interface SetupState {
  rosterType: RosterType;
  partnerMode: PartnerMode;
  numCourts: number;
  numRounds: number;
  players: Player[];
  sessionName: string;
  allowSameGender?: boolean;
  trackGender?: boolean;
}
