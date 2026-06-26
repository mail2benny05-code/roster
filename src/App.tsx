import { useState } from 'react';
import netlifyIdentity from 'netlify-identity-widget';
import type { Page, RosterData, SetupState } from './types';
import { generateRoster } from './utils/rosterGenerator';
import LoginPage from './components/LoginPage';
import SetupPage from './components/SetupPage';
import RosterPage from './components/RosterPage';

const DEFAULT_SETUP: SetupState = {
  rosterType: 'gender',
  numCourts: 1,
  numRounds: 5,
  players: [],
  sessionName: '',
};

export default function App() {
  const [page, setPage] = useState<Page>(
    import.meta.env.VITE_AUTH_PROVIDER === 'cloudflare' ? 'setup' : 'login',
  );
  const [setup, setSetup] = useState<SetupState>(DEFAULT_SETUP);
  const [rosterData, setRosterData] = useState<RosterData | null>(null);

  function handleLogin() {
    setPage('setup');
  }

  function handleLogout() {
    if (import.meta.env.VITE_AUTH_PROVIDER === 'cloudflare') {
      window.location.href = '/cdn-cgi/access/logout';
    } else {
      netlifyIdentity.logout();
      setPage('login');
      setSetup(DEFAULT_SETUP);
      setRosterData(null);
    }
  }

  function handleGenerate(state: SetupState) {
    setSetup(state);
    const data = generateRoster(
      state.players,
      state.numCourts,
      state.numRounds,
      state.rosterType,
      state.sessionName,
      state.allowSameGender ?? false,
    );
    setRosterData(data);
    setPage('roster');
  }

  function handleEditSetup() {
    setPage('setup');
  }

  function handleNewSchedule() {
    setSetup(DEFAULT_SETUP);
    setRosterData(null);
    setPage('setup');
  }

  if (page === 'login') {
    return <LoginPage onLogin={handleLogin} />;
  }

  if (page === 'setup') {
    return (
      <SetupPage
        initialState={setup}
        onGenerate={handleGenerate}
        onLogout={handleLogout}
        onReset={handleNewSchedule}
      />
    );
  }

  if (page === 'roster' && rosterData) {
    return (
      <RosterPage
        data={rosterData}
        onEditSetup={handleEditSetup}
        onNewSchedule={handleNewSchedule}
        onLogout={handleLogout}
      />
    );
  }

  return null;
}
