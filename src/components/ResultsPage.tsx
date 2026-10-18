import { useRef } from 'react';
import { toPng } from 'html-to-image';
import type { GameScore, RosterData } from '../types';
import { calculateResults } from '../utils/scoreResults';
import AddRoundsControl from './AddRoundsControl';

interface Props {
  data: RosterData;
  scores: GameScore[];
  onBack: () => void;
  onSchedule: () => void;
  onAddRounds: (count: number) => void;
}

const MEDALS = ['🥇', '🥈', '🥉'];

export default function ResultsPage({ data, scores, onBack, onSchedule, onAddRounds }: Props) {
  const summaryRef = useRef<HTMLDivElement>(null);
  const results = calculateResults(data, scores);
  const activeStandings = results.standings.filter(standing => standing.played > 0);
  const podium = activeStandings.slice(0, 3);
  const dominant = [...activeStandings].sort((a, b) => b.pointDifference - a.pointDifference || b.winPercentage - a.winPercentage || b.wins - a.wins)[0];
  const mostWins = [...activeStandings].sort((a, b) => b.wins - a.wins || b.winPercentage - a.winPercentage || b.pointDifference - a.pointDifference)[0];
  const playedCount = results.standings.reduce((sum, standing) => sum + standing.played, 0) / (data.rosterType === 'fixed' ? 2 : 4);

  async function downloadImage() {
    if (!summaryRef.current) return;
    const dataUrl = await toPng(summaryRef.current, {
      pixelRatio: 2,
      backgroundColor: '#0f172a',
      width: summaryRef.current.scrollWidth,
      height: summaryRef.current.scrollHeight,
    });
    downloadUrl(dataUrl, `${data.sessionName || 'round-robin-results'}.png`);
  }

  function downloadHtml() {
    const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
    const title = escape(data.sessionName || 'Round robin results');
    const podiumRows = activeStandings.slice(0, 3).map((standing, index) => `<li><strong>${index + 1}. ${escape(standing.name)}</strong> — ${standing.wins} wins, ${standing.losses} losses, ${standing.winPercentage.toFixed(1)}% win rate</li>`).join('');
    const tableRows = results.standings.map((standing, index) => `<tr><td>${index + 1}</td><th scope="row">${escape(standing.name)}</th><td>${standing.wins}</td><td>${standing.losses}</td><td>${standing.pointsFor}</td><td>${standing.pointsAgainst}</td><td>${standing.winPercentage.toFixed(1)}%</td></tr>`).join('');
    const highlights = [
      `<li><strong>Dominant performance:</strong> ${escape(dominant?.name ?? '—')}${dominant ? ` (${dominant.wins} wins, ${dominant.pointDifference >= 0 ? '+' : ''}${dominant.pointDifference} point difference)` : ''}</li>`,
      `<li><strong>Most wins:</strong> ${escape(mostWins?.name ?? '—')}${mostWins ? ` (${mostWins.wins})` : ''}</li>`,
      `<li><strong>Biggest win:</strong> ${results.biggestWin ? `${escape(results.biggestWin.winner)} ${results.biggestWin.winnerScore}–${results.biggestWin.loserScore} ${escape(results.biggestWin.loser)}` : 'No decisive scores'}</li>`,
      `<li><strong>Toughest fight:</strong> ${results.toughestLoss ? `${escape(results.toughestLoss.name)} (average loss margin ${results.toughestLoss.averageMargin.toFixed(1)})` : 'No losses recorded'}</li>`,
      `<li><strong>Spoiler index:</strong> ${results.spoilers.length ? results.spoilers.map(item => `${escape(item.name)} (${item.count})`).join(', ') : 'No top-three upsets'}</li>`,
      `<li><strong>Clean sweep:</strong> ${results.cleanSweepLeader ? `${escape(results.cleanSweepLeader.name)} (${results.cleanSweepLeader.percentage.toFixed(1)}%, ${results.cleanSweepLeader.cleanSweeps}/${results.cleanSweepLeader.matches} recorded matches)` : 'No individual game scores recorded'}</li>`,
      `<li><strong>Most Comeback Wins:</strong> ${results.comebackLeader ? `${escape(results.comebackLeader.name)} (${results.comebackLeader.wins} comeback wins)` : 'No comeback wins recorded'}</li>`,
      `<li><strong>Giant Slayer:</strong> ${results.giantSlayer ? `${escape(results.giantSlayer.name)} (${results.giantSlayer.wins} wins over the top-ranked ${data.rosterType === 'fixed' ? 'team' : 'player'})` : 'No losses by the top-ranked player/team'}</li>`,
    ].join('');
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><style>
      *{box-sizing:border-box}body{margin:0;padding:32px;background:#f1f5f9;color:#0f172a;font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}.page{max-width:1000px;margin:auto;background:white;border-radius:22px;padding:32px;box-shadow:0 16px 50px #0f172a18}h1{margin:0;font-size:32px}h2{margin:28px 0 10px;font-size:21px}.muted{color:#64748b}.podium{padding:18px 24px;border-radius:16px;background:linear-gradient(135deg,#fef3c7,#f5f3ff)}.podium li,.highlights li{margin:8px 0}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:left}thead{background:#f8fafc}td:not(:nth-child(2)){text-align:center}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px}.card{padding:16px;border:1px solid #e2e8f0;border-radius:14px;background:#f8fafc}.card strong{display:block;margin-bottom:5px;color:#6d28d9}@media(max-width:600px){body{padding:10px}.page{padding:18px;overflow-x:auto}h1{font-size:25px}table{min-width:620px}}
      </style></head><body><main class="page"><p class="muted">RallyQ · Final results</p><h1>${title}</h1><p class="muted">${playedCount} games recorded · ${scores.filter(score => score.doNotPlay).length} marked do not play · ${data.rosterType === 'fixed' ? 'Team standings' : 'Player standings'}</p><h2>Top finishers</h2><ol class="podium">${podiumRows || '<li>No games were recorded.</li>'}</ol><h2>Standings</h2><table><thead><tr><th>Rank</th><th>${data.rosterType === 'fixed' ? 'Team' : 'Player'}</th><th>W</th><th>L</th><th>Points earned</th><th>Points given</th><th>Win %</th></tr></thead><tbody>${tableRows}</tbody></table><h2>Game highlights</h2><ul class="highlights">${highlights}</ul></main></body></html>`;
    const objectUrl = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    downloadUrl(objectUrl, `${data.sessionName || 'round-robin-results'}.html`);
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-violet-950 via-slate-900 to-slate-950 p-4 pb-10 text-white">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.18em] text-amber-300">Event complete</p>
            <h1 className="mt-1 text-3xl font-extrabold">Final Results</h1>
            <p className="mt-1 text-sm text-slate-400">{data.sessionName || 'Round robin'} · {playedCount} games recorded</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <AddRoundsControl onAdd={onAddRounds} compact />
            <button onClick={downloadImage} className="min-h-11 rounded-xl border border-slate-600 px-4 text-sm text-slate-200 hover:bg-slate-800">Download image</button>
            <button onClick={downloadHtml} className="min-h-11 rounded-xl border border-slate-600 px-4 text-sm text-slate-200 hover:bg-slate-800">Download HTML</button>
            <button onClick={onBack} className="min-h-11 rounded-xl border border-slate-600 px-4 text-sm text-slate-200 hover:bg-slate-800">Back to scoring</button>
            <button onClick={onSchedule} className="min-h-11 rounded-xl border border-violet-500/50 bg-violet-500/10 px-4 text-sm font-semibold text-violet-200 hover:bg-violet-500/20">View schedule</button>
          </div>
        </header>

        <div ref={summaryRef} className="rounded-3xl bg-slate-900 p-3 sm:p-5">
        {podium.length > 0 ? (
          <section aria-label="Top finishers" className="mb-8 rounded-3xl border border-amber-300/15 bg-gradient-to-br from-amber-300/10 via-slate-800/70 to-violet-900/20 p-5 sm:p-8">
            <div className="mb-6 text-center">
              <div className="text-3xl" aria-hidden="true">🏆</div>
              <h2 className="mt-1 text-xl font-bold">Top Finishers</h2>
              <p className="text-xs text-slate-400">Ranked by win percentage, wins, then point difference</p>
            </div>
            <div className="mx-auto grid max-w-3xl grid-cols-3 items-end gap-2 sm:gap-4">
              {[podium[1], podium[0], podium[2]].map((standing, index) => {
                if (!standing) return <div key={`empty-${index}`} />;
                const rank = index === 0 ? 2 : index === 1 ? 1 : 3;
                const height = rank === 1 ? 'min-h-40 sm:min-h-48' : rank === 2 ? 'min-h-32 sm:min-h-40' : 'min-h-28 sm:min-h-36';
                const tint = rank === 1 ? 'border-amber-300/40 from-amber-400/20' : rank === 2 ? 'border-slate-300/30 from-slate-300/15' : 'border-orange-300/30 from-orange-400/15';
                return (
                  <div key={standing.id} className={`flex ${height} flex-col items-center justify-end rounded-t-2xl border border-b-0 bg-gradient-to-b ${tint} to-slate-900/60 px-2 pb-4 pt-5 text-center`}>
                    <span className="text-2xl sm:text-3xl" aria-hidden="true">{MEDALS[rank - 1]}</span>
                    <span className="mt-2 w-full break-words text-sm font-bold sm:text-base">{standing.name}</span>
                    <span className="mt-1 text-xs text-slate-300">{standing.wins}W · {standing.losses}L</span>
                    <span className="mt-1 text-xs font-semibold text-amber-200">{standing.winPercentage.toFixed(0)}% win</span>
                  </div>
                );
              })}
            </div>
          </section>
        ) : (
          <div className="mb-8 rounded-2xl border border-slate-700 bg-slate-800/60 p-6 text-center text-slate-300">No games were recorded, so there are no finishers yet.</div>
        )}

        <section className="mb-8">
            <div className="mb-4">
              <h2 className="text-xl font-bold">Standings</h2>
              <p className="mt-1 text-sm text-slate-400">{data.rosterType === 'fixed' ? 'Results are tracked by fixed partner team.' : 'Results are tracked for each player.'}</p>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-slate-700 bg-slate-800/60">
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <thead className="bg-slate-700/60 text-xs uppercase tracking-wide text-slate-300">
                  <tr>
                    <th className="px-4 py-3">Rank</th><th className="px-4 py-3">{data.rosterType === 'fixed' ? 'Team' : 'Player'}</th><th className="px-3 py-3 text-center">W</th><th className="px-3 py-3 text-center">L</th><th className="px-3 py-3 text-center">Points earned</th><th className="px-3 py-3 text-center">Points given</th><th className="px-3 py-3 text-center">Win %</th>
                  </tr>
                </thead>
                <tbody>
                  {results.standings.map((standing, index) => (
                    <tr key={standing.id} className="border-t border-slate-700/70 text-slate-200">
                      <td className="px-4 py-3 font-semibold text-slate-400">{index + 1}</td>
                      <td className="px-4 py-3 font-semibold">{standing.name}{standing.draws > 0 && <span className="ml-2 text-xs font-normal text-slate-400">{standing.draws} draw{standing.draws !== 1 ? 's' : ''}</span>}</td>
                      <td className="px-3 py-3 text-center text-emerald-300">{standing.wins}</td>
                      <td className="px-3 py-3 text-center text-rose-300">{standing.losses}</td>
                      <td className="px-3 py-3 text-center tabular-nums">{standing.pointsFor}</td>
                      <td className="px-3 py-3 text-center tabular-nums">{standing.pointsAgainst}</td>
                      <td className="px-3 py-3 text-center font-semibold tabular-nums">{standing.winPercentage.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        </section>

        <section>
          <div className="mb-4">
            <h2 className="text-xl font-bold">Game highlights</h2>
            <p className="mt-1 text-sm text-slate-400">Standout performances from the round robin.</p>
          </div>
          {activeStandings.length === 0 ? (
            <p className="rounded-2xl border border-slate-700 bg-slate-800/50 p-5 text-sm text-slate-400">Highlights appear after at least one game has a score.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <HighlightCard icon="👑" title="Dominant performance" value={dominant?.name ?? '—'} detail={dominant ? `${dominant.wins} wins · ${dominant.winPercentage.toFixed(0)}% win rate · ${dominant.pointDifference >= 0 ? '+' : ''}${dominant.pointDifference} point differential` : 'No completed games'} />
              <HighlightCard icon="🚀" title="Biggest win" value={results.biggestWin?.winner ?? '—'} detail={results.biggestWin ? `${results.biggestWin.winnerScore}–${results.biggestWin.loserScore}, a ${results.biggestWin.margin}-point margin over ${results.biggestWin.loser}` : 'No decisive scores recorded'} />
              <HighlightCard icon="💪" title="Toughest fight" value={results.toughestLoss?.name ?? '—'} detail={results.toughestLoss ? `${results.toughestLoss.losses} loss${results.toughestLoss.losses !== 1 ? 'es' : ''} with an average losing margin of ${results.toughestLoss.averageMargin.toFixed(1)} points` : 'No losses recorded'} />
              <HighlightCard icon="🏅" title="Most wins" value={mostWins?.name ?? '—'} detail={mostWins ? `${mostWins.wins} match${mostWins.wins !== 1 ? 'es' : ''} won` : 'No wins recorded'} />
              <HighlightCard icon="🧨" title="Spoiler index" value={results.spoilers[0]?.name ?? '—'} detail={results.spoilers[0] ? `${results.spoilers[0].count} win${results.spoilers[0].count !== 1 ? 's' : ''} over top-three ranked opposition` : 'No top-three upsets recorded'} />
              <HighlightCard icon="🧹" title="Clean sweep" value={results.cleanSweepLeader?.name ?? '—'} detail={results.cleanSweepLeader ? `${results.cleanSweepLeader.percentage.toFixed(1)}% clean sweeps · ${results.cleanSweepLeader.cleanSweeps} of ${results.cleanSweepLeader.matches} matches with individual game scores` : 'Record individual game scores to calculate 2–0 matches'} />
              <HighlightCard icon="❤️‍🔥" title="Most Comeback Wins" value={results.comebackLeader?.name ?? '—'} detail={results.comebackLeader ? `${results.comebackLeader.wins} match${results.comebackLeader.wins !== 1 ? 'es' : ''} won after losing Game 1` : 'No comeback wins recorded'} />
              <HighlightCard icon="🗡️" title="Giant Slayer" value={results.giantSlayer?.name ?? '—'} detail={results.giantSlayer ? `${results.giantSlayer.wins} win${results.giantSlayer.wins !== 1 ? 's' : ''} against the top-ranked ${data.rosterType === 'fixed' ? 'team' : 'player'}` : 'No losses by the top-ranked player/team'} />
            </div>
          )}
        </section>
        </div>
      </div>
    </main>
  );
}

function downloadUrl(url: string, filename: string) {
  const link = document.createElement('a');
  link.download = filename.replace(/[\\/:*?"<>|]+/g, '-');
  link.href = url;
  link.click();
}

function HighlightCard({ icon, title, value, detail }: { icon: string; title: string; value: string; detail: string }) {
  return (
    <article className="rounded-2xl border border-slate-700 bg-gradient-to-br from-slate-800/90 to-slate-800/40 p-5 shadow-lg shadow-slate-950/20">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-violet-300"><span className="text-xl" aria-hidden="true">{icon}</span>{title}</div>
      <h3 className="mt-3 break-words text-lg font-bold text-white">{value}</h3>
      <p className="mt-1 text-sm leading-relaxed text-slate-400">{detail}</p>
    </article>
  );
}
