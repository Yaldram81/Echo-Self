import { useState, type FormEvent } from 'react';
import { Feather, LogIn, UserPlus, LoaderCircle } from 'lucide-react';
import { Card, SectionHeading } from '@/components/ui';
import { supabase } from '@/lib/supabaseClient';
import { authErrorMessage } from '@/lib/authMessages';
import type { Memory } from '@/lib/types';
import { navigateTo } from '@/lib/router';

type Mode = 'signin' | 'signup';

export function AuthPage({ mode: initialMode }: { mode?: Mode }) {
  const [mode, setMode] = useState<Mode>(initialMode ?? 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) {
          setError(authErrorMessage(error));
          return;
        }
        if (data.session) {
          setNotice('Account created. Your personal workspace is ready.');
          navigateTo('home');
        } else {
          setNotice(
            'Account created, but this project requires email confirmation before signing in. Check your inbox for the confirmation link.'
          );
        }
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(authErrorMessage(error));
        return;
      }
      setNotice('Signed in. Redirecting to your workspace…');
      // Fire-and-forget embedding backfill: keeps the semantic index fresh
      // (idempotent, content-hash based) without blocking navigation.
      void (async () => {
        try {
          const { data } = await supabase.auth.getSession();
          if (!data.session) return;
          const { data: rows } = await supabase
            .from('memories')
            .select('*')
            .not('user_id', 'is', null)
            .limit(500);
          if (rows?.length) {
            const { memoryEmbeddingService } = await import('@/lib/memoryEmbeddingService');
            await memoryEmbeddingService.backfillAll(rows as Memory[]);
          }
        } catch {
          // backfill failure degrades to keyword-only retrieval; never blocks sign-in
        }
      })();
      navigateTo('home');
    } catch {
      setError('Could not reach the account service. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    'w-full rounded-xl border border-linen-dark bg-white px-4 py-2.5 text-sm text-charcoal placeholder:text-slateink-light focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta';

  return (
    <div className="max-w-md mx-auto space-y-8">
      <SectionHeading
        eyebrow="Account"
        title={mode === 'signin' ? 'Sign in' : 'Create your workspace'}
      />

      <Card>
        <div className="flex items-center gap-3 mb-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-terracotta text-paper shrink-0">
            <Feather className="w-5 h-5" aria-hidden />
          </span>
          <p className="text-sm text-slateink leading-relaxed">
            {mode === 'signin'
              ? 'Sign in to reach your personal workspace. The public sample persona stays browsable without an account.'
              : 'A new account starts with an empty, private workspace only you can see. Email and password, nothing else.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" aria-label={mode === 'signin' ? 'Sign in form' : 'Sign up form'}>
          <div>
            <label htmlFor="auth-email" className="block text-xs font-medium text-slateink-dark mb-1.5">
              Email
            </label>
            <input
              id="auth-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="auth-password" className="block text-xs font-medium text-slateink-dark mb-1.5">
              Password
            </label>
            <input
              id="auth-password"
              type="password"
              required
              minLength={6}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              className={inputClass}
            />
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-clayred-light px-4 py-2.5 text-sm text-clayred-DEFAULT">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="rounded-lg bg-sage-light px-4 py-2.5 text-sm text-sage-dark">
              {notice}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-charcoal px-5 py-2.5 text-sm font-medium text-paper hover:bg-slateink-dark transition-colors disabled:opacity-50"
          >
            {busy ? (
              <LoaderCircle className="w-4 h-4 animate-spin" aria-hidden />
            ) : mode === 'signin' ? (
              <LogIn className="w-4 h-4" aria-hidden />
            ) : (
              <UserPlus className="w-4 h-4" aria-hidden />
            )}
            {busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-slateink">
          {mode === 'signin' ? (
            <>
              New here?{' '}
              <button
                onClick={() => {
                  setMode('signup');
                  setError(null);
                  setNotice(null);
                  navigateTo('signup', { replace: true });
                }}
                className="font-medium text-terracotta-deep hover:underline"
              >
                Create an account
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                onClick={() => {
                  setMode('signin');
                  setError(null);
                  setNotice(null);
                  navigateTo('signin', { replace: true });
                }}
                className="font-medium text-terracotta-deep hover:underline"
              >
                Sign in
              </button>
            </>
          )}
        </p>
      </Card>

      <p className="text-center text-xs text-slateink-light leading-relaxed">
        Your workspace is private: only your account can read or change your records. The
        fictional sample persona is shared read-only and is never mixed into your data.
      </p>
    </div>
  );
}
