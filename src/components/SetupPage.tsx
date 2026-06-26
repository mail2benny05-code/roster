import { useState, useRef } from 'react';
import type { Player, Gender, RosterType, SetupState } from '../types';
import { validateSetup } from '../utils/rosterGenerator';

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
    onGenerate({ rosterType, numCourts, numRounds, players, sessionName });
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
          <div className="flex gap-2 mb-3">
            <input
              ref={nameInputRef}
              type="text"
              value={newName}
              onChange={e => { setNewName(e.target.value); setNameError(null); }}
              onKeyDown={e => e.key === 'Enter' && addPlayer()}
              placeholder="Player name"
              className="flex-1 bg-slate-700/60 border border-slate-600 rounded-xl px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 text-sm"
            />
            {rosterType === 'mixed' && (
              <select
                value={newGender}
                onChange={e => setNewGender(e.target.value as Gender)}
                className="bg-slate-700/60 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500"
              >
                <option value="male">♂ Male</option>
                <option value="female">♀ Female</option>
              </select>
            )}
            <button
              onClick={addPlayer}
              className="bg-violet-600 hover:bg-violet-500 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
            >
              Add
            </button>
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
    </div>
  );
}

