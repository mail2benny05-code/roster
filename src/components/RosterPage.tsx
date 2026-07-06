import { useRef } from 'react';
import { toPng } from 'html-to-image';
import type { RosterData } from '../types';
import RosterTable from './RosterTable';

interface RosterPageProps {
  data: RosterData;
  onEditSetup: () => void;
  onNewSchedule: () => void;
  onLogout: () => void;
  onHistory: () => void;
}

export default function RosterPage({
  data,
  onEditSetup,
  onNewSchedule,
  onLogout,
  onHistory,
}: RosterPageProps) {
  const tableRef = useRef<HTMLDivElement>(null);

  async function handleExport() {
    if (!tableRef.current) return;
    const el = tableRef.current;

    // Capture the full element, not just the visible/clipped portion
    const dataUrl = await toPng(el, {
      pixelRatio: 2,
      backgroundColor: '#ffffff',
      width: el.scrollWidth,
      height: el.scrollHeight,
    });

    const filename = `${data.sessionName || 'roster'}.png`;

    // On mobile, use the Web Share API so the user can "Save to Photos"
    if (typeof navigator.share === 'function') {
      try {
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        const file = new File([blob], filename, { type: 'image/png' });
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: data.sessionName || 'Roster' });
          return;
        }
      } catch {
        // User cancelled or share not supported — fall through to download
      }
    }

    // Desktop fallback: trigger a file download
    const link = document.createElement('a');
    link.download = filename;
    link.href = dataUrl;
    link.click();
  }

  const formatLabel = data.rosterType === 'mixed'
    ? data.allowSameGender ? 'Mixed (flexible)' : 'Mixed'
    : 'Gender-based';
  const hasSitOuts = data.rounds.some(r => r.sittingOut.length > 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-950 via-slate-900 to-slate-950 p-4">
      {/* Header */}
      <div className="max-w-5xl mx-auto mb-6 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-violet-600/30 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <span className="text-white font-bold text-lg">RallyQ</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={onHistory}
            title="View roster history"
            className="text-slate-400 hover:text-violet-400 text-sm px-3 py-1.5 rounded-lg hover:bg-slate-700/50 transition-colors flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            History
          </button>
          <button
            onClick={onLogout}
            className="text-slate-400 hover:text-white text-sm px-3 py-1.5 rounded-lg hover:bg-slate-700/50 transition-colors"
          >
            Sign out
          </button>
          <button
            onClick={onEditSetup}
            className="text-slate-300 hover:text-white text-sm px-3 py-1.5 rounded-lg border border-slate-600 hover:border-slate-500 transition-colors"
          >
            Edit Setup
          </button>
          <button
            onClick={onNewSchedule}
            className="text-slate-300 hover:text-white text-sm px-3 py-1.5 rounded-lg border border-slate-600 hover:border-slate-500 transition-colors"
          >
            New Schedule
          </button>
          <button
            onClick={handleExport}
            className="bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors"
          >
            Export as Image
          </button>
        </div>
      </div>

      {/* Subtitle */}
      <div className="max-w-5xl mx-auto mb-4">
        <p className="text-slate-400 text-sm">
          {formatLabel} &bull; {data.numCourts} court{data.numCourts > 1 ? 's' : ''} &bull; {data.rounds.length} rounds &bull; {data.allPlayers.length} players
        </p>
        {data.sessionName && (
          <h2 className="text-white text-xl font-bold mt-1">{data.sessionName}</h2>
        )}
      </div>

      {/* Stat cards */}
      <div className="max-w-5xl mx-auto mb-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: 'Courts',
            value: data.numCourts,
            icon: (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
              </svg>
            ),
            color: 'text-violet-400',
          },
          {
            label: 'Rounds',
            value: data.rounds.length,
            icon: (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            ),
            color: 'text-sky-400',
          },
          {
            label: 'Players',
            value: data.allPlayers.length,
            icon: (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
              </svg>
            ),
            color: 'text-emerald-400',
          },
          {
            label: 'Format',
            value: formatLabel,
            icon: (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
              </svg>
            ),
            color: 'text-amber-400',
          },
        ].map(card => (
          <div key={card.label} className="bg-slate-800/60 backdrop-blur border border-slate-700/50 rounded-xl p-4 text-center">
            <div className={`flex justify-center mb-1.5 ${card.color}`}>{card.icon}</div>
            <div className="text-2xl font-bold text-white leading-tight">{card.value}</div>
            <div className="text-slate-400 text-xs mt-0.5">{card.label}</div>
          </div>
        ))}
      </div>

      {/* Roster table */}
      <div className="max-w-5xl mx-auto mb-6">
        {/* Mobile scroll hint */}
        <div className="flex items-center gap-1.5 text-slate-500 text-xs mb-2 sm:hidden">
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16l-4-4m0 0l4-4m-4 4h18" />
          </svg>
          Scroll left / right to see all courts
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
          </svg>
        </div>
        <div className="overflow-x-auto rounded-2xl">
          <div ref={tableRef}>
            <RosterTable data={data} />
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="max-w-5xl mx-auto bg-slate-800/40 border border-slate-700/40 rounded-xl p-4 text-slate-400 text-xs space-y-1">
        <p>Each cell shows <strong className="text-slate-300">Team 1 vs Team 2</strong> per court.</p>
        {hasSitOuts && <p>Players listed in the <strong className="text-slate-300">Sit Out</strong> column are not playing that round.</p>}
        {data.rosterType === 'mixed' && (
          <p>
            Gender indicators: <span className="text-blue-400">♂</span> male · <span className="text-pink-400">♀</span> female.{' '}
            {data.allowSameGender
              ? 'Same-gender pairings (♂♂ or ♀♀) are allowed in this schedule.'
              : 'Each pair is always 1 male + 1 female.'}
          </p>
        )}
      </div>
    </div>
  );
}

