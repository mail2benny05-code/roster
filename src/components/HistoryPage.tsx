import { useEffect, useState } from 'react';
import type { SetupState } from '../types';
import { getHistory, deleteFromHistory } from '../utils/historyDB';
import type { HistoryEntry } from '../utils/historyDB';

interface HistoryPageProps {
  onBack: () => void;
  onLoad: (setup: SetupState) => void;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function rosterTypeLabel(entry: HistoryEntry): string {
  if (entry.setup.rosterType === 'mixed') {
    return entry.setup.allowSameGender ? 'Mixed (flexible)' : 'Mixed';
  }
  return 'Gender-based';
}

function playerSummary(entry: HistoryEntry): string {
  const { players, rosterType } = entry.setup;
  if (rosterType === 'mixed') {
    const m = players.filter(p => p.gender === 'male').length;
    const f = players.filter(p => p.gender === 'female').length;
    return `♂ ${m}  ♀ ${f}`;
  }
  return `${players.length} player${players.length !== 1 ? 's' : ''}`;
}

export default function HistoryPage({ onBack, onLoad }: HistoryPageProps) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    getHistory()
      .then(setEntries)
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete(id: string) {
    setDeletingId(id);
    await deleteFromHistory(id);
    setEntries(prev => prev.filter(e => e.id !== id));
    setDeletingId(null);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-950 via-slate-900 to-slate-950 p-4">

      {/* Header */}
      <div className="max-w-2xl mx-auto mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="text-slate-400 hover:text-white flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg hover:bg-slate-700/50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-violet-600/30 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <span className="text-white font-bold text-lg">RallyQ</span>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-1">Roster History</h1>
        <p className="text-slate-400 text-sm mb-6">
          Last {entries.length === 0 && !loading ? '0' : '10'} rosters — click any entry to re-load it into the editor.
        </p>

        {loading && (
          <div className="flex items-center justify-center py-16">
            <svg className="w-6 h-6 text-violet-400 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        )}

        {!loading && entries.length === 0 && (
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-10 text-center">
            <div className="w-14 h-14 bg-slate-700/60 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-slate-400 text-sm">No rosters saved yet.</p>
            <p className="text-slate-500 text-xs mt-1">Generated rosters will appear here automatically.</p>
          </div>
        )}

        {!loading && entries.length > 0 && (
          <div className="space-y-3">
            {entries.map((entry, idx) => (
              <div
                key={entry.id}
                className="bg-slate-800/60 backdrop-blur border border-slate-700/50 rounded-2xl p-4 flex items-center gap-4 hover:border-violet-500/50 hover:bg-slate-800/80 transition-all group"
              >
                {/* Index badge */}
                <div className="w-8 h-8 rounded-lg bg-violet-600/20 border border-violet-500/20 flex items-center justify-center shrink-0">
                  <span className="text-violet-400 font-bold text-xs">{idx + 1}</span>
                </div>

                {/* Main info — clickable */}
                <button
                  className="flex-1 text-left min-w-0"
                  onClick={() => onLoad(entry.setup)}
                >
                  <div className="text-white font-semibold text-sm truncate">
                    {entry.setup.sessionName || <span className="text-slate-500 italic">Unnamed session</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                    {/* Date */}
                    <span className="text-slate-400 text-xs">{formatDate(entry.createdAt)}</span>

                    {/* Divider */}
                    <span className="text-slate-600 text-xs hidden sm:inline">·</span>

                    {/* Players */}
                    <span className="text-slate-400 text-xs">{playerSummary(entry)}</span>

                    {/* Divider */}
                    <span className="text-slate-600 text-xs hidden sm:inline">·</span>

                    {/* Courts & Rounds */}
                    <span className="text-slate-400 text-xs">
                      {entry.setup.numCourts} court{entry.setup.numCourts !== 1 ? 's' : ''}
                      {' · '}
                      {entry.setup.numRounds} round{entry.setup.numRounds !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="mt-1.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${
                      entry.setup.rosterType === 'mixed'
                        ? 'bg-violet-900/40 text-violet-300 border-violet-700/50'
                        : 'bg-slate-700/50 text-slate-300 border-slate-600/50'
                    }`}>
                      {rosterTypeLabel(entry)}
                    </span>
                  </div>
                </button>

                {/* Load arrow (visible on hover) */}
                <button
                  onClick={() => onLoad(entry.setup)}
                  title="Load this roster"
                  className="shrink-0 text-slate-600 group-hover:text-violet-400 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>

                {/* Delete button */}
                <button
                  onClick={() => handleDelete(entry.id)}
                  disabled={deletingId === entry.id}
                  title="Delete this entry"
                  className="shrink-0 text-slate-600 hover:text-red-400 transition-colors disabled:opacity-40"
                >
                  {deletingId === entry.id ? (
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m2 0a1 1 0 00-1-1h-4a1 1 0 00-1 1H5" />
                    </svg>
                  )}
                </button>
              </div>
            ))}
          </div>
        )}

        {!loading && entries.length > 0 && (
          <p className="text-slate-600 text-xs text-center mt-6">
            Up to 10 rosters are saved. Older ones are removed automatically.
          </p>
        )}
      </div>
    </div>
  );
}

