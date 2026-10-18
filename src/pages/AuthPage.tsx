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
  ArrowRight,
  Sparkles,
  User,
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { profilesService } from '@/lib/services';
import { authErrorMessage } from '@/lib/authMessages';
import type { Memory } from '@/lib/types';
import { navigateTo } from '@/lib/router';

type Mode = 'signin' | 'signup';

export function AuthPage({ mode: initialMode }: { mode?: Mode }) {
  const [mode, setMode] = useState<Mode>(initialMode ?? 'signin');
  const [name, setName] = useState('');
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
        const cleanName = name.trim();
        if (!cleanName) {
          setError('Please enter your full or display name.');
          return;
        }
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              display_name: cleanName,
            },
          },
        });
        if (error) {
          setError(authErrorMessage(error));
          return;
        }
        localStorage.setItem('echoself:display_name', cleanName);
        if (data.session?.user) {
          void profilesService.upsert({ id: data.session.user.id, display_name: cleanName });
          setNotice('Account created. Your personal workspace is ready.');
          navigateTo('home');
        } else if (data.session) {
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
    <div className="w-full max-w-sm sm:max-w-md mx-auto my-auto animate-[fadeIn_150ms_ease-out]">
      {/* Auth Card */}
      <div className="card-surface p-5 sm:p-7 rounded-3xl border border-linen-dark/80 bg-paper/95 backdrop-blur-md shadow-card space-y-4 sm:space-y-5">
        {/* Card Header */}
        <div className="text-center space-y-1.5">
          <div className="inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-gradient-to-br from-terracotta to-terracotta-dark text-paper shadow-xs mb-1">
            <Feather className="w-5 h-5" aria-hidden />
          </div>
          <h1 className="font-serif text-xl sm:text-2xl font-bold text-charcoal tracking-tight">
            {mode === 'signin' ? 'Welcome back' : 'Create your workspace'}
          </h1>
          <p className="text-xs text-slateink leading-relaxed max-w-xs mx-auto">
            {mode === 'signin'
              ? 'Sign in to access your private memories, decisions, and twin.'
              : 'Your experiences, beliefs, and reflections in strict privacy.'}
          </p>
        </div>

        {/* Segmented Mode Switcher */}
        <div
          className="p-1 rounded-full bg-linen border border-linen-dark/80 flex items-center"
          role="tablist"
        >
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
        <form
          onSubmit={handleSubmit}
          className="space-y-3 sm:space-y-3.5"
          aria-label={mode === 'signin' ? 'Sign in form' : 'Sign up form'}
        >
          {/* Full / Display Name (Sign Up only) */}
          {mode === 'signup' && (
            <div>
              <label htmlFor="auth-name" className="block text-xs font-semibold text-charcoal mb-1">
                Your name
              </label>
              <div className="relative">
                <User
                  className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slateink-light pointer-events-none"
                  aria-hidden
                />
                <input
                  id="auth-name"
                  type="text"
                  required
                  maxLength={50}
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Jordan Miller"
                  className="w-full h-10 sm:h-10.5 pl-10 pr-3.5 rounded-xl border border-linen-dark bg-white text-xs sm:text-sm text-charcoal placeholder:text-slateink-light focus:outline-none focus:border-terracotta transition-all shadow-2xs"
                />
              </div>
            </div>
          )}

          {/* Email Field */}
          <div>
            <label htmlFor="auth-email" className="block text-xs font-semibold text-charcoal mb-1">
              Email address
            </label>
            <div className="relative">
              <Mail
                className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slateink-light pointer-events-none"
                aria-hidden
              />
              <input
                id="auth-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full h-10 sm:h-10.5 pl-10 pr-3.5 rounded-xl border border-linen-dark bg-white text-xs sm:text-sm text-charcoal placeholder:text-slateink-light focus:outline-none focus:border-terracotta transition-all shadow-2xs"
              />
            </div>
          </div>

          {/* Password Field */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="auth-password" className="block text-xs font-semibold text-charcoal">
                Password
              </label>
              {mode === 'signup' && (
                <span className="text-[10px] text-slateink-light">Minimum 6 characters</span>
              )}
            </div>
            <div className="relative">
              <Lock
                className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slateink-light pointer-events-none"
                aria-hidden
              />
              <input
                id="auth-password"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={6}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full h-10 sm:h-10.5 pl-10 pr-10 rounded-xl border border-linen-dark bg-white text-xs sm:text-sm text-charcoal placeholder:text-slateink-light focus:outline-none focus:border-terracotta transition-all shadow-2xs font-mono"
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
            <div
              role="alert"
              className="rounded-xl bg-clayred-light/60 border border-clayred-light p-2.5 text-xs text-clayred-DEFAULT flex items-start gap-2 shadow-2xs"
            >
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
              <span className="leading-snug">{error}</span>
            </div>
          )}

          {notice && (
            <div
              role="status"
              className="rounded-xl bg-sage-light/60 border border-sage/40 p-2.5 text-xs text-sage-dark flex items-start gap-2 shadow-2xs"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
              <span className="leading-snug">{notice}</span>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={busy}
            className="w-full h-10 sm:h-10.5 inline-flex items-center justify-center gap-2 rounded-full bg-charcoal text-paper text-xs sm:text-sm font-semibold hover:bg-terracotta transition-all duration-150 disabled:opacity-50 shadow-xs cursor-pointer active:scale-98"
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

        {/* Fast-Pass Demo Option */}
        <div className="pt-2 border-t border-linen-dark/60 space-y-2">
          <a
            href="/memories"
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
              e.preventDefault();
              navigateTo('memories');
            }}
            className="w-full h-9 inline-flex items-center justify-center gap-1.5 rounded-full border border-linen-dark/80 bg-white/80 hover:bg-linen text-slateink-dark hover:text-charcoal text-xs font-semibold transition-all shadow-2xs cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-terracotta" />
            <span>Explore Demo Persona (Jordan)</span>
            <ArrowRight className="w-3.5 h-3.5 opacity-60" />
          </a>
        </div>

        {/* Trust & Security Footnote */}
        <div className="flex items-center justify-center gap-1.5 text-[11px] text-slateink-light text-center pt-0.5">
          <ShieldCheck className="w-3.5 h-3.5 text-sage-dark shrink-0" aria-hidden />
          <span>Row-level database security · Private by design</span>
        </div>
      </div>
    </div>
  );
}
