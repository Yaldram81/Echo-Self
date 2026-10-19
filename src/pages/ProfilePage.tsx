import { useState, useEffect } from 'react';
import {
  User,
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
  KeyRound,
  Laptop,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  X,
  Eye,
  EyeOff,
  Sliders,
  MessageSquare,
  Clock,
  Shield,
} from 'lucide-react';
import { useAuth } from '@/lib/useAuth';
import { supabase } from '@/lib/supabaseClient';
import { memoriesService, beliefsService, decisionsService, profilesService } from '@/lib/services';
import { navigateTo } from '@/lib/router';
import { SectionHeading, Card } from '@/components/ui';

interface ProfileData {
  displayName: string;
  preferredName: string;
  bio: string;
  avatarColor: string;
  twinTone: 'contemplative' | 'analytical' | 'socratic';
  responseStyle: 'concise' | 'balanced' | 'detailed';
  twinContext: string;
  dateFormat: 'relative' | 'standard';
  groundingLevel: 'strict' | 'exploratory';
}

const AVATAR_PALETTES = [
  { id: 'terracotta', name: 'Terracotta', bg: 'bg-[#B85D3B]', text: 'text-white' },
  { id: 'sage', name: 'Sage', bg: 'bg-[#4F6D54]', text: 'text-white' },
  { id: 'slate', name: 'Slate', bg: 'bg-[#3B4D5B]', text: 'text-white' },
  { id: 'amber', name: 'Amber', bg: 'bg-[#9C6237]', text: 'text-white' },
  { id: 'charcoal', name: 'Charcoal', bg: 'bg-[#222423]', text: 'text-white' },
];

export function ProfilePage() {
  const { user, session } = useAuth();

  // Grounding statistics from active database
  const [memoryCount, setMemoryCount] = useState<number | null>(null);
  const [beliefCount, setBeliefCount] = useState<number | null>(null);
  const [decisionCount, setDecisionCount] = useState<number | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  // Canonical Profile State (Synced from Supabase Auth metadata or localStorage)
  const [profile, setProfile] = useState<ProfileData>(() => {
    const meta = user?.user_metadata || {};
    return {
      displayName:
        meta.display_name ||
        localStorage.getItem('echoself:display_name') ||
        (user?.email ? user.email.split('@')[0] : 'Reflective Thinker'),
      preferredName:
        meta.preferred_name ||
        localStorage.getItem('echoself:preferred_name') ||
        '',
      bio:
        meta.bio ||
        localStorage.getItem('echoself:user_bio') ||
        'Examining life through evidence, recorded experiences, and deliberate choices.',
      avatarColor:
        meta.avatar_color ||
        localStorage.getItem('echoself:avatar_color') ||
        'terracotta',
      twinTone:
        (meta.twin_tone as ProfileData['twinTone']) ||
        (localStorage.getItem('echoself:twin_tone') as ProfileData['twinTone']) ||
        'contemplative',
      responseStyle:
        (meta.response_style as ProfileData['responseStyle']) ||
        (localStorage.getItem('echoself:response_style') as ProfileData['responseStyle']) ||
        'balanced',
      twinContext:
        meta.twin_context ||
        localStorage.getItem('echoself:twin_context') ||
        '',
      dateFormat:
        (meta.date_format as ProfileData['dateFormat']) ||
        (localStorage.getItem('echoself:date_format') as ProfileData['dateFormat']) ||
        'relative',
      groundingLevel:
        (meta.grounding_level as ProfileData['groundingLevel']) ||
        (localStorage.getItem('echoself:grounding_level') as ProfileData['groundingLevel']) ||
        'strict',
    };
  });

  // Edit Mode for Identity & Personal Information
  const [isEditingIdentity, setIsEditingIdentity] = useState(false);
  const [formName, setFormName] = useState(profile.displayName);
  const [formPreferredName, setFormPreferredName] = useState(profile.preferredName);
  const [formBio, setFormBio] = useState(profile.bio);
  const [formAvatarColor, setFormAvatarColor] = useState(profile.avatarColor);
  const [savingIdentity, setSavingIdentity] = useState(false);
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [identitySuccess, setIdentitySuccess] = useState<string | null>(null);

  // Edit Mode for Twin Personal Context
  const [isEditingContext, setIsEditingContext] = useState(false);
  const [formTwinContext, setFormTwinContext] = useState(profile.twinContext);
  const [savingContext, setSavingContext] = useState(false);
  const [contextSuccess, setContextSuccess] = useState<string | null>(null);

  // Password Management State
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswordText, setShowPasswordText] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Session Revocation State
  const [revoking, setRevoking] = useState(false);
  const [revokeNotice, setRevokeNotice] = useState<string | null>(null);

  // Load grounding records
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
  }, [user?.id]);

  // Sync state whenever auth user changes or load from database profiles table
  useEffect(() => {
    let cancelled = false;
    if (user?.id) {
      profilesService.get(user.id).then((dbProfile) => {
        if (!cancelled && dbProfile) {
          setProfile((prev) => ({
            ...prev,
            displayName: dbProfile.display_name || prev.displayName,
            preferredName: dbProfile.preferred_name || prev.preferredName,
            bio: dbProfile.bio || prev.bio,
            avatarColor: dbProfile.avatar_color || prev.avatarColor,
            twinTone: (dbProfile.twin_tone as ProfileData['twinTone']) || prev.twinTone,
            responseStyle: (dbProfile.response_style as ProfileData['responseStyle']) || prev.responseStyle,
            twinContext: dbProfile.twin_context || prev.twinContext,
            dateFormat: (dbProfile.date_format as ProfileData['dateFormat']) || prev.dateFormat,
            groundingLevel: (dbProfile.grounding_level as ProfileData['groundingLevel']) || prev.groundingLevel,
          }));
        }
      });
    }

    if (user?.user_metadata) {
      const meta = user.user_metadata;
      setProfile((prev) => ({
        ...prev,
        displayName: meta.display_name ?? prev.displayName,
        preferredName: meta.preferred_name ?? prev.preferredName,
        bio: meta.bio ?? prev.bio,
        avatarColor: meta.avatar_color ?? prev.avatarColor,
        twinTone: meta.twin_tone ?? prev.twinTone,
        responseStyle: meta.response_style ?? prev.responseStyle,
        twinContext: meta.twin_context ?? prev.twinContext,
        dateFormat: meta.date_format ?? prev.dateFormat,
        groundingLevel: meta.grounding_level ?? prev.groundingLevel,
      }));
    }

    return () => {
      cancelled = true;
    };
  }, [user]);

  // Helper to persist updates to database profiles table, Supabase Auth metadata, and localStorage
  const persistMetadata = async (updates: Partial<ProfileData>) => {
    // 1. Mirror immediately to localStorage for fast local recall and demo personas
    if (updates.displayName !== undefined) localStorage.setItem('echoself:display_name', updates.displayName);
    if (updates.preferredName !== undefined) localStorage.setItem('echoself:preferred_name', updates.preferredName);
    if (updates.bio !== undefined) localStorage.setItem('echoself:user_bio', updates.bio);
    if (updates.avatarColor !== undefined) localStorage.setItem('echoself:avatar_color', updates.avatarColor);
    if (updates.twinTone !== undefined) localStorage.setItem('echoself:twin_tone', updates.twinTone);
    if (updates.responseStyle !== undefined) localStorage.setItem('echoself:response_style', updates.responseStyle);
    if (updates.twinContext !== undefined) localStorage.setItem('echoself:twin_context', updates.twinContext);
    if (updates.dateFormat !== undefined) localStorage.setItem('echoself:date_format', updates.dateFormat);
    if (updates.groundingLevel !== undefined) localStorage.setItem('echoself:grounding_level', updates.groundingLevel);

    // 2. If authenticated, persist to database profiles table and Supabase Auth metadata
    if (user) {
      void profilesService.upsert({
        id: user.id,
        display_name: updates.displayName,
        preferred_name: updates.preferredName,
        bio: updates.bio,
        avatar_color: updates.avatarColor,
        twin_tone: updates.twinTone,
        response_style: updates.responseStyle,
        twin_context: updates.twinContext,
        date_format: updates.dateFormat,
        grounding_level: updates.groundingLevel,
      });

      const payload: Record<string, unknown> = {};
      if (updates.displayName !== undefined) payload.display_name = updates.displayName;
      if (updates.preferredName !== undefined) payload.preferred_name = updates.preferredName;
      if (updates.bio !== undefined) payload.bio = updates.bio;
      if (updates.avatarColor !== undefined) payload.avatar_color = updates.avatarColor;
      if (updates.twinTone !== undefined) payload.twin_tone = updates.twinTone;
      if (updates.responseStyle !== undefined) payload.response_style = updates.responseStyle;
      if (updates.twinContext !== undefined) payload.twin_context = updates.twinContext;
      if (updates.dateFormat !== undefined) payload.date_format = updates.dateFormat;
      if (updates.groundingLevel !== undefined) payload.grounding_level = updates.groundingLevel;

      const { error } = await supabase.auth.updateUser({ data: payload });
      if (error) throw error;
    }

    setProfile((prev) => ({ ...prev, ...updates }));
  };

  // Save Identity Form
  const handleSaveIdentity = async (e: React.FormEvent) => {
    e.preventDefault();
    setIdentityError(null);
    setIdentitySuccess(null);

    const cleanName = formName.trim();
    const cleanPreferred = formPreferredName.trim();
    const cleanBio = formBio.trim();

    if (!cleanName) {
      setIdentityError('Display name is required.');
      return;
    }
    if (cleanName.length > 50) {
      setIdentityError('Display name must be 50 characters or fewer.');
      return;
    }
    if (cleanPreferred.length > 50) {
      setIdentityError('Preferred address must be 50 characters or fewer.');
      return;
    }
    if (cleanBio.length > 300) {
      setIdentityError('Personal focus must be 300 characters or fewer.');
      return;
    }

    setSavingIdentity(true);
    try {
      await persistMetadata({
        displayName: cleanName,
        preferredName: cleanPreferred,
        bio: cleanBio,
        avatarColor: formAvatarColor,
      });
      setIsEditingIdentity(false);
      setIdentitySuccess('Profile identity saved successfully.');
      setTimeout(() => setIdentitySuccess(null), 3500);
    } catch {
      setIdentityError('Could not save profile changes. Please try again.');
    } finally {
      setSavingIdentity(false);
    }
  };

  // Save Twin Context Form
  const handleSaveContext = async (e: React.FormEvent) => {
    e.preventDefault();
    setContextSuccess(null);
    const clean = formTwinContext.trim();

    setSavingContext(true);
    try {
      await persistMetadata({ twinContext: clean });
      setIsEditingContext(false);
      setContextSuccess('Twin personal context updated.');
      setTimeout(() => setContextSuccess(null), 3500);
    } catch {
      // Gracefully retained
    } finally {
      setSavingContext(false);
    }
  };

  // Preference Changes
  const handleTwinToneChange = async (tone: ProfileData['twinTone']) => {
    await persistMetadata({ twinTone: tone });
  };

  const handleResponseStyleChange = async (style: ProfileData['responseStyle']) => {
    await persistMetadata({ responseStyle: style });
  };

  const handleDateFormatChange = async (fmt: ProfileData['dateFormat']) => {
    await persistMetadata({ dateFormat: fmt });
  };

  const handleGroundingLevelChange = async (level: ProfileData['groundingLevel']) => {
    await persistMetadata({ groundingLevel: level });
  };

  // Password Management
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

  // Revoke other active sessions
  const handleRevokeOtherSessions = async () => {
    setRevoking(true);
    setRevokeNotice(null);
    try {
      await supabase.auth.signOut({ scope: 'others' });
      setRevokeNotice('All other sessions revoked. This device remains authenticated.');
      setTimeout(() => setRevokeNotice(null), 4000);
    } catch {
      setRevokeNotice('Could not revoke other sessions. You may sign out completely below.');
    } finally {
      setRevoking(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigateTo('home');
  };

  // Display initial & theme tint
  const userInitial = (profile.displayName || user?.email || 'U').charAt(0).toUpperCase();
  const activePalette = AVATAR_PALETTES.find((p) => p.id === profile.avatarColor) ?? AVATAR_PALETTES[0];

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

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-24 md:pb-16 animate-[fadeIn_150ms_ease-out]">
      {/* =========================================================================
          PAGE HEADER: Title, Description, and Account Actions
          ========================================================================= */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-linen-dark/70">
        <div>
          <SectionHeading
            eyebrow="Identity & Personalization"
            title="Your profile"
            as="h1"
          />
          <p className="text-xs sm:text-sm text-slateink max-w-xl leading-relaxed mt-0.5">
            Manage your identity and how EchoSelf works with you.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
          {user ? (
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold text-clayred-DEFAULT bg-clayred-light/40 hover:bg-clayred-light/80 border border-clayred-light transition-all cursor-pointer shadow-2xs"
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
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold text-paper bg-charcoal hover:bg-slateink-dark transition-all cursor-pointer shadow-2xs"
            >
              <User className="w-3.5 h-3.5" />
              <span>Sign in to save records</span>
            </a>
          )}
        </div>
      </header>

      {/* Guest Warning Banner if Unauthenticated */}
      {!user && (
        <div className="rounded-2xl border border-amberclay-DEFAULT/30 bg-amberclay-light/40 p-3.5 flex items-start gap-3 shadow-2xs">
          <ShieldAlert className="w-4 h-4 text-amberclay-DEFAULT shrink-0 mt-0.5" />
          <div className="flex-1 text-xs text-charcoal">
            <span className="font-semibold text-amberclay-DEFAULT">Viewing Sample Persona (Jordan)</span>
            <p className="text-slateink mt-0.5 leading-relaxed">
              You are exploring the demonstration persona. Any edits made here are stored locally in your browser.
              Sign in or create an account to activate private Postgres Row-Level Security.
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

      {/* Success Notices */}
      {identitySuccess && (
        <div className="rounded-xl border border-sage/40 bg-sage-light/60 p-3 text-xs text-sage-dark flex items-center gap-2 animate-[fadeIn_150ms_ease-out]">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{identitySuccess}</span>
        </div>
      )}

      {/* =========================================================================
          SECTION A & B: PROFILE IDENTITY & PERSONAL INFORMATION
          ========================================================================= */}
      <Card className="p-4 sm:p-6 border border-linen-dark/80 bg-white shadow-xs rounded-2xl sm:rounded-3xl space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
            {/* Restrained Avatar with Initials */}
            <div className="relative shrink-0">
              <div
                className={`w-13 h-13 sm:w-14 sm:h-14 rounded-2xl ${activePalette.bg} ${activePalette.text} flex items-center justify-center font-serif text-2xl font-bold shadow-2xs transition-colors`}
              >
                {userInitial}
              </div>
              <span
                className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-sage-dark border-2 border-white flex items-center justify-center text-paper shadow-2xs"
                title={user ? 'Row-Level Security Active' : 'Local Persona Active'}
              >
                <ShieldCheck className="w-3 h-3" />
              </span>
            </div>

            {/* Display Info */}
            <div className="min-w-0 space-y-0.5">
              <div className="flex items-center gap-2">
                <h2 className="font-serif text-lg sm:text-xl font-bold text-charcoal truncate">
                  {profile.displayName}
                </h2>
                {profile.preferredName && (
                  <span className="text-[11px] px-2 py-0.5 rounded-md bg-linen text-slateink font-medium">
                    Calls you &ldquo;{profile.preferredName}&rdquo;
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slateink">
                <span className="inline-flex items-center gap-1 truncate max-w-[200px] sm:max-w-[260px]">
                  <Mail className="w-3 h-3 text-slateink-light shrink-0" />
                  <span className="truncate">{user?.email || 'Guest Persona (Jordan)'}</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-slateink-light shrink-0" />
                  Joined {joinedDate}
                </span>
                <span className="inline-flex items-center gap-1 font-mono text-[10px] text-sage-dark bg-sage-light/40 px-1.5 py-0.2 rounded">
                  {user ? 'Private RLS Active' : 'Demo Workspace'}
                </span>
              </div>
            </div>
          </div>

          {!isEditingIdentity && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('echoself:launch_onboarding'));
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-linen-dark bg-paper-soft hover:bg-white text-xs font-semibold text-charcoal transition-all cursor-pointer shadow-2xs shrink-0"
                title="Revisit the first-run onboarding and product walkthrough"
              >
                <Compass className="w-3.5 h-3.5 text-terracotta" />
                <span className="hidden sm:inline">Walkthrough</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setFormName(profile.displayName);
                  setFormPreferredName(profile.preferredName);
                  setFormBio(profile.bio);
                  setFormAvatarColor(profile.avatarColor);
                  setIsEditingIdentity(true);
                  setIdentityError(null);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-linen-dark bg-paper-soft hover:bg-white text-xs font-semibold text-charcoal transition-all cursor-pointer shadow-2xs shrink-0"
              >
                <Edit3 className="w-3.5 h-3.5 text-terracotta" />
                <span>Edit profile</span>
              </button>
            </div>
          )}
        </div>

        {/* Identity Edit Form vs Summary */}
        {isEditingIdentity ? (
          <form onSubmit={handleSaveIdentity} className="pt-2 border-t border-linen-dark/60 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-charcoal mb-1">
                  Display name <span className="text-terracotta">*</span>
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  maxLength={50}
                  required
                  placeholder="e.g. Jordan Miller"
                  className="w-full px-3 py-2 text-xs border border-linen-dark rounded-xl bg-white focus:border-terracotta focus:outline-none"
                />
                <span className="text-[10px] text-slateink-light">Identifies your profile in the workspace.</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-charcoal mb-1">
                  Preferred name / Nickname <span className="text-slateink-light font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={formPreferredName}
                  onChange={(e) => setFormPreferredName(e.target.value)}
                  maxLength={50}
                  placeholder="e.g. Jordan"
                  className="w-full px-3 py-2 text-xs border border-linen-dark rounded-xl bg-white focus:border-terracotta focus:outline-none"
                />
                <span className="text-[10px] text-slateink-light">Used in conversational greetings by your Twin.</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-charcoal mb-1">
                Personal examination focus / Bio <span className="text-slateink-light font-normal">(Optional)</span>
              </label>
              <textarea
                value={formBio}
                onChange={(e) => setFormBio(e.target.value)}
                maxLength={300}
                rows={2}
                placeholder="What is your current philosophical focus or purpose for examining life?"
                className="w-full p-2.5 text-xs text-charcoal border border-linen-dark rounded-xl focus:border-terracotta focus:outline-none bg-white"
              />
              <span className="text-[10px] text-slateink-light">Understated reflection motto on your profile.</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-charcoal mb-1.5">
                Avatar Palette Tint
              </label>
              <div className="flex items-center gap-2">
                {AVATAR_PALETTES.map((palette) => (
                  <button
                    key={palette.id}
                    type="button"
                    onClick={() => setFormAvatarColor(palette.id)}
                    className={`w-7 h-7 rounded-full ${palette.bg} flex items-center justify-center transition-all cursor-pointer ${
                      formAvatarColor === palette.id
                        ? 'ring-2 ring-offset-2 ring-terracotta scale-110 shadow-xs'
                        : 'opacity-70 hover:opacity-100'
                    }`}
                    title={palette.name}
                    aria-label={`Select ${palette.name} avatar color`}
                  >
                    {formAvatarColor === palette.id && <Check className="w-3.5 h-3.5 text-white" />}
                  </button>
                ))}
              </div>
            </div>

            {identityError && (
              <p className="text-xs text-clayred-DEFAULT bg-clayred-light/50 p-2 rounded-xl flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>{identityError}</span>
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-linen-dark/40">
              <button
                type="button"
                onClick={() => setIsEditingIdentity(false)}
                disabled={savingIdentity}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slateink hover:text-charcoal cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingIdentity}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-terracotta text-paper text-xs font-semibold hover:bg-terracotta-dark disabled:opacity-50 transition-all cursor-pointer shadow-2xs"
              >
                {savingIdentity ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>Save changes</span>
              </button>
            </div>
          </form>
        ) : (
          <div className="pt-2 border-t border-linen-dark/60">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slateink-light">
              Personal Examination Focus
            </span>
            <p className="text-xs text-charcoal leading-relaxed font-serif italic text-slateink-dark bg-linen/25 p-3 rounded-xl border border-linen-dark/50 mt-1">
              &ldquo;{profile.bio}&rdquo;
            </p>
          </div>
        )}
      </Card>

      {/* =========================================================================
          SECTION C: HOW ECHOSELF ADDRESSES YOU (Personalization Settings)
          ========================================================================= */}
      <Card className="p-4 sm:p-6 border border-linen-dark/80 bg-white shadow-xs rounded-2xl sm:rounded-3xl space-y-4">
        <div className="flex items-center gap-2 border-b border-linen-dark/60 pb-2.5">
          <Sparkles className="w-4 h-4 text-terracotta" />
          <h2 className="font-serif text-sm sm:text-base font-bold text-charcoal">
            How EchoSelf Addresses You
          </h2>
        </div>
        <p className="text-xs text-slateink leading-relaxed">
          Configure the conversational tone and response length that EchoSelf adopts during consultations.
          These preferences are stored in your private account context and directly shape Twin responses.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-1">
          {/* 1. Conversational Reflection Tone */}
          <div className="space-y-2">
            <span className="text-xs font-semibold text-charcoal block">Conversational Reflection Tone</span>
            <div className="space-y-1.5">
              {[
                {
                  id: 'contemplative' as const,
                  title: 'Contemplative',
                  desc: 'Draws philosophical connections across your experiences and values.',
                },
                {
                  id: 'analytical' as const,
                  title: 'Analytical',
                  desc: 'Strictly highlights factual consistency, tensions, and confidence metrics.',
                },
                {
                  id: 'socratic' as const,
                  title: 'Socratic',
                  desc: 'Prompts self-examination with thoughtful, inquiring follow-up questions.',
                },
              ].map((tone) => (
                <button
                  key={tone.id}
                  type="button"
                  onClick={() => handleTwinToneChange(tone.id)}
                  className={`w-full p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    profile.twinTone === tone.id
                      ? 'border-terracotta bg-terracotta/10 text-charcoal shadow-2xs ring-1 ring-terracotta/20 font-semibold'
                      : 'border-linen-dark/70 bg-paper-soft/60 hover:bg-white text-charcoal'
                  }`}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-xs font-semibold">{tone.title}</span>
                    {profile.twinTone === tone.id && <span className="w-2 h-2 rounded-full bg-terracotta" />}
                  </div>
                  <p className="text-[11px] text-slateink leading-snug">{tone.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* 2. Response Length & Style */}
          <div className="space-y-2">
            <span className="text-xs font-semibold text-charcoal block">Response Detail Level</span>
            <div className="space-y-1.5">
              {[
                {
                  id: 'concise' as const,
                  title: 'Concise',
                  desc: 'Delivers high-signal summaries and immediate takeaways without excess words.',
                },
                {
                  id: 'balanced' as const,
                  title: 'Balanced',
                  desc: 'Balanced context, providing grounded reasoning and supporting excerpts.',
                },
                {
                  id: 'detailed' as const,
                  title: 'Detailed & Exploratory',
                  desc: 'Explores nuances, contextual background, and cross-domain associations.',
                },
              ].map((style) => (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => handleResponseStyleChange(style.id)}
                  className={`w-full p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    profile.responseStyle === style.id
                      ? 'border-terracotta bg-terracotta/10 text-charcoal shadow-2xs ring-1 ring-terracotta/20 font-semibold'
                      : 'border-linen-dark/70 bg-paper-soft/60 hover:bg-white text-charcoal'
                  }`}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-xs font-semibold">{style.title}</span>
                    {profile.responseStyle === style.id && <span className="w-2 h-2 rounded-full bg-terracotta" />}
                  </div>
                  <p className="text-[11px] text-slateink leading-snug">{style.desc}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* =========================================================================
          SECTION D: PERSONAL CONTEXT FOR YOUR TWIN
          ========================================================================= */}
      <Card className="p-4 sm:p-6 border border-linen-dark/80 bg-white shadow-xs rounded-2xl sm:rounded-3xl space-y-4">
        <div className="flex items-center justify-between border-b border-linen-dark/60 pb-2.5">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-terracotta" />
            <h2 className="font-serif text-sm sm:text-base font-bold text-charcoal">
              Personal Context for Your Twin
            </h2>
          </div>
          {!isEditingContext && (
            <button
              type="button"
              onClick={() => {
                setFormTwinContext(profile.twinContext);
                setIsEditingContext(true);
              }}
              className="text-xs text-terracotta-deep font-semibold hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>{profile.twinContext ? 'Edit context' : 'Add context'}</span>
            </button>
          )}
        </div>

        {/* Clear Provenance & Privacy Notice */}
        <div className="rounded-xl border border-linen-dark bg-linen/30 p-3 text-xs text-slateink space-y-1">
          <div className="flex items-center gap-1.5 font-semibold text-charcoal">
            <Shield className="w-3.5 h-3.5 text-sage-dark shrink-0" />
            <span>Personal Context Disclaimer</span>
          </div>
          <p className="leading-relaxed">
            Information you add here may be included as context when EchoSelf responds to you. This user-provided
            guidance is kept strictly separate from your recorded memories, beliefs, and decisions, and is never
            treated as independently verified evidence.
          </p>
        </div>

        {contextSuccess && (
          <div className="rounded-xl border border-sage/40 bg-sage-light/60 p-2.5 text-xs text-sage-dark flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{contextSuccess}</span>
          </div>
        )}

        {isEditingContext ? (
          <form onSubmit={handleSaveContext} className="space-y-3 pt-1">
            <textarea
              value={formTwinContext}
              onChange={(e) => setFormTwinContext(e.target.value)}
              rows={3}
              placeholder="e.g. Currently transitioning into engineering leadership; prioritizing intentional focus, family time, and continuous writing."
              className="w-full p-3 text-xs text-charcoal border border-linen-dark rounded-xl focus:border-terracotta focus:outline-none bg-white"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsEditingContext(false)}
                className="px-3 py-1.5 text-xs font-semibold text-slateink hover:text-charcoal cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingContext}
                className="px-3.5 py-1.5 rounded-xl bg-terracotta text-paper text-xs font-semibold hover:bg-terracotta-dark transition-all cursor-pointer shadow-2xs"
              >
                {savingContext ? 'Saving…' : 'Save Context'}
              </button>
            </div>
          </form>
        ) : (
          <div>
            {profile.twinContext ? (
              <p className="text-xs text-charcoal bg-paper-soft p-3 rounded-xl border border-linen-dark/70 leading-relaxed font-sans">
                {profile.twinContext}
              </p>
            ) : (
              <p className="text-xs text-slateink-light italic">
                No personal context provided yet. Click &ldquo;Add context&rdquo; to share priorities or themes your Twin should keep in mind.
              </p>
            )}
          </div>
        )}
      </Card>

      {/* =========================================================================
          SECTION E: ACCOUNT PREFERENCES & GROUNDING DIMENSIONS
          ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
        {/* Left Column (7 cols): Model Grounding & Display Preferences */}
        <div className="lg:col-span-7 space-y-5">
          {/* Grounding Dimensions */}
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
                  <span className="text-[10px] text-slateink-light group-hover:text-terracotta">&rarr;</span>
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
                  <span className="text-[10px] text-slateink-light group-hover:text-sage-dark">&rarr;</span>
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
                  <span className="text-[10px] text-slateink-light group-hover:text-amberclay-DEFAULT">&rarr;</span>
                </div>
                <p className="font-serif text-xl sm:text-2xl font-bold text-charcoal">
                  {loadingStats ? '—' : decisionCount ?? 0}
                </p>
                <p className="text-[11px] font-medium text-slateink truncate">Decisions</p>
              </a>
            </div>
          </Card>

          {/* Account Preferences (Display & Grounding Sensitivity) */}
          <Card className="p-4 sm:p-5 border border-linen-dark/80 bg-white shadow-xs rounded-2xl sm:rounded-3xl space-y-4">
            <div className="flex items-center gap-2 border-b border-linen-dark/60 pb-2">
              <Sliders className="w-4 h-4 text-slateink-dark" />
              <h3 className="font-serif text-sm sm:text-base font-bold text-charcoal">
                Workspace Preferences
              </h3>
            </div>

            <div className="space-y-3">
              {/* Date format */}
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-charcoal block">Date & Timestamp Display</span>
                  <span className="text-[11px] text-slateink">Choose how memory and decision timestamps are formatted.</span>
                </div>
                <div className="flex items-center gap-1 bg-linen p-0.5 rounded-lg border border-linen-dark">
                  <button
                    type="button"
                    onClick={() => handleDateFormatChange('relative')}
                    className={`px-2.5 py-1 text-xs rounded-md font-medium transition-all cursor-pointer ${
                      profile.dateFormat === 'relative'
                        ? 'bg-white text-charcoal font-semibold shadow-2xs'
                        : 'text-slateink hover:text-charcoal'
                    }`}
                  >
                    Relative
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDateFormatChange('standard')}
                    className={`px-2.5 py-1 text-xs rounded-md font-medium transition-all cursor-pointer ${
                      profile.dateFormat === 'standard'
                        ? 'bg-white text-charcoal font-semibold shadow-2xs'
                        : 'text-slateink hover:text-charcoal'
                    }`}
                  >
                    Standard
                  </button>
                </div>
              </div>

              {/* Grounding sensitivity */}
              <div className="flex items-center justify-between pt-2 border-t border-linen-dark/40">
                <div>
                  <span className="text-xs font-semibold text-charcoal block">Evidence Grounding Mode</span>
                  <span className="text-[11px] text-slateink">Strict mode rejects claims lacking direct evidence.</span>
                </div>
                <div className="flex items-center gap-1 bg-linen p-0.5 rounded-lg border border-linen-dark">
                  <button
                    type="button"
                    onClick={() => handleGroundingLevelChange('strict')}
                    className={`px-2.5 py-1 text-xs rounded-md font-medium transition-all cursor-pointer ${
                      profile.groundingLevel === 'strict'
                        ? 'bg-white text-charcoal font-semibold shadow-2xs'
                        : 'text-slateink hover:text-charcoal'
                    }`}
                  >
                    Strict
                  </button>
                  <button
                    type="button"
                    onClick={() => handleGroundingLevelChange('exploratory')}
                    className={`px-2.5 py-1 text-xs rounded-md font-medium transition-all cursor-pointer ${
                      profile.groundingLevel === 'exploratory'
                        ? 'bg-white text-charcoal font-semibold shadow-2xs'
                        : 'text-slateink hover:text-charcoal'
                    }`}
                  >
                    Exploratory
                  </button>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Right Column (5 cols): Security, Credentials & Data Sovereignty */}
        <div className="lg:col-span-5 space-y-5">
          {/* Account Security */}
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
                        className="text-[11px] text-slateink hover:text-charcoal cursor-pointer"
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
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slateink-light hover:text-charcoal cursor-pointer"
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
                      className="w-full h-8 rounded-lg bg-charcoal text-paper text-xs font-semibold hover:bg-terracotta disabled:opacity-50 transition-all flex items-center justify-center gap-1 shadow-2xs cursor-pointer"
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

            {/* Active Sessions & Revocation */}
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

          {/* Data Sovereignty & Settings */}
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
                  <strong className="text-charcoal font-medium">Portable Export:</strong> All
                  records can be exported to JSON anytime in Settings.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-sage-dark shrink-0 mt-0.5" />
                <span>
                  <strong className="text-charcoal font-medium">PostgreSQL RLS:</strong>{' '}
                  Database kernel validates every SQL query against your cryptographic JWT.
                </span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
