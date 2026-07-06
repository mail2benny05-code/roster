import { useEffect, useState } from 'react';
import netlifyIdentity from 'netlify-identity-widget';
import type { Page, RosterData, SetupState } from './types';
import { generateRoster } from './utils/rosterGenerator';
import { saveToHistory } from './utils/historyDB';
import LoginPage from './components/LoginPage';
import SetupPage from './components/SetupPage';
import RosterPage from './components/RosterPage';
import HistoryPage from './components/HistoryPage';

const DEFAULT_SETUP: SetupState = {
  rosterType: 'gender',
  numCourts: 1,
  numRounds: 5,
  players: [],
  sessionName: '',
};

export default function App() {
  // Auth disabled: land directly on setup. Set AUTH_ENABLED to true to re-enable the login page.
  const AUTH_ENABLED = false;
  const [page, setPage] = useState<Page>(
    (!AUTH_ENABLED || import.meta.env.VITE_AUTH_PROVIDER === 'cloudflare') ? 'setup' : 'login',
  );
  const [setup, setSetup] = useState<SetupState>(DEFAULT_SETUP);
  const [rosterData, setRosterData] = useState<RosterData | null>(null);

  function handleLogin() {
    setPage('setup');
  }

  // Listen for Netlify Identity login events (e.g. magic-link return)
  useEffect(() => {
    if (!AUTH_ENABLED || import.meta.env.VITE_AUTH_PROVIDER === 'cloudflare') return;

    netlifyIdentity.on('login', () => {
      netlifyIdentity.close();
      setPage('setup');
    });

    return () => {
      netlifyIdentity.off('login');
    };
  }, []);

  function handleLogout() {
    if (import.meta.env.VITE_AUTH_PROVIDER === 'cloudflare') {
      window.location.href = '/cdn-cgi/access/logout';
    } else if (AUTH_ENABLED) {
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
    // Persist to history (fire-and-forget — don't block the UI)
    saveToHistory(state).catch(console.error);
  }

  function handleEditSetup() {
    setPage('setup');
  }

  function handleNewSchedule() {
    setSetup(DEFAULT_SETUP);
    setRosterData(null);
    setPage('setup');
  }

  function handleOpenHistory() {
    setPage('history');
  }

  function handleLoadFromHistory(state: SetupState) {
    setSetup(state);
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
        onHistory={handleOpenHistory}
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
        onHistory={handleOpenHistory}
      />
    );
  }

  if (page === 'history') {
    return (
      <HistoryPage
        onBack={() => setPage(rosterData ? 'roster' : 'setup')}
        onLoad={handleLoadFromHistory}
      />
    );
  }

  return null;
}
