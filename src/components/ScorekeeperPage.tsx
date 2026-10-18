import { useState } from 'react';
import type { GameScore, RosterData, Round } from '../types';
import { getScore, scoreKey } from '../utils/scoreResults';
import AddRoundsControl from './AddRoundsControl';

interface Props {
  data: RosterData;
  scores: GameScore[];
  onScoreChange: (scores: GameScore[]) => void;
  onBack: () => void;
  onFinish: (scores: GameScore[]) => void;
  onAddRounds: (count: number) => void;
  initialRoundNumber?: number;
  onRoundChange: (roundNumber: number) => void;
}

export default function ScorekeeperPage({ data, scores, onScoreChange, onBack, onFinish, onAddRounds, initialRoundNumber, onRoundChange }: Props) {
  const [selectedRound, setSelectedRound] = useState(initialRoundNumber ?? data.rounds[0]?.roundNumber ?? 1);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const round = data.rounds.find(item => item.roundNumber === selectedRound) ?? data.rounds[0];

  function updateScore(roundNumber: number, courtNumber: number, field: 'team1Score' | 'team2Score', value: string) {
    const score = getScore(scores, roundNumber, courtNumber);
    const parsed = Math.max(0, Number.parseInt(value, 10) || 0);
    const updated = { ...score, [field]: parsed, doNotPlay: false };
    const key = scoreKey(roundNumber, courtNumber);
    onScoreChange([...scores.filter(item => scoreKey(item.roundNumber, item.courtNumber) !== key), updated]);
  }

  function updateGameScore(roundNumber: number, courtNumber: number, gameIndex: number, field: 'team1Score' | 'team2Score', value: string) {
    const score = getScore(scores, roundNumber, courtNumber);
    const games = Array.from({ length: 3 }, (_, index) => score.games?.[index] ?? { team1Score: 0, team2Score: 0 });
    games[gameIndex] = { ...games[gameIndex], [field]: Math.max(0, Number.parseInt(value, 10) || 0) };
    const updated = { ...score, games, doNotPlay: false };
    const key = scoreKey(roundNumber, courtNumber);
    onScoreChange([...scores.filter(item => scoreKey(item.roundNumber, item.courtNumber) !== key), updated]);
  }

  function finish() {
    setConfirmFinish(true);
  }

  function addRounds(count: number) {
    selectRound(data.rounds.length + 1);
    onAddRounds(count);
  }

  function selectRound(roundNumber: number) {
    setSelectedRound(roundNumber);
    onRoundChange(roundNumber);
  }

  function confirmAndFinish() {
    const finalScores = data.rounds.flatMap(gameRound => gameRound.courts.map(court => {
      const score = getScore(scores, gameRound.roundNumber, court.courtNumber);
      return score.team1Score === 0 && score.team2Score === 0 ? { ...score, doNotPlay: true } : score;
    }));
    setConfirmFinish(false);
    onFinish(finalScores);
  }

  if (!round) return null;
  const countRoundComplete = (gameRound: Round) => gameRound.courts.every(court => {
    const score = getScore(scores, gameRound.roundNumber, court.courtNumber);
    return score.doNotPlay || score.team1Score !== 0 || score.team2Score !== 0;
  });
  const unfinishedCount = data.rounds.reduce((sum, gameRound) => sum + gameRound.courts.filter(court => {
    const score = getScore(scores, gameRound.roundNumber, court.courtNumber);
    return !score.doNotPlay && score.team1Score === 0 && score.team2Score === 0;
  }).length, 0);

  return (
    <main className="min-h-screen bg-gradient-to-br from-violet-950 via-slate-900 to-slate-950 p-4 pb-10 text-white">
      <header className="mx-auto mb-6 flex max-w-4xl items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-emerald-300">Live scoring</p>
          <h1 className="mt-1 text-2xl font-bold">{data.sessionName || 'Round robin'}</h1>
          <p className="mt-1 text-xs text-slate-400">Progress is saved on this device.</p>
        </div>
        <button onClick={onBack} className="min-h-11 rounded-xl border border-slate-600 px-4 text-sm text-slate-200 hover:bg-slate-800">Schedule</button>
      </header>

      <section className="mx-auto max-w-4xl">
        <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {data.rounds.map(gameRound => {
            const complete = countRoundComplete(gameRound);
            return (
              <button
                key={gameRound.roundNumber}
                onClick={() => selectRound(gameRound.roundNumber)}
                aria-pressed={selectedRound === gameRound.roundNumber}
                className={`min-h-14 rounded-xl border px-3 py-2 text-left transition-colors ${selectedRound === gameRound.roundNumber ? 'border-violet-400 bg-violet-500/20' : 'border-slate-700 bg-slate-800/60 hover:border-slate-500'}`}
              >
                <span className="flex items-center justify-between gap-2 text-sm font-semibold">
                  Round {gameRound.roundNumber}
                  {complete ? <span className="text-emerald-300" aria-label="Complete">✓</span> : <span className="text-amber-300" aria-label="Scores needed">•</span>}
                </span>
                <span className="mt-1 block text-xs text-slate-400">{gameRound.courts.length} match{gameRound.courts.length !== 1 ? 'es' : ''}</span>
              </button>
            );
          })}
        </div>

        <div className="mb-5 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">Round {round.roundNumber}</h2>
            <p className="mt-1 text-sm text-slate-400">Enter the match score, or expand to record each game for comeback stats.</p>
          </div>
          <span className="text-xs text-slate-400">{unfinishedCount} unfinished</span>
        </div>

        <div className="space-y-3">
          {round.courts.map(court => {
            const score = getScore(scores, round.roundNumber, court.courtNumber);
            const players1 = court.team1.map(player => player.name).join(' & ');
            const players2 = court.team2.map(player => player.name).join(' & ');
            return (
              <article key={court.courtNumber} className="rounded-2xl border border-slate-700 bg-slate-800/70 p-4 sm:p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-200">Court {court.courtNumber}</h3>
                  {score.doNotPlay && <span className="rounded-full bg-slate-700 px-2.5 py-1 text-xs text-slate-300">Do not play</span>}
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)_72px] items-center gap-x-3 gap-y-3 sm:grid-cols-[minmax(0,1fr)_90px]">
                  <label htmlFor={`r${round.roundNumber}c${court.courtNumber}t1`} className="min-w-0 text-sm font-medium text-white">{players1}</label>
                  <input
                    id={`r${round.roundNumber}c${court.courtNumber}t1`}
                    type="number" min="0" inputMode="numeric" value={score.team1Score || ''}
                    onChange={event => updateScore(round.roundNumber, court.courtNumber, 'team1Score', event.target.value)}
                    aria-label={`${players1} score`}
                    className="h-12 w-full rounded-xl border border-slate-600 bg-slate-900 text-center text-xl font-bold text-white outline-none focus:border-violet-400"
                  />
                  <label htmlFor={`r${round.roundNumber}c${court.courtNumber}t2`} className="min-w-0 text-sm font-medium text-white">{players2}</label>
                  <input
                    id={`r${round.roundNumber}c${court.courtNumber}t2`}
                    type="number" min="0" inputMode="numeric" value={score.team2Score || ''}
                    onChange={event => updateScore(round.roundNumber, court.courtNumber, 'team2Score', event.target.value)}
                    aria-label={`${players2} score`}
                    className="h-12 w-full rounded-xl border border-slate-600 bg-slate-900 text-center text-xl font-bold text-white outline-none focus:border-violet-400"
                  />
                </div>
                <details className="mt-4 rounded-xl border border-slate-700/70 bg-slate-900/50 p-3">
                  <summary className="cursor-pointer text-xs font-medium text-slate-300">Record individual game scores (best of 3)</summary>
                  <div className="mt-3 space-y-2">
                    {[0, 1, 2].map(gameIndex => {
                      const game = score.games?.[gameIndex];
                      return (
                        <div key={gameIndex} className="grid grid-cols-[1fr_64px_64px] items-center gap-2 text-xs text-slate-400">
                          <span>Game {gameIndex + 1}</span>
                          <input type="number" min="0" inputMode="numeric" value={game?.team1Score || ''}
                            aria-label={`${players1}, game ${gameIndex + 1} score`}
                            onChange={event => updateGameScore(round.roundNumber, court.courtNumber, gameIndex, 'team1Score', event.target.value)}
                            className="h-10 w-full rounded-lg border border-slate-600 bg-slate-950 text-center text-base font-semibold text-white outline-none focus:border-violet-400" />
                          <input type="number" min="0" inputMode="numeric" value={game?.team2Score || ''}
                            aria-label={`${players2}, game ${gameIndex + 1} score`}
                            onChange={event => updateGameScore(round.roundNumber, court.courtNumber, gameIndex, 'team2Score', event.target.value)}
                            className="h-10 w-full rounded-lg border border-slate-600 bg-slate-950 text-center text-base font-semibold text-white outline-none focus:border-violet-400" />
                        </div>
                      );
                    })}
                    <p className="text-xs text-slate-500">Leave unused games blank. These scores power clean-sweep and comeback metrics.</p>
                  </div>
                </details>
              </article>
            );
          })}
        </div>

        {round.sittingOut.length > 0 && (
          <div className="mt-4 rounded-xl border border-slate-700/70 bg-slate-800/40 p-4 text-sm text-slate-300">
            <span className="font-semibold text-slate-200">Sitting out:</span> {round.sittingOut.map(player => player.name).join(', ')}
          </div>
        )}

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <AddRoundsControl onAdd={addRounds} />
          <button onClick={finish} className="min-h-14 w-full rounded-2xl bg-emerald-600 px-5 py-3 text-base font-bold text-white shadow-lg shadow-emerald-950/30 transition hover:bg-emerald-500">
            Finish Round Robin
          </button>
        </div>
      </section>

      {confirmFinish && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm">
          <div role="alertdialog" aria-modal="true" aria-labelledby="unfinished-title" className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-700 bg-slate-800 p-6 shadow-2xl">
            <h2 id="unfinished-title" className="text-lg font-bold text-white">{unfinishedCount ? 'Unfinished games remain' : 'Finish round robin?'}</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              {unfinishedCount
                ? `${unfinishedCount} game${unfinishedCount !== 1 ? 's are' : ' is'} still at 0–0. Confirm that these games should be marked as “Do not play” and excluded from the results.`
                : 'All games are completed. Are you sure you want to finish the round robin and view the final results?'}
            </p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button onClick={() => setConfirmFinish(false)} className="min-h-11 rounded-xl border border-slate-600 px-4 text-sm font-semibold text-slate-200 hover:bg-slate-700">Keep playing</button>
              <button onClick={confirmAndFinish} className="min-h-11 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-500">{unfinishedCount ? 'Mark Do not play & finish' : 'Yes, finish round robin'}</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
