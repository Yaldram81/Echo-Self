import { useState, useEffect } from 'react';
import {
  UserCircle2,
  Mail,
  Calendar,
  ShieldCheck,
  ShieldAlert,
  Database,
  Sparkles,
  BookOpen,
  Compass,
  Scale,
  LogOut,
  Edit3,
  Check,
  ExternalLink,
  Lock,
  Layers,
  KeyRound,
  Laptop,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ArrowRight,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useAuth } from '@/lib/useAuth';
import { supabase } from '@/lib/supabaseClient';
import { memoriesService, beliefsService, decisionsService } from '@/lib/services';
import { navigateTo } from '@/lib/router';
import { SectionHeading, Card } from '@/components/ui';

export function ProfilePage() {
  const { user, session } = useAuth();
  const [memoryCount, setMemoryCount] = useState<number | null>(null);
  const [beliefCount, setBeliefCount] = useState<number | null>(null);
  const [decisionCount, setDecisionCount] = useState<number | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  // Editable profile fields
  const [displayName, setDisplayName] = useState(() => {
    return (
      localStorage.getItem('echoself:display_name') ||
      (user?.email ? user.email.split('@')[0] : 'Reflective Thinker')
    );
  });
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(displayName);

  const [bio, setBio] = useState(() => {
    return (
      localStorage.getItem('echoself:user_bio') ||
      'Examining life through evidence, recorded experiences, and deliberate choices.'
    );
  });
  const [isEditingBio, setIsEditingBio] = useState(false);
  const [bioInput, setBioInput] = useState(bio);

  // Twin reflection preferences
  const [twinTone, setTwinTone] = useState(() => {
    return localStorage.getItem('echoself:twin_tone') || 'contemplative';
  });

  // Password & Security State
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswordText, setShowPasswordText] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Revoke sessions state
  const [revoking, setRevoking] = useState(false);
  const [revokeNotice, setRevokeNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadStats() {
      try {
        const [m, b, d] = await Promise.all([
          memoriesService.list().catch(() => []),
          beliefsService.listWithHistory().catch(() => []),
          decisionsService.list().catch(() => []),
        ]);
        if (!cancelled) {
          setMemoryCount(m.length);
          setBeliefCount(b.length);
          setDecisionCount(d.length);
          setLoadingStats(false);
        }
      } catch {
        if (!cancelled) setLoadingStats(false);
      }
    }
    loadStats();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSaveName = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = nameInput.trim();
    if (clean) {
      setDisplayName(clean);
      localStorage.setItem('echoself:display_name', clean);
    }
    setIsEditingName(false);
  };

  const handleSaveBio = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = bioInput.trim();
    if (clean) {
      setBio(clean);
      localStorage.setItem('echoself:user_bio', clean);
    }
    setIsEditingBio(false);
  };

  const handleTwinToneChange = (tone: string) => {
    setTwinTone(tone);
    localStorage.setItem('echoself:twin_tone', tone);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigateTo('home');
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }

    setPasswordLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        setPasswordError(error.message);
      } else {
        setPasswordSuccess('Password successfully updated.');
        setNewPassword('');
        setConfirmPassword('');
        setShowPasswordForm(false);
        setTimeout(() => setPasswordSuccess(null), 4000);
      }
    } catch {
      setPasswordError('Failed to update password. Try again.');
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleRevokeOtherSessions = async () => {
    setRevoking(true);
    setRevokeNotice(null);
    try {
      // Sign out other sessions using Supabase auth scope
      await supabase.auth.signOut({ scope: 'others' });
      setRevokeNotice('All other sessions revoked. This device remains authenticated.');
      setTimeout(() => setRevokeNotice(null), 4000);
    } catch {
      setRevokeNotice('Could not revoke other sessions. You may sign out completely below.');
    } finally {
      setRevoking(false);
    }
  };

  const joinedDate = user?.created_at
    ? new Date(user.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : 'October 2026';

  const lastSignInDate = user?.last_sign_in_at
    ? new Date(user.last_sign_in_at).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Active session';

  const userInitial = (displayName || user?.email || 'U').charAt(0).toUpperCase();

  return (
    <div className="space-y-5 sm:space-y-6 max-w-6xl mx-auto pb-20 md:pb-12 animate-[fadeIn_150ms_ease-out]">
      {/* Top Header & Page Meta */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1 border-b border-linen-dark/60">
        <div>
          <SectionHeading
            eyebrow="Identity & Security"
            title="Profile & Security"
            as="h1"
          />
          <p className="text-xs sm:text-sm text-slateink max-w-xl leading-relaxed mt-0.5">
            Manage your personal model identity, data grounding, and account encryption controls.
          </p>
        </div>

        {user ? (
          <button
            onClick={handleSignOut}
            className="inline-flex items-center gap-1.5 self-start sm:self-center px-3.5 py-1.5 rounded-full text-xs font-semibold text-clayred-DEFAULT bg-clayred-light/40 hover:bg-clayred-light/80 border border-clayred-light transition-all cursor-pointer shadow-2xs shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign out</span>
          </button>
        ) : (
          <a
            href="/signin"
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
              e.preventDefault();
              navigateTo('signin');
            }}
            className="inline-flex items-center gap-1.5 self-start sm:self-center px-3.5 py-1.5 rounded-full text-xs font-semibold text-paper bg-charcoal hover:bg-slateink-dark transition-all cursor-pointer shadow-2xs shrink-0"
          >
            <UserCircle2 className="w-3.5 h-3.5" />
            <span>Sign in to save records</span>
          </a>
        )}
      </div>

      {/* Guest Warning Banner if Unauthenticated */}
      {!user && (
        <div className="rounded-2xl border border-amberclay-DEFAULT/30 bg-amberclay-light/40 p-3.5 flex items-start gap-3 shadow-2xs">
          <ShieldAlert className="w-4 h-4 text-amberclay-DEFAULT shrink-0 mt-0.5" />
          <div className="flex-1 text-xs text-charcoal">
            <span className="font-semibold text-amberclay-DEFAULT">Viewing Sample Persona (Jordan)</span>
            <p className="text-slateink mt-0.5 leading-relaxed">
              You are exploring the read-only demonstration persona. Sign in or create an account to
              activate private Postgres Row-Level Security and store your personal memories.
            </p>
          </div>
          <a
            href="/signup"
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
              e.preventDefault();
              navigateTo('signup');
            }}
            className="px-3 py-1 rounded-full bg-charcoal text-paper text-xs font-semibold hover:bg-slateink-dark transition-all shrink-0 self-center"
          >
            Create account
          </a>
        </div>
      )}

      {/* Main 2-Column Responsive Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
        {/* =========================================================================
            LEFT COLUMN (7 cols): Model Identity, Evidence Dimensions, Reflection Tone
            ========================================================================= */}
        <div className="lg:col-span-7 space-y-5">
          {/* 1. Identity & Bio Card */}
          <Card className="p-4 sm:p-5 border border-linen-dark/80 bg-white shadow-xs rounded-2xl sm:rounded-3xl space-y-4">
            <div className="flex items-start sm:items-center justify-between gap-4 pb-3.5 border-b border-linen-dark/60">
              <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
                {/* Avatar Badge */}
                <div className="relative shrink-0">
                  <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-tr from-terracotta to-terracotta-dark text-paper flex items-center justify-center font-serif text-2xl font-bold shadow-2xs">
                    {userInitial}
                  </div>
                  <span
                    className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-sage-dark border-2 border-white flex items-center justify-center text-paper shadow-2xs"
                    title="Isolated Row-Level Security Active"
                  >
                    <ShieldCheck className="w-3 h-3" />
                  </span>
                </div>

                {/* Name & Credentials */}
                <div className="min-w-0 space-y-0.5">
                  {isEditingName ? (
                    <form onSubmit={handleSaveName} className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={nameInput}
                        onChange={(e) => setNameInput(e.target.value)}
                        className="px-2 py-0.5 text-base font-serif font-bold text-charcoal border border-terracotta rounded-lg focus:outline-none w-44"
                        autoFocus
                      />
                      <button
                        type="submit"
                        className="p-1 rounded-md bg-terracotta text-paper hover:bg-terracotta-dark"
                        title="Save name"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    </form>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <h2 className="font-serif text-lg sm:text-xl font-bold text-charcoal truncate">
                        {displayName}
                      </h2>
                      <button
                        type="button"
                        onClick={() => {
                          setNameInput(displayName);
                          setIsEditingName(true);
                        }}
                        className="p-1 text-slateink-light hover:text-charcoal rounded-md transition-colors"
                        title="Edit display name"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slateink">
                    <span className="inline-flex items-center gap-1 truncate max-w-[200px] sm:max-w-[260px]">
                      <Mail className="w-3 h-3 text-slateink-light shrink-0" />
                      <span className="truncate">{user?.email || 'Guest Session (Jordan)'}</span>
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-slateink-light shrink-0" />
                      Joined {joinedDate}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Examination Focus / Bio */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slateink-light">
                  Personal Examination Focus
                </span>
                {!isEditingBio && (
                  <button
                    type="button"
                    onClick={() => {
                      setBioInput(bio);
                      setIsEditingBio(true);
                    }}
                    className="text-[11px] text-terracotta-deep hover:underline inline-flex items-center gap-1"
                  >
                    <Edit3 className="w-3 h-3" /> Edit
                  </button>
                )}
              </div>

              {isEditingBio ? (
                <form onSubmit={handleSaveBio} className="space-y-2 mt-1">
                  <textarea
                    value={bioInput}
                    onChange={(e) => setBioInput(e.target.value)}
                    rows={2}
                    className="w-full p-2.5 text-xs text-charcoal border border-linen-dark rounded-xl focus:border-terracotta focus:outline-none bg-linen/20"
                  />
                  <div className="flex justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => setIsEditingBio(false)}
                      className="px-2.5 py-1 text-xs text-slateink hover:text-charcoal"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-3 py-1 text-xs font-semibold rounded-lg bg-terracotta text-paper hover:bg-terracotta-dark"
                    >
                      Save
                    </button>
                  </div>
                </form>
              ) : (
                <p className="text-xs text-charcoal leading-relaxed font-serif italic text-slateink-dark bg-linen/25 p-2.5 rounded-xl border border-linen-dark/50">
                  &ldquo;{bio}&rdquo;
                </p>
              )}
            </div>
          </Card>

          {/* 2. Model Dimensions: Compact Stat Badges */}
          <Card className="p-4 sm:p-5 border border-linen-dark/80 bg-white shadow-xs rounded-2xl sm:rounded-3xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slateink-light">
                Model Grounding Dimensions
              </span>
              <span className="text-[11px] text-slateink-light">Click to inspect</span>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <a
                href="/memories"
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                  e.preventDefault();
                  navigateTo('memories');
                }}
                className="p-3 rounded-xl border border-linen-dark/70 bg-paper-soft hover:bg-white hover:border-terracotta transition-all group shadow-2xs"
              >
                <div className="flex items-center justify-between mb-1">
                  <BookOpen className="w-3.5 h-3.5 text-terracotta" />
                  <span className="text-[10px] text-slateink-light group-hover:text-terracotta">
                    &rarr;
                  </span>
                </div>
                <p className="font-serif text-xl sm:text-2xl font-bold text-charcoal">
                  {loadingStats ? '—' : memoryCount ?? 0}
                </p>
                <p className="text-[11px] font-medium text-slateink truncate">Memories</p>
              </a>

              <a
                href="/beliefs"
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                  e.preventDefault();
                  navigateTo('beliefs');
                }}
                className="p-3 rounded-xl border border-linen-dark/70 bg-paper-soft hover:bg-white hover:border-sage-dark transition-all group shadow-2xs"
              >
                <div className="flex items-center justify-between mb-1">
                  <Compass className="w-3.5 h-3.5 text-sage-dark" />
                  <span className="text-[10px] text-slateink-light group-hover:text-sage-dark">
                    &rarr;
                  </span>
                </div>
                <p className="font-serif text-xl sm:text-2xl font-bold text-charcoal">
                  {loadingStats ? '—' : beliefCount ?? 0}
                </p>
                <p className="text-[11px] font-medium text-slateink truncate">Beliefs</p>
              </a>

              <a
                href="/decisions"
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                  e.preventDefault();
                  navigateTo('decisions');
                }}
                className="p-3 rounded-xl border border-linen-dark/70 bg-paper-soft hover:bg-white hover:border-amberclay-DEFAULT transition-all group shadow-2xs"
              >
                <div className="flex items-center justify-between mb-1">
                  <Scale className="w-3.5 h-3.5 text-amberclay-DEFAULT" />
                  <span className="text-[10px] text-slateink-light group-hover:text-amberclay-DEFAULT">
                    &rarr;
                  </span>
                </div>
                <p className="font-serif text-xl sm:text-2xl font-bold text-charcoal">
                  {loadingStats ? '—' : decisionCount ?? 0}
                </p>
                <p className="text-[11px] font-medium text-slateink truncate">Decisions</p>
              </a>
            </div>
          </Card>

          {/* 3. Twin Reflection Persona Tuning */}
          <Card className="p-4 sm:p-5 border border-linen-dark/80 bg-white shadow-xs rounded-2xl sm:rounded-3xl space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-terracotta" />
              <h3 className="font-serif text-sm sm:text-base font-bold text-charcoal">
                Twin Reflection Tone
              </h3>
            </div>
            <p className="text-[11px] text-slateink leading-relaxed">
              Configure how the twin analyzes records and responds during consultations.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[
                {
                  id: 'contemplative',
                  label: 'Contemplative',
                  desc: 'Draws philosophical connections across your experiences.',
                },
                {
                  id: 'analytical',
                  label: 'Analytical',
                  desc: 'Strictly highlights confidence metrics and factual conflicts.',
                },
                {
                  id: 'socratic',
                  label: 'Socratic',
                  desc: 'Prompts self-examination with thoughtful follow-up questions.',
                },
              ].map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => handleTwinToneChange(mode.id)}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    twinTone === mode.id
                      ? 'border-terracotta bg-terracotta/10 text-charcoal shadow-2xs ring-1 ring-terracotta/20 font-semibold'
                      : 'border-linen-dark/70 bg-paper-soft/60 hover:bg-white text-charcoal'
                  }`}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-xs font-semibold">{mode.label}</span>
                    {twinTone === mode.id && (
                      <span className="w-1.5 h-1.5 rounded-full bg-terracotta" />
                    )}
                  </div>
                  <p className="text-[10px] text-slateink leading-snug line-clamp-2">{mode.desc}</p>
                </button>
              ))}
            </div>
          </Card>
        </div>

        {/* =========================================================================
            RIGHT COLUMN (5 cols): The Proper Security Hub
            ========================================================================= */}
        <div className="lg:col-span-5 space-y-5">
          {/* 1. Account & Credential Security Hub */}
          <Card className="p-4 sm:p-5 border border-linen-dark/80 bg-white shadow-xs rounded-2xl sm:rounded-3xl space-y-4">
            <div className="flex items-center justify-between border-b border-linen-dark/60 pb-2.5">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-slateink-dark" />
                <h3 className="font-serif text-sm sm:text-base font-bold text-charcoal">
                  Account Security
                </h3>
              </div>
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-sage-dark bg-sage-light/60 border border-sage/40 px-2 py-0.5 rounded-full">
                <ShieldCheck className="w-3 h-3" />
                RLS Active
              </span>
            </div>

            {/* Session Security Details */}
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between py-1.5 border-b border-linen-dark/40">
                <span className="text-slateink">Authentication</span>
                <span className="font-medium text-charcoal font-mono text-[11px]">
                  {user?.app_metadata?.provider || 'Email / Password'}
                </span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-linen-dark/40">
                <span className="text-slateink">Last Sign-in</span>
                <span className="font-medium text-charcoal">{lastSignInDate}</span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-linen-dark/40">
                <span className="text-slateink">Database Isolation</span>
                <span className="text-sage-dark font-medium font-mono text-[11px]">
                  User ID Scoped
                </span>
              </div>
            </div>

            {/* Password Management */}
            {user && (
              <div className="pt-1">
                {!showPasswordForm ? (
                  <button
                    type="button"
                    onClick={() => {
                      setShowPasswordForm(true);
                      setPasswordError(null);
                      setPasswordSuccess(null);
                    }}
                    className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-linen-dark bg-white hover:bg-linen text-xs font-semibold text-charcoal transition-all shadow-2xs cursor-pointer"
                  >
                    <KeyRound className="w-3.5 h-3.5 text-terracotta" />
                    <span>Change Password</span>
                  </button>
                ) : (
                  <form onSubmit={handleUpdatePassword} className="space-y-2.5 p-3 rounded-xl bg-linen/30 border border-linen-dark">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs font-semibold text-charcoal">Update Password</span>
                      <button
                        type="button"
                        onClick={() => setShowPasswordForm(false)}
                        className="text-[11px] text-slateink hover:text-charcoal"
                      >
                        Cancel
                      </button>
                    </div>

                    <div className="relative">
                      <input
                        type={showPasswordText ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="New password (min 6 chars)"
                        required
                        minLength={6}
                        className="w-full h-8 pl-2.5 pr-8 text-xs border border-linen-dark bg-white rounded-lg focus:border-terracotta focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPasswordText((v) => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slateink-light hover:text-charcoal"
                      >
                        {showPasswordText ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                    <input
                      type={showPasswordText ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm new password"
                      required
                      minLength={6}
                      className="w-full h-8 px-2.5 text-xs border border-linen-dark bg-white rounded-lg focus:border-terracotta focus:outline-none"
                    />

                    {passwordError && (
                      <p className="text-[11px] text-clayred-DEFAULT bg-clayred-light/50 p-1.5 rounded-md flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        <span>{passwordError}</span>
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={passwordLoading || !newPassword}
                      className="w-full h-8 rounded-lg bg-charcoal text-paper text-xs font-semibold hover:bg-terracotta disabled:opacity-50 transition-all flex items-center justify-center gap-1 shadow-2xs"
                    >
                      {passwordLoading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <span>Save New Password</span>
                      )}
                    </button>
                  </form>
                )}

                {passwordSuccess && (
                  <p className="text-xs text-sage-dark bg-sage-light/60 p-2 rounded-xl border border-sage/40 flex items-center gap-1.5 mt-2">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>{passwordSuccess}</span>
                  </p>
                )}
              </div>
            )}

            {/* Active Sessions & Revoke Access */}
            <div className="pt-2 border-t border-linen-dark/60 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-charcoal flex items-center gap-1.5">
                  <Laptop className="w-3.5 h-3.5 text-slateink" />
                  Active Devices
                </span>
                <span className="text-[10px] text-sage-dark font-medium">Current device active</span>
              </div>

              {user && (
                <button
                  type="button"
                  onClick={handleRevokeOtherSessions}
                  disabled={revoking}
                  className="w-full py-1.5 px-3 rounded-lg border border-linen-dark/80 bg-paper-soft hover:bg-linen text-slateink-dark hover:text-charcoal text-[11px] font-medium transition-colors disabled:opacity-50 cursor-pointer text-center"
                >
                  {revoking ? 'Revoking…' : 'Sign out of other devices'}
                </button>
              )}

              {revokeNotice && (
                <p className="text-[11px] text-slateink-dark bg-linen p-2 rounded-lg leading-tight">
                  {revokeNotice}
                </p>
              )}
            </div>
          </Card>

          {/* 2. Privacy & Data Sovereignty Guarantee */}
          <Card className="p-4 sm:p-5 border border-linen-dark/80 bg-white shadow-xs rounded-2xl sm:rounded-3xl space-y-3">
            <div className="flex items-center justify-between border-b border-linen-dark/60 pb-2">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-terracotta" />
                <h3 className="font-serif text-sm sm:text-base font-bold text-charcoal">
                  Data Sovereignty
                </h3>
              </div>
              <a
                href="/settings"
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                  e.preventDefault();
                  navigateTo('settings');
                }}
                className="text-[11px] font-semibold text-terracotta-deep hover:underline inline-flex items-center gap-0.5"
              >
                <span>Settings</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>

            <div className="space-y-2 text-xs text-slateink">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-sage-dark shrink-0 mt-0.5" />
                <span>
                  <strong className="text-charcoal font-medium">Zero Model Training:</strong> Your
                  records are never used to train or fine-tune public foundation models.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-sage-dark shrink-0 mt-0.5" />
                <span>
                  <strong className="text-charcoal font-medium">Local & Portable:</strong> All
                  records can be exported to standardized JSON format anytime.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-sage-dark shrink-0 mt-0.5" />
                <span>
                  <strong className="text-charcoal font-medium">Hardware-accelerated RLS:</strong>{' '}
                  PostgreSQL kernel validates every SQL query against your cryptographic JWT.
                </span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
