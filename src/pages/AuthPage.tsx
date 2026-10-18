import { useState, type FormEvent } from 'react';
import {
  Feather,
  LogIn,
  UserPlus,
  LoaderCircle,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { SectionHeading } from '@/components/ui';
import { supabase } from '@/lib/supabaseClient';
import { authErrorMessage } from '@/lib/authMessages';
import type { Memory } from '@/lib/types';
import { navigateTo } from '@/lib/router';

type Mode = 'signin' | 'signup';

export function AuthPage({ mode: initialMode }: { mode?: Mode }) {
  const [mode, setMode] = useState<Mode>(initialMode ?? 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
      // Fire-and-forget embedding backfill: keeps semantic index fresh without blocking
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
          // degrades to keyword retrieval gracefully
        }
      })();
      navigateTo('home');
    } catch {
      setError('Could not reach the account service. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  const switchMode = (newMode: Mode) => {
    setMode(newMode);
    setError(null);
    setNotice(null);
    navigateTo(newMode, { replace: true });
  };

  return (
    <div className="max-w-md mx-auto space-y-6 pb-28 sm:pb-16 px-1 sm:px-0">
      {/* Top Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-terracotta/10 border border-terracotta/20 text-terracotta-deep shadow-2xs mb-1">
          <Feather className="w-6 h-6" aria-hidden />
        </div>
        <SectionHeading
          eyebrow="Account"
          title={mode === 'signin' ? 'Sign in to EchoSelf' : 'Create your workspace'}
          as="h1"
        />
        <p className="text-xs sm:text-sm text-slateink max-w-sm mx-auto leading-relaxed">
          {mode === 'signin'
            ? 'Sign in to access your private memories, decisions, and personalized twin.'
            : 'Start with a clean, private workspace protected by row-level database security.'}
        </p>
      </div>

      {/* Main Auth Card */}
      <div className="card-surface p-5 sm:p-7 rounded-2xl sm:rounded-3xl border border-linen-dark/80 bg-paper shadow-xs space-y-5">
        {/* Segmented Mode Switcher */}
        <div className="p-1 rounded-full bg-linen border border-linen-dark/80 flex items-center" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signin'}
            onClick={() => switchMode('signin')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-full transition-all cursor-pointer ${
              mode === 'signin'
                ? 'bg-charcoal text-paper shadow-2xs'
                : 'text-slateink-dark hover:text-charcoal'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signup'}
            onClick={() => switchMode('signup')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-full transition-all cursor-pointer ${
              mode === 'signup'
                ? 'bg-charcoal text-paper shadow-2xs'
                : 'text-slateink-dark hover:text-charcoal'
            }`}
          >
            Create Account
          </button>
        </div>

        {/* Auth Form */}
        <form onSubmit={handleSubmit} className="space-y-4" aria-label={mode === 'signin' ? 'Sign in form' : 'Sign up form'}>
          {/* Email Field */}
          <div>
            <label htmlFor="auth-email" className="block text-xs font-semibold text-charcoal mb-1.5">
              Email address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slateink-light pointer-events-none" aria-hidden />
              <input
                id="auth-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full h-11 pl-10 pr-4 rounded-xl border border-linen-dark bg-white text-xs sm:text-sm text-charcoal placeholder:text-slateink-light focus:outline-none focus:ring-1 focus:ring-terracotta/50 focus:border-terracotta transition-all shadow-2xs"
              />
            </div>
          </div>

          {/* Password Field */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="auth-password" className="block text-xs font-semibold text-charcoal">
                Password
              </label>
              {mode === 'signup' && (
                <span className="text-[10px] text-slateink-light">Minimum 6 characters</span>
              )}
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slateink-light pointer-events-none" aria-hidden />
              <input
                id="auth-password"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={6}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full h-11 pl-10 pr-10 rounded-xl border border-linen-dark bg-white text-xs sm:text-sm text-charcoal placeholder:text-slateink-light focus:outline-none focus:ring-1 focus:ring-terracotta/50 focus:border-terracotta transition-all shadow-2xs font-mono"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slateink-light hover:text-charcoal transition-colors cursor-pointer"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Error & Status Alerts */}
          {error && (
            <div role="alert" className="rounded-xl bg-clayred-light/60 border border-clayred-light p-3 text-xs text-clayred-DEFAULT flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
              <span className="leading-relaxed">{error}</span>
            </div>
          )}

          {notice && (
            <div role="status" className="rounded-xl bg-sage-light/60 border border-sage/40 p-3 text-xs text-sage-dark flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
              <span className="leading-relaxed">{notice}</span>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={busy}
            className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-full bg-charcoal text-paper text-xs sm:text-sm font-semibold hover:bg-slateink-dark transition-all disabled:opacity-50 shadow-xs cursor-pointer"
          >
            {busy ? (
              <LoaderCircle className="w-4 h-4 animate-spin" aria-hidden />
            ) : mode === 'signin' ? (
              <LogIn className="w-4 h-4" aria-hidden />
            ) : (
              <UserPlus className="w-4 h-4" aria-hidden />
            )}
            <span>{busy ? 'Verifying…' : mode === 'signin' ? 'Sign In' : 'Create Account'}</span>
          </button>
        </form>

        {/* Footer Link */}
        <p className="text-center text-xs text-slateink pt-1">
          {mode === 'signin' ? (
            <>
              Don't have an account yet?{' '}
              <button
                type="button"
                onClick={() => switchMode('signup')}
                className="font-semibold text-terracotta-deep hover:text-terracotta-dark hover:underline cursor-pointer"
              >
                Create one now
              </button>
            </>
          ) : (
            <>
              Already registered?{' '}
              <button
                type="button"
                onClick={() => switchMode('signin')}
                className="font-semibold text-terracotta-deep hover:text-terracotta-dark hover:underline cursor-pointer"
              >
                Sign in to your account
              </button>
            </>
          )}
        </p>
      </div>

      {/* Trust & Privacy Footnote */}
      <div className="flex items-start gap-2 text-center justify-center max-w-sm mx-auto text-xs text-slateink-light leading-relaxed">
        <ShieldCheck className="w-4 h-4 text-sage-dark shrink-0 mt-0.5" aria-hidden />
        <span>
          Private by design: records are protected by database row-level security. The public sample persona remains separate and read-only.
        </span>
      </div>
    </div>
  );
}
