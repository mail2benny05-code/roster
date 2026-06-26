import { useState, useRef } from 'react';
import type { Player, Gender, RosterType, SetupState } from '../types';
import { validateSetup } from '../utils/rosterGenerator';

// ── Fairness math helpers ─────────────────────────────────────────────────────

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}
function lcm(a: number, b: number): number {
  return (a / gcd(a, b)) * b;
}

/**
 * Minimum number of rounds so every player ends up with the exact same number
 * of games played. Any multiple of this value is also fair.
 */
function minFairRoundsForSetup(
  players: Player[],
  numCourts: number,
  rosterType: RosterType,
  allowSameGender: boolean,
): number {
  if (rosterType === 'mixed' && !allowSameGender) {
    // Strict mixed: males and females rotate in separate pools.
    const males = players.filter(p => p.gender === 'male').length;
    const females = players.filter(p => p.gender === 'female').length;
    const spotsPerGender = numCourts * 2;
    const maleMin = males > spotsPerGender ? males / gcd(males, spotsPerGender) : 1;
    const femaleMin = females > spotsPerGender ? females / gcd(females, spotsPerGender) : 1;
    return lcm(maleMin, femaleMin);
  }
  // Gender-based or flexible mixed: single combined pool.
  const n = players.length;
  const spotsPerRound = numCourts * 4;
  if (n <= spotsPerRound) return 1; // everyone plays every round — always fair
  return n / gcd(n, spotsPerRound);
}

interface FairnessHint {
  minFair: number;
  suggestedNext: number;       // nearest multiple of minFair that is > numRounds
  suggestedPrev: number | null; // nearest multiple of minFair that is < numRounds (null if ≤ 0)
}

interface SetupPageProps {
  initialState: SetupState;
  onGenerate: (state: SetupState) => void;
  onLogout: () => void;
  onReset: () => void;
}

interface CounterProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}

function Counter({ label, value, min, max, onChange }: CounterProps) {
  return (
    <div className="flex-1">
      <div className="text-slate-300 text-sm font-medium mb-2">{label}</div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onChange(Math.max(min, value - 1))}
          className="w-9 h-9 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold text-lg flex items-center justify-center transition-colors"
        >
          −
        </button>
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          onChange={e => {
            const v = parseInt(e.target.value, 10);
            if (!isNaN(v)) onChange(Math.min(max, Math.max(min, v)));
          }}
          className="w-16 text-center bg-slate-700 border border-slate-600 rounded-lg text-white py-1.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <button
          onClick={() => onChange(Math.min(max, value + 1))}
          className="w-9 h-9 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold text-lg flex items-center justify-center transition-colors"
        >
          +
        </button>
      </div>
    </div>
  );
}

export default function SetupPage({ initialState, onGenerate, onLogout, onReset }: SetupPageProps) {
  const [sessionName, setSessionName] = useState(initialState.sessionName);
  const [rosterType, setRosterType] = useState<RosterType>(initialState.rosterType);
  const [numCourts, setNumCourts] = useState(initialState.numCourts);
  const [numRounds, setNumRounds] = useState(initialState.numRounds);
  const [players, setPlayers] = useState<Player[]>(initialState.players);

  const [newName, setNewName] = useState('');
  const [newGender, setNewGender] = useState<Gender>('male');
  const [nameError, setNameError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [showImbalanceModal, setShowImbalanceModal] = useState(false);
  const [modalAllowSameGender, setModalAllowSameGender] = useState(false);
  const [showFairnessModal, setShowFairnessModal] = useState(false);
  const [pendingAllowSameGender, setPendingAllowSameGender] = useState(false);
  const [fairnessHint, setFairnessHint] = useState<FairnessHint>({ minFair: 1, suggestedNext: 0, suggestedPrev: null });

  const nameInputRef = useRef<HTMLInputElement>(null);

  const isEditing = initialState.players.length > 0;

  // When rosterType changes, add/remove gender field
  // Use a ref to avoid calling setState inside an effect directly
  const prevRosterTypeRef = useRef(rosterType);
  if (prevRosterTypeRef.current !== rosterType) {
    prevRosterTypeRef.current = rosterType;
    setPlayers(prev =>
      prev.map(p => {
        if (rosterType === 'mixed') {
          return { ...p, gender: p.gender ?? 'male' };
        } else {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { gender: _g, ...rest } = p;
          return rest;
        }
      }),
    );
  }

  function addPlayer() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const duplicate = players.some(
      p => p.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (duplicate) {
      setNameError('A player with that name already exists.');
      return;
    }
    const player: Player = {
      id: crypto.randomUUID(),
      name: trimmed,
      ...(rosterType === 'mixed' ? { gender: newGender } : {}),
    };
    setPlayers(prev => [...prev, player]);
    setNewName('');
    setNameError(null);
    nameInputRef.current?.focus();
  }

  function removePlayer(id: string) {
    setPlayers(prev => prev.filter(p => p.id !== id));
  }

  function updatePlayerName(id: string, name: string) {
    setPlayers(prev => prev.map(p => (p.id === id ? { ...p, name } : p)));
  }

  function updatePlayerGender(id: string, gender: Gender) {
    setPlayers(prev => prev.map(p => (p.id === id ? { ...p, gender } : p)));
  }

  function handleGenerate() {
    const { valid, errors } = validateSetup(players, numCourts, rosterType);
    if (!valid) {
      setValidationErrors(errors);
      return;
    }
    setValidationErrors([]);

    // Step 1: imbalance warning for mixed mode
    if (rosterType === 'mixed' && maleCount !== femaleCount) {
      const minorityCount = Math.min(maleCount, femaleCount);
      setModalAllowSameGender(minorityCount === numCourts * 2);
      setShowImbalanceModal(true);
      return;
    }

    // Step 2: fairness check
    checkFairnessAndGenerate(false);
  }

  /** Called after the imbalance modal is confirmed. */
  function confirmFromModal() {
    setShowImbalanceModal(false);
    checkFairnessAndGenerate(modalAllowSameGender);
  }

  /**
   * Check whether the current round count gives everyone equal games.
   * Shows the fairness modal if not; otherwise generates immediately.
   */
  function checkFairnessAndGenerate(allowSameGender: boolean) {
    setPendingAllowSameGender(allowSameGender);
    const minFair = minFairRoundsForSetup(players, numCourts, rosterType, allowSameGender);
    if (minFair > 1 && numRounds % minFair !== 0) {
      const next = Math.ceil(numRounds / minFair) * minFair;
      const prev = Math.floor(numRounds / minFair) * minFair;
      setFairnessHint({ minFair, suggestedNext: next, suggestedPrev: prev > 0 ? prev : null });
      setShowFairnessModal(true);
      return;
    }
    doGenerate(numRounds, allowSameGender);
  }

  /** Final step — actually triggers the roster generation. */
  function doGenerate(rounds: number, allowSameGender: boolean) {
    onGenerate({ rosterType, numCourts, numRounds: rounds, players, sessionName, allowSameGender });
  }

  function handleReset() {
    setSessionName('');
    setRosterType('gender');
    setNumCourts(1);
    setNumRounds(5);
    setPlayers([]);
    setNewName('');
    setNameError(null);
    setValidationErrors([]);
    onReset();
  }

  const maleCount = players.filter(p => p.gender === 'male').length;
  const femaleCount = players.filter(p => p.gender === 'female').length;
  const minPlayers = rosterType === 'mixed' ? numCourts * 2 + 1 : numCourts * 4 + 1;

  // When the minority gender exactly fills all court spots they can never sit out
  // in strict mixed mode. We use this to drive the modal warning and default checkbox.
  const minorityGenderCount = Math.min(maleCount, femaleCount);
  const neverSitsOutGender: 'male' | 'female' | null =
    rosterType === 'mixed' && maleCount !== femaleCount && minorityGenderCount === numCourts * 2
      ? maleCount <= femaleCount ? 'male' : 'female'
      : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-950 via-slate-900 to-slate-950 p-4">
      {/* Header */}
      <div className="max-w-2xl mx-auto mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-violet-600/30 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <span className="text-white font-bold text-lg">RallyQ</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            title="Reset everything and start fresh"
            className="text-slate-400 hover:text-amber-400 text-sm px-3 py-1.5 rounded-lg hover:bg-slate-700/50 transition-colors flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            Reset
          </button>
          <button
            onClick={onLogout}
            className="text-slate-400 hover:text-white text-sm px-3 py-1.5 rounded-lg hover:bg-slate-700/50 transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold text-white mb-4">
          {isEditing ? 'Edit Setup' : 'Set up your roster'}
        </h1>

        {/* Section 1: Session name */}
        <div className="bg-slate-800/60 backdrop-blur border border-slate-700/50 rounded-2xl p-5">
          <label className="text-slate-300 text-sm font-medium block mb-2">Game / Session name</label>
          <input
            type="text"
            value={sessionName}
            onChange={e => setSessionName(e.target.value)}
            placeholder="e.g. Friday Night Pickleball - June 2026"
            className="w-full bg-slate-700/60 border border-slate-600 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 text-sm"
          />
        </div>

        {/* Section 2: Roster type */}
        <div className="bg-slate-800/60 backdrop-blur border border-slate-700/50 rounded-2xl p-5">
          <div className="text-slate-300 text-sm font-medium mb-3">Roster type</div>
          <div className="grid grid-cols-2 gap-3">
            {([
              { value: 'gender', label: 'Gender-based', icon: '⚡', desc: 'Any 2 players can pair up' },
              { value: 'mixed', label: 'Mixed', icon: '🤝', desc: 'Each pair = 1 male + 1 female' },
            ] as const).map(opt => (
              <button
                key={opt.value}
                onClick={() => setRosterType(opt.value)}
                className={`border rounded-xl p-4 text-left transition-colors ${
                  rosterType === opt.value
                    ? 'border-violet-500 bg-violet-500/10'
                    : 'border-slate-600 hover:border-slate-500'
                }`}
              >
                <div className="text-xl mb-1">{opt.icon}</div>
                <div className="text-white font-medium text-sm">{opt.label}</div>
                <div className="text-slate-400 text-xs mt-0.5">{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Section 3: Courts & Rounds */}
        <div className="bg-slate-800/60 backdrop-blur border border-slate-700/50 rounded-2xl p-5">
          <div className="text-slate-300 text-sm font-medium mb-3">Courts &amp; Rounds</div>
          <div className="flex gap-6">
            <Counter label="Courts" value={numCourts} min={1} max={20} onChange={setNumCourts} />
            <Counter label="Rounds" value={numRounds} min={1} max={100} onChange={setNumRounds} />
          </div>
        </div>

        {/* Section 4: Players */}
        <div className="bg-slate-800/60 backdrop-blur border border-slate-700/50 rounded-2xl p-5">
          <div className="text-slate-300 text-sm font-medium mb-3">
            Players ({players.length} added)
          </div>

          {/* Add player */}
          <div className="flex flex-col gap-2 mb-3 sm:flex-row">
            <input
              ref={nameInputRef}
              type="text"
              value={newName}
              onChange={e => { setNewName(e.target.value); setNameError(null); }}
              onKeyDown={e => e.key === 'Enter' && addPlayer()}
              placeholder="Player name"
              className="flex-1 bg-slate-700/60 border border-slate-600 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 text-sm"
            />
            <div className="flex gap-2">
              {rosterType === 'mixed' && (
                <select
                  value={newGender}
                  onChange={e => setNewGender(e.target.value as Gender)}
                  className="flex-1 sm:flex-none bg-slate-700/60 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500"
                >
                  <option value="male">♂ Male</option>
                  <option value="female">♀ Female</option>
                </select>
              )}
              <button
                onClick={addPlayer}
                className="flex-none bg-violet-600 hover:bg-violet-500 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors"
              >
                Add
              </button>
            </div>
          </div>

          {nameError && (
            <p className="text-red-400 text-xs mb-2">{nameError}</p>
          )}

          {/* Gender count chips (mixed mode) */}
          {rosterType === 'mixed' && players.length > 0 && (
            <div className="flex gap-2 mb-3">
              <span className="bg-blue-900/40 text-blue-300 border border-blue-700/50 text-xs px-2.5 py-1 rounded-full">
                ♂ {maleCount} male{maleCount !== 1 ? 's' : ''}
              </span>
              <span className="bg-pink-900/40 text-pink-300 border border-pink-700/50 text-xs px-2.5 py-1 rounded-full">
                ♀ {femaleCount} female{femaleCount !== 1 ? 's' : ''}
              </span>
            </div>
          )}

          {/* Player list */}
          {players.length > 0 && (
            <div className="space-y-1 mb-3 max-h-64 overflow-y-auto">
              {players.map((player, idx) => (
                <div
                  key={player.id}
                  className="flex items-center gap-2 group bg-slate-700/30 hover:bg-slate-700/50 rounded-lg px-3 py-1.5"
                >
                  <span className="text-slate-500 text-xs w-5 text-right shrink-0">{idx + 1}</span>
                  <input
                    type="text"
                    value={player.name}
                    onChange={e => updatePlayerName(player.id, e.target.value)}
                    className="flex-1 bg-transparent text-white text-sm focus:outline-none"
                  />
                  {rosterType === 'mixed' && (
                    <select
                      value={player.gender}
                      onChange={e => updatePlayerGender(player.id, e.target.value as Gender)}
                      className={`text-xs rounded-full px-2 py-0.5 border focus:outline-none ${
                        player.gender === 'male'
                          ? 'bg-blue-900/40 text-blue-300 border-blue-700/50'
                          : 'bg-pink-900/40 text-pink-300 border-pink-700/50'
                      }`}
                    >
                      <option value="male">♂</option>
                      <option value="female">♀</option>
                    </select>
                  )}
                  <button
                    onClick={() => removePlayer(player.id)}
                    className="text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all text-lg leading-none"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <p className="text-slate-500 text-xs">
            Min {minPlayers} players required for {numCourts} court{numCourts > 1 ? 's' : ''}.
          </p>
        </div>

        {/* Validation errors */}
        {validationErrors.length > 0 && (
          <div className="bg-red-900/40 border border-red-700/50 rounded-xl p-4">
            {validationErrors.map((e, i) => (
              <p key={i} className="text-red-300 text-sm">{e}</p>
            ))}
          </div>
        )}

        {/* Generate button */}
        <button
          onClick={handleGenerate}
          className="w-full bg-violet-600 hover:bg-violet-500 text-white font-bold py-3.5 rounded-2xl text-base transition-colors shadow-lg"
        >
          Generate Roster →
        </button>
      </div>

      {/* ── Imbalance confirmation modal ─────────────────────────────── */}
      {showImbalanceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl">

            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-amber-500/20 rounded-xl flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
              </div>
              <div>
                <h2 className="text-white font-bold text-base">Unequal gender balance</h2>
                <p className="text-slate-400 text-xs mt-0.5">Mixed mode — confirmation required</p>
              </div>
            </div>

            {/* Body */}
            <p className="text-slate-300 text-sm mb-3">
              You have <span className="text-blue-400 font-semibold">♂ {maleCount} male</span> and{' '}
              <span className="text-pink-400 font-semibold">♀ {femaleCount} female</span> player{maleCount + femaleCount !== 1 ? 's' : ''}.
            </p>

            {/* Strong warning when one gender will NEVER sit out in strict mode */}
            {neverSitsOutGender ? (
              <div className="bg-red-900/30 border border-red-700/50 rounded-xl p-3 mb-4 flex gap-2 items-start">
                <svg className="w-4 h-4 text-red-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
                <p className="text-red-300 text-xs leading-relaxed">
                  In strict mixed mode,{' '}
                  <strong className={neverSitsOutGender === 'male' ? 'text-blue-300' : 'text-pink-300'}>
                    {neverSitsOutGender === 'male' ? '♂ male' : '♀ female'} players will never sit out
                  </strong>{' '}
                  — there are exactly {numCourts * 2} to fill {numCourts * 2} {neverSitsOutGender} spot{numCourts * 2 !== 1 ? 's' : ''} per round.
                  Enable same-gender partnerships below for a fair rotation.
                </p>
              </div>
            ) : (
              <p className="text-slate-400 text-sm mb-4">
                In strict mixed mode every pair must be 1♂ + 1♀, so the{' '}
                {maleCount > femaleCount ? 'extra male' : 'extra female'} player
                {Math.abs(maleCount - femaleCount) > 1 ? 's' : ''} will sit out more often than the other gender.
              </p>
            )}

            {/* Same-gender checkbox */}
            <label className="flex items-start gap-3 bg-slate-700/50 border border-slate-600/50 rounded-xl p-4 cursor-pointer mb-5 hover:bg-slate-700/70 transition-colors">
              <input
                type="checkbox"
                checked={modalAllowSameGender}
                onChange={e => setModalAllowSameGender(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded accent-violet-500 cursor-pointer shrink-0"
              />
              <div>
                <div className="text-white text-sm font-medium">Allow same-gender partnerships</div>
                <div className="text-slate-400 text-xs mt-1 leading-relaxed">
                  Enables <span className="text-blue-300">♂♂</span> vs <span className="text-pink-300">♀♀</span> pairings in addition to the usual{' '}
                  <span className="text-violet-300">♂♀</span> pairs. Sit-outs are shared equally across all players regardless of gender.
                </div>
              </div>
            </label>

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowImbalanceModal(false)}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold py-2.5 rounded-xl text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmFromModal}
                className="flex-1 bg-violet-600 hover:bg-violet-500 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors"
              >
                Generate Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Fairness / equal play-time modal ─────────────────────────────── */}
      {showFairnessModal && (() => {
        const isStrictMixed = rosterType === 'mixed' && !pendingAllowSameGender;
        const { minFair, suggestedNext, suggestedPrev } = fairnessHint;

        // Per-pool imbalance detail (combined pool only)
        const n = players.length;
        const spotsPerRound = numCourts * 4;
        const totalPlay = numRounds * spotsPerRound;
        const playsLow = Math.floor(totalPlay / n);
        const numHigh = totalPlay % n;
        const numLow = n - numHigh;

        // Male / female detail for strict mixed
        const males = players.filter(p => p.gender === 'male').length;
        const females = players.filter(p => p.gender === 'female').length;
        const spotsPerGender = numCourts * 2;
        const maleImbal = isStrictMixed && males > spotsPerGender
          ? { low: Math.floor(numRounds * spotsPerGender / males), numHigh: (numRounds * spotsPerGender) % males, n: males }
          : null;
        const femaleImbal = isStrictMixed && females > spotsPerGender
          ? { low: Math.floor(numRounds * spotsPerGender / females), numHigh: (numRounds * spotsPerGender) % females, n: females }
          : null;

        // Alternative court counts that give a shorter fair cycle
        const maxValidCourts = isStrictMixed
          ? Math.min(Math.floor(males / 2), Math.floor(females / 2))
          : Math.floor(n / 4);
        const courtAlts = Array.from({ length: maxValidCourts }, (_, i) => i + 1)
          .filter(c => c !== numCourts)
          .map(c => ({ courts: c, minFair: minFairRoundsForSetup(players, c, rosterType, pendingAllowSameGender) }))
          .filter(alt => alt.minFair < minFair)
          .sort((a, b) => a.minFair - b.minFair)
          .slice(0, 2);

        // Round pills to display
        const pills: number[] = [];
        if (suggestedPrev) pills.push(suggestedPrev);
        pills.push(suggestedNext);
        if (suggestedNext + minFair <= suggestedNext * 2) pills.push(suggestedNext + minFair);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl">

              {/* Header */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-sky-500/20 rounded-xl flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 3v1m0 16v1M4.22 4.22l.707.707M18.364 18.364l.707.707M1 12h1m20 0h1M4.22 19.778l.707-.707M18.364 5.636l.707-.707M12 7a5 5 0 1 0 0 10A5 5 0 0 0 12 7Z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-white font-bold text-base">Uneven play time</h2>
                  <p className="text-slate-400 text-xs mt-0.5">
                    {numRounds} rounds doesn't divide evenly with {n} players
                  </p>
                </div>
              </div>

              {/* Imbalance detail */}
              {!isStrictMixed && numHigh > 0 && (
                <div className="flex items-stretch gap-2 mb-4">
                  <div className="flex-1 bg-amber-900/30 border border-amber-700/40 rounded-xl p-3 text-center">
                    <div className="text-amber-300 font-bold text-2xl">{playsLow + 1}</div>
                    <div className="text-amber-400/80 text-xs mt-0.5">games &mdash; {numHigh} player{numHigh > 1 ? 's' : ''}</div>
                  </div>
                  <div className="flex items-center text-slate-600 text-sm font-medium">vs</div>
                  <div className="flex-1 bg-slate-700/40 border border-slate-600/40 rounded-xl p-3 text-center">
                    <div className="text-slate-300 font-bold text-2xl">{playsLow}</div>
                    <div className="text-slate-400/80 text-xs mt-0.5">games &mdash; {numLow} player{numLow > 1 ? 's' : ''}</div>
                  </div>
                </div>
              )}
              {isStrictMixed && (maleImbal || femaleImbal) && (
                <div className="space-y-2 mb-4">
                  {maleImbal && maleImbal.numHigh > 0 && (
                    <div className="bg-blue-900/20 border border-blue-700/40 rounded-xl px-3 py-2 text-xs text-blue-300">
                      <span className="font-semibold">♂ Males ({maleImbal.n}):</span>{' '}
                      {maleImbal.numHigh} play <strong>{maleImbal.low + 1}</strong> games,{' '}
                      {maleImbal.n - maleImbal.numHigh} play <strong>{maleImbal.low}</strong> games
                    </div>
                  )}
                  {femaleImbal && femaleImbal.numHigh > 0 && (
                    <div className="bg-pink-900/20 border border-pink-700/40 rounded-xl px-3 py-2 text-xs text-pink-300">
                      <span className="font-semibold">♀ Females ({femaleImbal.n}):</span>{' '}
                      {femaleImbal.numHigh} play <strong>{femaleImbal.low + 1}</strong> games,{' '}
                      {femaleImbal.n - femaleImbal.numHigh} play <strong>{femaleImbal.low}</strong> games
                    </div>
                  )}
                </div>
              )}

              {/* Min fair info */}
              <p className="text-slate-400 text-sm mb-3">
                Equal play requires round counts that are multiples of{' '}
                <span className="text-white font-semibold">{minFair}</span>
                {' '}— e.g.{' '}
                {[minFair, minFair * 2, minFair * 3].filter(r => r <= 200).join(', ')}…
              </p>

              {/* Round pills */}
              <div className="flex gap-2 flex-wrap mb-4">
                {pills.map(r => (
                  <button
                    key={r}
                    onClick={() => { setNumRounds(r); setShowFairnessModal(false); doGenerate(r, pendingAllowSameGender); }}
                    className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                      r === suggestedNext
                        ? 'bg-violet-600 hover:bg-violet-500 text-white'
                        : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                    }`}
                  >
                    {r} rounds{r === suggestedNext ? ' ✓' : ''}
                  </button>
                ))}
              </div>

              {/* Court alternatives */}
              {courtAlts.length > 0 && (
                <div className="bg-slate-700/30 rounded-xl px-3 py-2.5 mb-4">
                  <p className="text-slate-400 text-xs font-medium mb-1.5">💡 Court alternatives for shorter cycles</p>
                  {courtAlts.map(alt => (
                    <p key={alt.courts} className="text-slate-300 text-xs">
                      <span className="font-semibold">{alt.courts} court{alt.courts > 1 ? 's' : ''}</span>
                      {' → '}multiples of <span className="text-violet-400 font-semibold">{alt.minFair}</span> rounds
                      {alt.minFair === 1 ? ' (always fair — everyone plays each round)' : ''}
                    </p>
                  ))}
                </div>
              )}

              {/* Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => { setShowFairnessModal(false); doGenerate(numRounds, pendingAllowSameGender); }}
                  className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold py-2.5 rounded-xl text-sm transition-colors"
                >
                  Keep {numRounds} rounds
                </button>
                <button
                  onClick={() => { setNumRounds(suggestedNext); setShowFairnessModal(false); doGenerate(suggestedNext, pendingAllowSameGender); }}
                  className="flex-1 bg-violet-600 hover:bg-violet-500 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors"
                >
                  Use {suggestedNext} rounds
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

