import { useEffect, useState } from 'react';
import netlifyIdentity from 'netlify-identity-widget';

interface LoginPageProps {
  onLogin: (email?: string) => void;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Auto-login if a valid session already exists
    const user = netlifyIdentity.currentUser();
    if (user) {
      onLogin(user.email);
    }
  }, [onLogin]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    setError(null);
    try {
      // Use the widget's internal GoTrue client so the session is stored
      // exactly the same way — currentUser() and logout() keep working.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const gotrue = (netlifyIdentity as any).gotrue;
      const user = await gotrue.login(email, password);
      onLogin(user.email);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Invalid email or password';
      setError(msg);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-slate-800/60 backdrop-blur border border-slate-700/50 rounded-2xl p-8 shadow-2xl">

          {/* Icon */}
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-violet-600/20 rounded-2xl flex items-center justify-center">
              <svg className="w-9 h-9 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
            </div>
          </div>

          {/* Title */}
          <h1 className="text-3xl font-bold text-white text-center mb-2">RallyQ</h1>
          <p className="text-slate-400 text-center mb-8 text-sm leading-relaxed">
            Generate balanced pickleball schedules in seconds
          </p>

          {/* Login form — native inputs so iOS triggers Password AutoFill */}
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="email"
              autoComplete="username"
              placeholder="Email"
              value={email}
              onChange={e => { setEmail(e.target.value); setError(null); }}
              required
              className="w-full bg-slate-700/60 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 text-sm"
            />
            <input
              type="password"
              autoComplete="current-password"
              placeholder="Password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(null); }}
              required
              className="w-full bg-slate-700/60 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 text-sm"
            />

            {/* Error */}
            {error && (
              <div className="bg-red-900/40 border border-red-700/50 rounded-lg p-3 text-red-300 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-60 text-white font-semibold py-3 px-6 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing in…
                </>
              ) : (
                'Sign In →'
              )}
            </button>
          </form>

          {/* Footer */}
          <p className="text-slate-500 text-xs text-center mt-6 leading-relaxed">
            Access is by invitation only. Contact your admin if you need access.
          </p>
        </div>
      </div>
    </div>
  );
}
