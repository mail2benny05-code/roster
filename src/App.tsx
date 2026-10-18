import { useEffect, useState } from 'react';
import netlifyIdentity from 'netlify-identity-widget';
import type { GameScore, Page, RosterData, SetupState } from './types';
import { generateRoster } from './utils/rosterGenerator';
import { saveToHistory } from './utils/historyDB';
import type { SavedGameEvent, HistoryEntry } from './utils/historyDB';
import LoginPage from './components/LoginPage';
import SetupPage from './components/SetupPage';
import RosterPage from './components/RosterPage';
import HistoryPage from './components/HistoryPage';
import ScorekeeperPage from './components/ScorekeeperPage';
import ResultsPage from './components/ResultsPage';

const DEFAULT_SETUP: SetupState = {
  rosterType: 'gender',
  partnerMode: 'strict',
  numCourts: 1,
  numRounds: 5,
  players: [],
  sessionName: '',
  allowSameGender: false,
  trackGender: false,
};

const ACTIVE_EVENT_KEY = 'rallyq-active-event-v1';
interface SavedEvent {
  version: 1;
  page: 'setup' | 'roster' | 'game' | 'results';
  setup: SetupState;
  rosterData: RosterData;
  scores: GameScore[];
  currentRound: number;
  eventStatus: SavedGameEvent['status'];
}

function readSavedEvent(): SavedEvent | null {
  try {
    const stored = localStorage.getItem(ACTIVE_EVENT_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as Partial<SavedEvent>;
    if (
      parsed.version !== 1 ||
      !parsed.setup || !Array.isArray(parsed.setup.players) ||
      !parsed.rosterData || !Array.isArray(parsed.rosterData.rounds) ||
      !Array.isArray(parsed.scores) ||
      !Number.isInteger(parsed.currentRound) ||
      !['setup', 'roster', 'game', 'results'].includes(parsed.page ?? '')
    ) return null;
    const eventStatus = parsed.eventStatus ?? (parsed.page === 'results' ? 'finished' : parsed.page === 'game' ? 'in-progress' : 'scheduled');
    if (!['scheduled', 'in-progress', 'finished'].includes(eventStatus)) return null;
    return { ...parsed, eventStatus } as SavedEvent;
  } catch {
    return null;
  }
}

export default function App() {
  // Auth disabled: land directly on setup. Set AUTH_ENABLED to true to re-enable the login page.
  const AUTH_ENABLED = false;
  const [savedEvent] = useState(readSavedEvent);
  const [page, setPage] = useState<Page>(
    savedEvent?.page ?? ((!AUTH_ENABLED || import.meta.env.VITE_AUTH_PROVIDER === 'cloudflare') ? 'setup' : 'login'),
  );
  const [setup, setSetup] = useState<SetupState>(savedEvent?.setup ?? DEFAULT_SETUP);
  const [rosterData, setRosterData] = useState<RosterData | null>(savedEvent?.rosterData ?? null);
  const [scores, setScores] = useState<GameScore[]>(savedEvent?.scores ?? []);
  const [currentRound, setCurrentRound] = useState(savedEvent?.currentRound ?? 1);
  const [eventStatus, setEventStatus] = useState<SavedGameEvent['status']>(savedEvent?.eventStatus ?? 'scheduled');

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

  useEffect(() => {
    try {
      if (!rosterData) {
        localStorage.removeItem(ACTIVE_EVENT_KEY);
        return;
      }
      const savedPage = page === 'history' ? (rosterData ? 'roster' : 'setup') : page;
      if (!['setup', 'roster', 'game', 'results'].includes(savedPage)) return;
      const snapshot: SavedEvent = { version: 1, page: savedPage as SavedEvent['page'], setup, rosterData, scores, currentRound, eventStatus };
      localStorage.setItem(ACTIVE_EVENT_KEY, JSON.stringify(snapshot));
    } catch (error) {
      console.warn('Could not save the active event in this browser.', error);
    }
  }, [page, setup, rosterData, scores, currentRound, eventStatus]);

  useEffect(() => {
    if (!rosterData) return;
    const event: SavedGameEvent = { rosterData, scores, status: eventStatus, currentRound };
    const timer = window.setTimeout(() => {
      saveToHistory(setup, event).catch(error => console.warn('Could not update game history.', error));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [setup, rosterData, scores, eventStatus, currentRound]);

  function handleLogout() {
    if (import.meta.env.VITE_AUTH_PROVIDER === 'cloudflare') {
      window.location.href = '/cdn-cgi/access/logout';
    } else if (AUTH_ENABLED) {
      netlifyIdentity.logout();
      setPage('login');
      setSetup(DEFAULT_SETUP);
      setRosterData(null);
      setScores([]);
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
      state.partnerMode,
    );
    setRosterData(data);
    setScores([]);
    setCurrentRound(1);
    setEventStatus('scheduled');
    setPage('roster');
    saveToHistory(state, { rosterData: data, scores: [], status: 'scheduled', currentRound: 1 }).catch(console.error);
  }

  function handleShuffle() {
    const state = setup;
    const data = generateRoster(
      state.players,
      state.numCourts,
      state.numRounds,
      state.rosterType,
      state.sessionName,
      state.allowSameGender ?? false,
      state.partnerMode,
      rosterData ?? undefined,
    );
    setRosterData(data);
    setScores([]);
    setCurrentRound(1);
    setEventStatus('scheduled');
    saveToHistory(state, { rosterData: data, scores: [], status: 'scheduled', currentRound: 1 }).catch(console.error);
  }

  function handleAddRounds(count: number) {
    if (!rosterData) return;
    const extension = generateRoster(
      setup.players,
      rosterData.numCourts,
      count,
      rosterData.rosterType,
      rosterData.sessionName,
      rosterData.allowSameGender,
      rosterData.partnerMode,
      undefined,
      rosterData,
    );
    setCurrentRound(rosterData.rounds.length + 1);
    const extendedRoster = { ...rosterData, rounds: [...rosterData.rounds, ...extension.rounds] };
    const updatedSetup = { ...setup, numRounds: setup.numRounds + count };
    setRosterData(extendedRoster);
    setSetup(updatedSetup);
    setEventStatus('in-progress');
    setPage('game');
    saveToHistory(updatedSetup, { rosterData: extendedRoster, scores, status: 'in-progress', currentRound: rosterData.rounds.length + 1 }).catch(console.error);
  }

  function handleEditSetup() {
    setPage('setup');
  }

  function handleNewSchedule() {
    setSetup(DEFAULT_SETUP);
    setRosterData(null);
    setScores([]);
    setCurrentRound(1);
    setEventStatus('scheduled');
    setPage('setup');
  }

  function handleOpenHistory() {
    setPage('history');
  }

  function handleLoadFromHistory(entry: HistoryEntry) {
    setSetup(entry.setup);
    if (entry.event) {
      setRosterData(entry.event.rosterData);
      setScores(entry.event.scores);
      setCurrentRound(entry.event.currentRound);
      setEventStatus(entry.event.status);
      setPage(entry.event.status === 'finished' ? 'results' : entry.event.status === 'in-progress' ? 'game' : 'roster');
      return;
    }
    setRosterData(null);
    setScores([]);
    setCurrentRound(1);
    setEventStatus('scheduled');
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

  if ((page === 'game' || page === 'results') && rosterData) {
    if (page === 'game') {
      return (
        <ScorekeeperPage
          data={rosterData}
          scores={scores}
          onScoreChange={setScores}
          onBack={() => setPage('roster')}
          onFinish={(finalScores) => { setScores(finalScores); setEventStatus('finished'); setPage('results'); }}
          onAddRounds={handleAddRounds}
          initialRoundNumber={currentRound}
          onRoundChange={setCurrentRound}
        />
      );
    }
    return <ResultsPage data={rosterData} scores={scores} onBack={() => setPage('game')} onSchedule={() => setPage('roster')} onAddRounds={handleAddRounds} />;
  }

  if (page === 'roster' && rosterData) {
    return (
      <RosterPage
        data={rosterData}
        onEditSetup={handleEditSetup}
        onShuffle={handleShuffle}
        onNewSchedule={handleNewSchedule}
        onLogout={handleLogout}
        onHistory={handleOpenHistory}
        onStartGame={() => { setCurrentRound(1); setEventStatus('in-progress'); setPage('game'); }}
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
