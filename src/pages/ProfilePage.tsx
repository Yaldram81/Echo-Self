import { useState, useEffect } from 'react';
import {
  UserCircle2,
  Mail,
  Calendar,
  ShieldCheck,
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
  Activity,
  HeartHandshake,
} from 'lucide-react';
import { useAuth } from '@/lib/useAuth';
import { supabase } from '@/lib/supabaseClient';
import { memoriesService, beliefsService, decisionsService } from '@/lib/services';
import { navigateTo } from '@/lib/router';
import { SectionHeading, Card } from '@/components/ui';

export function ProfilePage() {
  const { user } = useAuth();
  const [memoryCount, setMemoryCount] = useState<number | null>(null);
  const [beliefCount, setBeliefCount] = useState<number | null>(null);
  const [decisionCount, setDecisionCount] = useState<number | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  // Editable profile fields
  const [displayName, setDisplayName] = useState(() => {
    return localStorage.getItem('echoself:display_name') || (user?.email ? user.email.split('@')[0] : 'Reflective Thinker');
  });
  const [isEditingName, setIsEditingName] = useState(false);
  const [bio, setBio] = useState(() => {
    return localStorage.getItem('echoself:user_bio') || 'Examining life through evidence, recorded experiences, and deliberate choices.';
  });
  const [isEditingBio, setIsEditingBio] = useState(false);

  // Twin reflection preferences
  const [twinTone, setTwinTone] = useState(() => {
    return localStorage.getItem('echoself:twin_tone') || 'contemplative';
  });

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

  const handleSaveName = () => {
    setIsEditingName(false);
    localStorage.setItem('echoself:display_name', displayName);
  };

  const handleSaveBio = () => {
    setIsEditingBio(false);
    localStorage.setItem('echoself:user_bio', bio);
  };

  const handleTwinToneChange = (tone: string) => {
    setTwinTone(tone);
    localStorage.setItem('echoself:twin_tone', tone);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigateTo('home');
  };

  const joinedDate = user?.created_at
    ? new Date(user.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : 'October 2026';

  const userInitial = (displayName || user?.email || 'U').charAt(0).toUpperCase();

  return (
    <div className="space-y-8 max-w-4xl mx-auto animate-[fadeIn_200ms_ease-out]">
      {/* Header Profile Identity Card */}
      <Card className="p-6 sm:p-8 border border-linen-dark/80 bg-white shadow-card rounded-3xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 pb-6 border-b border-linen-dark/50">
          <div className="flex items-center gap-5">
            {/* Avatar Pill */}
            <div className="relative group">
              <div className="w-18 h-18 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-tr from-terracotta-deep via-terracotta to-terracotta-light text-paper flex items-center justify-center font-serif text-3xl font-bold shadow-lifted">
                {userInitial}
              </div>
              <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-sage-dark border-2 border-white flex items-center justify-center text-paper" title="Active Model">
                <ShieldCheck className="w-3.5 h-3.5" />
              </span>
            </div>

            {/* User Title & Info */}
            <div className="space-y-1">
              <div className="flex items-center gap-2.5">
                {isEditingName ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="px-2.5 py-1 text-xl font-serif font-bold text-charcoal border border-terracotta rounded-lg focus:outline-none"
                      autoFocus
                    />
                    <button
                      onClick={handleSaveName}
                      className="p-1.5 rounded-lg bg-terracotta text-paper hover:bg-terracotta-dark"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <h1 className="font-serif text-2xl sm:text-3xl font-bold text-charcoal tracking-tight">
                      {displayName}
                    </h1>
                    <button
                      onClick={() => setIsEditingName(true)}
                      className="p-1 text-slateink-light hover:text-charcoal rounded-md transition-colors"
                      title="Edit display name"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-slateink">
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-slateink-light" />
                  {user?.email || 'Signed in via Private Session'}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slateink-light" />
                  Member since {joinedDate}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2.5 self-end sm:self-center">
            <button
              onClick={handleSignOut}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-clayred-DEFAULT bg-clayred-light/30 hover:bg-clayred-light/50 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign out</span>
            </button>
          </div>
        </div>

        {/* Bio / Personal Examination Focus */}
        <div className="pt-5">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slateink-light">
              Personal Examination Focus
            </p>
            {!isEditingBio && (
              <button
                onClick={() => setIsEditingBio(true)}
                className="text-xs text-terracotta-deep hover:underline inline-flex items-center gap-1"
              >
                <Edit3 className="w-3 h-3" /> Edit Focus
              </button>
            )}
          </div>

          {isEditingBio ? (
            <div className="space-y-2 mt-2">
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={2}
                className="w-full p-3 text-sm text-charcoal border border-linen-dark rounded-xl focus:border-terracotta focus:outline-none bg-linen/20"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setIsEditingBio(false)}
                  className="px-3 py-1.5 text-xs text-slateink hover:text-charcoal"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveBio}
                  className="px-3.5 py-1.5 text-xs font-medium rounded-lg bg-terracotta text-paper hover:bg-terracotta-dark"
                >
                  Save Focus
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-charcoal leading-relaxed font-serif italic text-slateink-dark">
              &ldquo;{bio}&rdquo;
            </p>
          )}
        </div>
      </Card>

      {/* Model Statistics Grid */}
      <div>
        <SectionHeading
          eyebrow="Evidence & Model Dimensions"
          title="Records Grounding Your Model"
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
          <div
            onClick={() => navigateTo('memories')}
            className="cursor-pointer p-5 rounded-2xl bg-white border border-linen-dark/80 shadow-card hover:border-terracotta hover:shadow-lifted transition-all group"
          >
            <div className="flex items-center justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-terracotta/10 text-terracotta-deep group-hover:scale-105 transition-transform">
                <BookOpen className="w-5 h-5" />
              </span>
              <span className="text-xs font-medium text-slateink-light group-hover:text-terracotta transition-colors">
                View all &rarr;
              </span>
            </div>
            <div className="mt-4">
              <p className="font-serif text-3xl font-bold text-charcoal">
                {loadingStats ? '—' : memoryCount ?? 0}
              </p>
              <p className="text-xs font-medium text-slateink mt-1">Recorded Memories</p>
              <p className="text-[11px] text-slateink-light mt-0.5">Primary experiential evidence</p>
            </div>
          </div>

          <div
            onClick={() => navigateTo('beliefs')}
            className="cursor-pointer p-5 rounded-2xl bg-white border border-linen-dark/80 shadow-card hover:border-terracotta hover:shadow-lifted transition-all group"
          >
            <div className="flex items-center justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sage/15 text-sage-dark group-hover:scale-105 transition-transform">
                <Compass className="w-5 h-5" />
              </span>
              <span className="text-xs font-medium text-slateink-light group-hover:text-sage-dark transition-colors">
                View all &rarr;
              </span>
            </div>
            <div className="mt-4">
              <p className="font-serif text-3xl font-bold text-charcoal">
                {loadingStats ? '—' : beliefCount ?? 0}
              </p>
              <p className="text-xs font-medium text-slateink mt-1">Beliefs & Values</p>
              <p className="text-[11px] text-slateink-light mt-0.5">Active principles in motion</p>
            </div>
          </div>

          <div
            onClick={() => navigateTo('decisions')}
            className="cursor-pointer p-5 rounded-2xl bg-white border border-linen-dark/80 shadow-card hover:border-terracotta hover:shadow-lifted transition-all group"
          >
            <div className="flex items-center justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amberclay/15 text-amberclay-DEFAULT group-hover:scale-105 transition-transform">
                <Scale className="w-5 h-5" />
              </span>
              <span className="text-xs font-medium text-slateink-light group-hover:text-amberclay-DEFAULT transition-colors">
                View all &rarr;
              </span>
            </div>
            <div className="mt-4">
              <p className="font-serif text-3xl font-bold text-charcoal">
                {loadingStats ? '—' : decisionCount ?? 0}
              </p>
              <p className="text-xs font-medium text-slateink mt-1">Decisions Examined</p>
              <p className="text-[11px] text-slateink-light mt-0.5">Choices with value arithmetic</p>
            </div>
          </div>
        </div>
      </div>

      {/* Twin Reflection Persona Tuning */}
      <Card className="p-6 sm:p-7 border border-linen-dark/80 bg-white shadow-card rounded-3xl">
        <div className="flex items-center gap-2.5 mb-1">
          <Sparkles className="w-5 h-5 text-terracotta" />
          <h2 className="font-serif text-xl font-bold text-charcoal">
            Twin Chat Reflection Tone
          </h2>
        </div>
        <p className="text-xs text-slateink mb-5 leading-relaxed">
          How your digital twin synthesizes answers when querying your evidence graph.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            {
              id: 'contemplative',
              label: 'Contemplative & Reflective',
              desc: 'Draws philosophical connections and observes patterns in your values.',
            },
            {
              id: 'analytical',
              label: 'Objective & Direct',
              desc: 'Strictly highlights facts, confidence scores, and literal contradictions.',
            },
            {
              id: 'socratic',
              label: 'Socratic / Inquisitive',
              desc: 'Prompts self-examination by asking grounded follow-up questions.',
            },
          ].map((mode) => (
            <button
              key={mode.id}
              onClick={() => handleTwinToneChange(mode.id)}
              className={`p-4 rounded-2xl border text-left transition-all ${
                twinTone === mode.id
                  ? 'border-terracotta bg-terracotta/10 text-charcoal shadow-xs ring-1 ring-terracotta/30'
                  : 'border-linen-dark/70 bg-white hover:bg-linen/30 text-charcoal'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-semibold">{mode.label}</span>
                {twinTone === mode.id && (
                  <span className="w-2 h-2 rounded-full bg-terracotta" />
                )}
              </div>
              <p className="text-xs text-slateink-light leading-relaxed">{mode.desc}</p>
            </button>
          ))}
        </div>
      </Card>

      {/* Security & Workspace Integrity */}
      <Card className="p-6 sm:p-7 border border-linen-dark/80 bg-white shadow-card rounded-3xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <Lock className="w-5 h-5 text-slateink-dark" />
            <h2 className="font-serif text-xl font-bold text-charcoal">
              Workspace & Privacy Controls
            </h2>
          </div>
          <button
            onClick={() => navigateTo('settings')}
            className="text-xs font-semibold text-terracotta hover:underline inline-flex items-center gap-1"
          >
            Manage Data in Settings &rarr;
          </button>
        </div>

        <div className="space-y-3 text-xs text-slateink">
          <div className="flex items-center justify-between py-2.5 border-b border-linen-dark/40">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-slateink-light" />
              <span className="font-medium text-charcoal">Database Security</span>
            </div>
            <span className="text-sage-dark font-medium">Postgres RLS (User Isolation Enabled)</span>
          </div>

          <div className="flex items-center justify-between py-2.5 border-b border-linen-dark/40">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-slateink-light" />
              <span className="font-medium text-charcoal">AI Training Policy</span>
            </div>
            <span className="text-charcoal font-medium">Zero Model Training on Your Records</span>
          </div>

          <div className="flex items-center justify-between py-2.5">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-slateink-light" />
              <span className="font-medium text-charcoal">Grounding Principle</span>
            </div>
            <span className="text-charcoal font-medium">100% Traceable to Recorded Evidence</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
