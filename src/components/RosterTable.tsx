import { forwardRef } from 'react';
import type { RosterData, Player } from '../types';

interface RosterTableProps {
  data: RosterData;
}

const COURT_COLORS: [string, string, string][] = [
  ['#6d28d9', '#f5f3ff', '#4c1095'],
  ['#0369a1', '#f0f9ff', '#075985'],
  ['#047857', '#ecfdf5', '#065f46'],
  ['#b45309', '#fffbeb', '#92400e'],
  ['#be185d', '#fdf2f8', '#9d1740'],
  ['#0891b2', '#ecfeff', '#164e63'],
];

interface NameRowProps {
  players: Player[];
  isMixed: boolean;
  textColor: string;
  bgColor: string;
}

function NameRow({ players, isMixed, textColor, bgColor }: NameRowProps) {
  return (
    <div style={{ background: bgColor, borderRadius: 8, padding: '5px 8px', display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' as const, color: textColor, fontSize: 13, fontWeight: 600 }}>
      {players.map((p, i) => (
        <span key={p.id}>
          {i > 0 && <span style={{ color: '#94a3b8', fontWeight: 400, margin: '0 2px' }}>&amp;</span>}
          {p.name}
          {isMixed && (
            <sup style={{ color: p.gender === 'male' ? '#3b82f6' : '#ec4899', fontSize: 10, marginLeft: 2 }}>
              {p.gender === 'male' ? '♂' : '♀'}
            </sup>
          )}
        </span>
      ))}
    </div>
  );
}

interface PlayerPanelProps {
  title: string;
  players: Player[];
  accentColor: string;
  bgColor: string;
  isMixed: boolean;
}

function PlayerPanel({ title, players, accentColor, bgColor, isMixed }: PlayerPanelProps) {
  const cols = Math.min(4, Math.max(1, Math.ceil(players.length / 2)));
  return (
    <div style={{ background: bgColor, borderRadius: 10, padding: '10px 14px', flex: 1 }}>
      <div style={{ color: accentColor, fontWeight: 700, fontSize: 13, marginBottom: 8 }}>{title}</div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '4px 12px' }}>
        {players.map((p, i) => (
          <div key={p.id} style={{ fontSize: 12, color: '#374151' }}>
            <span style={{ color: '#9ca3af', marginRight: 4 }}>{i + 1}.</span>
            {p.name}
            {isMixed && (
              <sup style={{ color: p.gender === 'male' ? '#3b82f6' : '#ec4899', fontSize: 9, marginLeft: 2 }}>
                {p.gender === 'male' ? '♂' : '♀'}
              </sup>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const RosterTable = forwardRef<HTMLDivElement, RosterTableProps>(function RosterTable({ data }, ref) {
  const { rounds, rosterType, allPlayers, numCourts, sessionName } = data;
  const isMixed = rosterType === 'mixed';
  const hasSitOuts = rounds.some(r => r.sittingOut.length > 0);
  const today = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
  const males = allPlayers.filter(p => p.gender === 'male');
  const females = allPlayers.filter(p => p.gender === 'female');

  return (
    <div
      ref={ref}
      style={{ background: '#ffffff', fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif", width: 900, padding: 20, borderRadius: 14, boxSizing: 'border-box' as const }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: 2 }}>
            Pickleball Schedule
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#1e1b4b', lineHeight: 1.2 }}>
            {sessionName || 'Schedule'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const, justifyContent: 'flex-end' }}>
          {[
            isMixed ? 'Mixed' : 'Gender-based',
            `${numCourts} Court${numCourts > 1 ? 's' : ''}`,
            `${rounds.length} Rounds`,
            `${allPlayers.length} Players`,
          ].map(label => (
            <span key={label} style={{ background: '#ede9fe', color: '#6d28d9', borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 600 }}>
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' as const }}>
        <colgroup>
          <col style={{ width: 52 }} />
          {Array.from({ length: numCourts }).map((_, i) => <col key={i} />)}
          {hasSitOuts && <col style={{ width: 108 }} />}
        </colgroup>
        <thead>
          <tr>
            <th style={{ background: '#1e1b4b', color: '#a78bfa', padding: '8px 6px', fontSize: 11, fontWeight: 700, textAlign: 'center' as const, position: 'sticky', left: 0, zIndex: 3 }}>
              Game
            </th>
            {Array.from({ length: numCourts }).map((_, ci) => {
              const [headerBg] = COURT_COLORS[ci % COURT_COLORS.length];
              return (
                <th key={ci} style={{ background: headerBg, color: '#ffffff', padding: '8px 6px', fontSize: 11, fontWeight: 700, textAlign: 'center' as const, borderLeft: '1px solid rgba(255,255,255,0.2)' }}>
                  Court {ci + 1}
                </th>
              );
            })}
            {hasSitOuts && (
              <th style={{ background: '#475569', color: '#e2e8f0', padding: '8px 6px', fontSize: 11, fontWeight: 700, textAlign: 'center' as const, borderLeft: '1px solid rgba(255,255,255,0.2)' }}>
                Sit Out
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rounds.map((round, ri) => {
            const rowBg = ri % 2 === 0 ? '#f8fafc' : '#ffffff';
            return (
              <tr key={round.roundNumber}>
                <td style={{ background: '#1e1b4b', color: '#e0e7ff', textAlign: 'center' as const, padding: '10px 4px', fontSize: 18, fontWeight: 800, borderTop: '1px solid rgba(255,255,255,0.08)', position: 'sticky', left: 0, zIndex: 1 }}>
                  {round.roundNumber}
                </td>
                {round.courts.map((court, ci) => {
                  const [, tintBg, textColor] = COURT_COLORS[ci % COURT_COLORS.length];
                  return (
                    <td key={ci} style={{ background: rowBg, padding: '8px 6px', verticalAlign: 'middle' as const, borderLeft: '1px solid #e2e8f0', borderTop: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 4, alignItems: 'center' }}>
                        <NameRow players={court.team1} isMixed={isMixed} textColor={textColor} bgColor={tintBg} />
                        <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>VS</span>
                        <NameRow players={court.team2} isMixed={isMixed} textColor={textColor} bgColor={tintBg} />
                      </div>
                    </td>
                  );
                })}
                {hasSitOuts && (
                  <td style={{ background: rowBg, padding: '8px 6px', fontSize: 12, color: '#64748b', fontStyle: 'italic', textAlign: 'center' as const, borderLeft: '1px solid #e2e8f0', borderTop: '1px solid #e2e8f0', verticalAlign: 'middle' as const }}>
                    {round.sittingOut.length === 0 ? '—' : round.sittingOut.map(p => p.name).join(', ')}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Footer */}
      <div style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', gap: 10, flex: 1 }}>
          {isMixed ? (
            <>
              <PlayerPanel title="♂ Male Players" players={males} accentColor="#3b82f6" bgColor="#eff6ff" isMixed={true} />
              <PlayerPanel title="♀ Female Players" players={females} accentColor="#ec4899" bgColor="#fdf2f8" isMixed={true} />
            </>
          ) : (
            <PlayerPanel title="Players" players={allPlayers} accentColor="#6d28d9" bgColor="#f5f3ff" isMixed={false} />
          )}
        </div>
        <div style={{ minWidth: 100 }}>
          <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, marginBottom: 6 }}>Courts</div>
          {Array.from({ length: numCourts }).map((_, ci) => {
            const [headerBg] = COURT_COLORS[ci % COURT_COLORS.length];
            return (
              <div key={ci} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <div style={{ width: 12, height: 12, borderRadius: 3, background: headerBg, flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: '#374151' }}>Court {ci + 1}</span>
              </div>
            );
          })}
          <div style={{ marginTop: 10, fontSize: 10, color: '#9ca3af', textAlign: 'right' as const }}>{today}</div>
        </div>
      </div>
    </div>
  );
});

export default RosterTable;

