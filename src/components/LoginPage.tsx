import { useEffect, useState } from 'react';
import netlifyIdentity from 'netlify-identity-widget';

interface LoginPageProps {
  onLogin: (email?: string) => void;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check for existing session
    const user = netlifyIdentity.currentUser();
    if (user) {
      onLogin(user.email);
      return;
    }

    const handleLogin = (user: { email: string }) => {
      netlifyIdentity.close();
      onLogin(user.email);
      setLoading(false);
    };

    const handleError = (err: Error) => {
      setError(err.message || 'Authentication error');
      setLoading(false);
    };

    netlifyIdentity.on('login', handleLogin);
    netlifyIdentity.on('error', handleError);

    return () => {
      netlifyIdentity.off('login', handleLogin);
      netlifyIdentity.off('error', handleError);
    };
  }, [onLogin]);

  function handleSignIn() {
    setLoading(true);
    setError(null);
    netlifyIdentity.open('login');
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-slate-800/60 backdrop-blur border border-slate-700/50 rounded-2xl p-8 shadow-2xl">
          {/* Icon */}
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-violet-600/20 rounded-2xl flex items-center justify-center">
              <svg
                className="w-9 h-9 text-violet-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
                />
              </svg>
            </div>
          </div>

          {/* Title */}
          <h1 className="text-3xl font-bold text-white text-center mb-2">RallyQ</h1>
          <p className="text-slate-400 text-center mb-8 text-sm leading-relaxed">
            Generate balanced pickleball schedules in seconds
          </p>

          {/* Error */}
          {error && (
            <div className="bg-red-900/40 border border-red-700/50 rounded-lg p-3 mb-4 text-red-300 text-sm">
              {error}
            </div>
          )}

          {/* Sign In Button */}
          <button
            onClick={handleSignIn}
            disabled={loading}
            className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-60 text-white font-semibold py-3 px-6 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Signing in…
              </>
            ) : (
              'Sign In →'
            )}
          </button>

          {/* Footer */}
          <p className="text-slate-500 text-xs text-center mt-6 leading-relaxed">
            Access is by invitation only. Contact your admin if you need access.
          </p>
        </div>
      </div>
    </div>
  );
}

