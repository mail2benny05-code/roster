export type Gender = 'male' | 'female';
export type RosterType = 'gender' | 'mixed' | 'fixed';
export type PartnerMode = 'strict' | 'hybrid' | 'flexible';
export type Page = 'login' | 'setup' | 'roster' | 'game' | 'results' | 'history';

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

export interface GameScore {
  roundNumber: number;
  courtNumber: number;
  team1Score: number;
  team2Score: number;
  /** Per-game scores for best-of-three matches. When present, these determine
   * clean sweeps and comeback wins; the top-level scores remain match totals. */
  games?: Array<{ team1Score: number; team2Score: number }>;
  doNotPlay?: boolean;
}
