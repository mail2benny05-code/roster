import { forwardRef } from 'react';
import './RosterTable.css';
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
            <sup style={{ color: p.gender === 'male' ? '#3b82f6' : '#ec4899', fontSize: 10, marginLeft: 1 }}>
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
      <div style={{ color: accentColor, fontWeight: 700, fontSize: 12, marginBottom: 10 }}>{title}</div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '8px 12px' }}>
        {players.map((p, i) => (
          <div key={p.id} style={{ fontSize: 12, color: '#374151' }}>
            <span style={{ color: '#9ca3af', marginRight: 4 }}>{i + 1}.</span>
            {p.name}
            {showGender && p.gender && (
              <sup style={{ color: p.gender === 'male' ? '#3b82f6' : '#ec4899', fontSize: 10, marginLeft: 2 }}>
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
    if (rosterType === 'fixed') return 'Fixed Partner';
    if (isMixed) return data.allowSameGender ? 'Mixed (flexible)' : 'Mixed';
    if (isHybrid) return 'Gender-based (combo)';
    return 'Gender-based';
  }

  return (
    <div ref={ref} className="roster-table-container">
      <div className="roster-header">
        <div>
          <div className="roster-eyebrow"><span /> RallyQ · Pickleball schedule</div>
          <h2 className="roster-session-title">{sessionName || 'Your game plan'}</h2>
          <div className="roster-header-date">{today}</div>
        </div>
        <div className="roster-badges">
          {[formatLabel(), `${numCourts} Court${numCourts > 1 ? 's' : ''}`, `${rounds.length} Rounds`, `${allPlayers.length} Players`].map(label => (
            <span key={label} className="roster-badge">{label}</span>
          ))}
        </div>
      </div>

      <div className="roster-table-wrapper">
        <table className="roster-table" aria-label={sessionName ? `${sessionName} schedule` : 'Pickleball schedule'}>
          <thead>
            <tr>
              <th scope="col" className="roster-th roster-game-heading">Round</th>
              {Array.from({ length: numCourts }, (_, ci) => (
                <th scope="col" key={ci} className="roster-th">
                  <span className="roster-court-label">
                    <span className="roster-court-dot" style={{ background: COURT_COLORS[ci % COURT_COLORS.length][2] }} />
                    Court {String(ci + 1).padStart(2, '0')}
                  </span>
                </th>
              ))}
              {hasSitOuts && <th scope="col" className="roster-th roster-rest-heading">Sit out</th>}
            </tr>
          </thead>
          <tbody>
            {rounds.map(round => (
              <tr key={round.roundNumber}>
                <th scope="row" className="roster-round-number">
                  <span>{String(round.roundNumber).padStart(2, '0')}</span>
                </th>
                {round.courts.map((court, ci) => {
                  const [, tintBg, textColor] = COURT_COLORS[ci % COURT_COLORS.length];
                  return (
                    <td key={ci} className="roster-td">
                      <div className="roster-matchup" style={{ background: tintBg }}>
                        <NameRow players={orderTeam(court.team1)} showGender={showGender} textColor={textColor} bgColor="transparent" />
                        <div className="roster-versus"><span />vs<span /></div>
                        <NameRow players={orderTeam(court.team2)} showGender={showGender} textColor={textColor} bgColor="transparent" />
                      </div>
                    </td>
                  );
                })}
                {hasSitOuts && (
                  <td className="roster-td roster-rest">
                    {round.sittingOut.length === 0 ? <span className="roster-rest-empty">—</span> : (
                      <div className="roster-rest-players">{round.sittingOut.map(p => <span key={p.id}>{p.name}</span>)}</div>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="roster-footer">
        <div className="roster-footer-players">
          {showGender && males.length > 0 && females.length > 0 ? (
            <>
              <PlayerPanel title="♂ Male Players" players={males} accentColor="#3b82f6" bgColor="#f8fafc" showGender={true} />
              <PlayerPanel title="♀ Female Players" players={females} accentColor="#db2777" bgColor="#f8fafc" showGender={true} />
            </>
          ) : (
            <PlayerPanel title="Player lineup" players={allPlayers} accentColor="#6d28d9" bgColor="#f8fafc" showGender={false} />
          )}
        </div>
        <div className="roster-date">Made for good games. <span>RallyQ</span></div>
      </div>
    </div>
  );
});

export default RosterTable;
