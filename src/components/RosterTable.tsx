import { forwardRef } from 'react';
import type { RosterData, Player } from '../types';

interface RosterTableProps {
  data: RosterData;
}

const COURT_COLORS: [string, string, string][] = [
  ['#e9d5ff', '#f3e8ff', '#6b21a8'],   // soft purple
  ['#dbeafe', '#eff6ff', '#1e40af'],   // soft blue
  ['#d1fae5', '#ecfdf5', '#065f46'],   // soft green
  ['#fef3c7', '#fffbeb', '#92400e'],   // soft amber
  ['#fce7f3', '#fdf2f8', '#9d1740'],   // soft pink
  ['#cffafe', '#ecfeff', '#164e63'],   // soft cyan
];

/** Order a team so a female player is listed first (mixed rosters). */
function orderTeam(players: Player[]): Player[] {
  return [...players].sort((a, b) => {
    const rank = (p: Player) => (p.gender === 'female' ? 0 : 1);
    return rank(a) - rank(b);
  });
}

interface NameRowProps {
  players: Player[];
  showGender: boolean;
  textColor: string;
  bgColor: string;
}

function NameRow({ players, showGender, textColor, bgColor }: NameRowProps) {
  return (
    <div
      className="roster-player-name"
      style={{
        background: bgColor,
        borderRadius: 8,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        flexWrap: 'wrap' as const,
        color: textColor,
      }}
    >
      {players.map((p, i) => (
        <span key={p.id}>
          {i > 0 && <span style={{ color: '#94a3b8', fontWeight: 400, margin: '0 2px' }}>&amp;</span>}
          {p.name}
          {showGender && p.gender && (
            <sup style={{ color: p.gender === 'male' ? '#3b82f6' : '#ec4899', fontSize: 8, marginLeft: 1 }}>
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
  showGender: boolean;
}

function PlayerPanel({ title, players, accentColor, bgColor, showGender }: PlayerPanelProps) {
  const cols = Math.min(4, Math.max(1, Math.ceil(players.length / 2)));
  return (
    <div className="roster-player-panel" style={{ background: bgColor }}>
      <div style={{ color: accentColor, fontWeight: 700, fontSize: 11, marginBottom: 6 }}>{title}</div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '4px 12px' }}>
        {players.map((p, i) => (
          <div key={p.id} style={{ fontSize: 10, color: '#374151' }}>
            <span style={{ color: '#9ca3af', marginRight: 4 }}>{i + 1}.</span>
            {p.name}
            {showGender && p.gender && (
              <sup style={{ color: p.gender === 'male' ? '#3b82f6' : '#ec4899', fontSize: 8, marginLeft: 2 }}>
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
  const { rounds, rosterType, partnerMode, allPlayers, numCourts, sessionName } = data;
  const isMixed = rosterType === 'mixed';
  const isHybrid = rosterType === 'gender' && partnerMode === 'hybrid';
  const showGender = isMixed || isHybrid;
  const hasSitOuts = rounds.some(r => r.sittingOut.length > 0);
  const today = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
  const males = allPlayers.filter(p => p.gender === 'male');
  const females = allPlayers.filter(p => p.gender === 'female');

  function formatLabel(): string {
    if (isMixed) return data.allowSameGender ? 'Mixed (flexible)' : 'Mixed';
    if (isHybrid) return 'Gender-based (combo)';
    return 'Gender-based';
  }

  return (
    <div
      ref={ref}
      className="roster-table-container"
      style={{
        background: '#ffffff',
        fontFamily: "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif",
        borderRadius: 14,
        boxSizing: 'border-box' as const,
      }}
    >
      {/* Header */}
      <div
        className="roster-header"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}
      >
        <div>
          <div style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: 2 }}>
            Pickleball Schedule
          </div>
          <div className="roster-session-title">
            {sessionName || 'Schedule'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const, justifyContent: 'flex-end' }}>
          {[
            formatLabel(),
            `${numCourts} Court${numCourts > 1 ? 's' : ''}`,
            `${rounds.length} Rounds`,
            `${allPlayers.length} Players`,
          ].map(lbl => (
            <span
              key={lbl}
              className="roster-badge"
              style={{ background: '#f1f5f9', color: '#475569' }}
            >
              {lbl}
            </span>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="roster-table-wrapper">
        <table className="roster-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <colgroup>
            <col style={{ width: 52 }} />
            {Array.from({ length: numCourts }).map((_, i) => <col key={i} />)}
            {hasSitOuts && <col style={{ width: 108 }} />}
          </colgroup>
          <thead>
            <tr>
              <th
                className="roster-th"
                style={{
                  background: '#f1f5f9',
                  color: '#334155',
                  position: 'sticky',
                  left: 0,
                  zIndex: 3,
                  borderLeft: 'none',
                }}
              >
                Game
              </th>
              {Array.from({ length: numCourts }).map((_, ci) => {
                const [headerBg, , textColor] = COURT_COLORS[ci % COURT_COLORS.length];
                return (
                  <th
                    key={ci}
                    className="roster-th"
                    style={{
                      background: headerBg,
                      color: textColor,
                      borderLeft: '1px solid rgba(0,0,0,0.05)',
                    }}
                  >
                    Court {ci + 1}
                  </th>
                );
              })}
              {hasSitOuts && (
                <th
                  className="roster-th"
                  style={{
                    background: '#e2e8f0',
                    color: '#475569',
                    borderLeft: '1px solid rgba(0,0,0,0.05)',
                  }}
                >
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
                  <td
                    className="roster-td roster-round-number"
                    style={{
                      background: '#f8fafc',
                      color: '#334155',
                      borderTop: '1px solid #e2e8f0',
                      position: 'sticky',
                      left: 0,
                      zIndex: 1,
                    }}
                  >
                    {round.roundNumber}
                  </td>
                  {round.courts.map((court, ci) => {
                    const [, tintBg, textColor] = COURT_COLORS[ci % COURT_COLORS.length];
                    return (
                      <td
                        key={ci}
                        className="roster-td"
                        style={{
                          background: rowBg,
                          borderLeft: '1px solid #e2e8f0',
                          borderTop: '1px solid #e2e8f0',
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 4, alignItems: 'center' }}>
                          <NameRow players={orderTeam(court.team1)} showGender={showGender} textColor={textColor} bgColor={tintBg} />
                          <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>VS</span>
                          <NameRow players={orderTeam(court.team2)} showGender={showGender} textColor={textColor} bgColor={tintBg} />
                        </div>
                      </td>
                    );
                  })}
                  {hasSitOuts && (
                    <td
                      className="roster-td"
                      style={{
                        background: rowBg,
                        fontSize: 10,
                        color: '#64748b',
                        fontStyle: 'italic',
                        borderLeft: '1px solid #e2e8f0',
                        borderTop: '1px solid #e2e8f0',
                      }}
                    >
                      {round.sittingOut.length === 0 ? '—' : round.sittingOut.map(p => p.name).join(', ')}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="roster-footer">
        <div className="roster-footer-players" style={{ display: 'flex', gap: 10, flex: 1 }}>
          {showGender && males.length > 0 && females.length > 0 ? (
            <>
              <PlayerPanel title="♂ Male Players" players={males} accentColor="#3b82f6" bgColor="#eff6ff" showGender={true} />
              <PlayerPanel title="♀ Female Players" players={females} accentColor="#ec4899" bgColor="#fdf2f8" showGender={true} />
            </>
          ) : (
            <PlayerPanel title="Players" players={allPlayers} accentColor="#6d28d9" bgColor="#f5f3ff" showGender={false} />
          )}
        </div>
        <div className="roster-date">{today}</div>
      </div>
    </div>
  );
});

export default RosterTable;
