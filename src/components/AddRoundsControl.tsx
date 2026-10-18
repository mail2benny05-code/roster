import { useState } from 'react';

export default function AddRoundsControl({ onAdd, compact = false }: { onAdd: (count: number) => void; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(1);

  function add() {
    onAdd(Math.min(50, Math.max(1, count)));
    setOpen(false);
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className={`${compact ? 'min-h-11 rounded-xl px-4 text-sm' : 'min-h-14 w-full rounded-2xl px-5 py-3 text-base'} border border-violet-400/50 bg-violet-500/10 font-bold text-violet-100 transition hover:bg-violet-500/20`}>
        + Add rounds
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-labelledby="add-rounds-title" className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-800 p-6 shadow-2xl">
            <h2 id="add-rounds-title" className="text-lg font-bold text-white">Add more rounds</h2>
            <p className="mt-2 text-sm text-slate-400">New rounds will be added to the end. Existing scores and results stay saved.</p>
            <label className="mt-5 block text-sm font-medium text-slate-300" htmlFor="round-extension-count">Number of rounds</label>
            <input
              id="round-extension-count"
              type="number"
              min="1"
              max="50"
              value={count}
              onChange={event => setCount(Math.min(50, Math.max(1, Number.parseInt(event.target.value, 10) || 1)))}
              className="mt-2 h-12 w-full rounded-xl border border-slate-600 bg-slate-900 px-4 text-lg font-semibold text-white outline-none focus:border-violet-400"
            />
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button onClick={() => setOpen(false)} className="min-h-11 rounded-xl border border-slate-600 px-4 text-sm font-semibold text-slate-200 hover:bg-slate-700">Cancel</button>
              <button onClick={add} className="min-h-11 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-500">Add {count} round{count !== 1 ? 's' : ''}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
