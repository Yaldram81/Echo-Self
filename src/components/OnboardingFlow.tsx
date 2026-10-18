import { useEffect, useRef, useState } from 'react';
import {
  Compass,
  BookOpen,
  Scale,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Check,
  X,
  ShieldCheck,
  Lock,
  Layers,
  MessageSquare,
  HelpCircle,
  AlertCircle,
  FileText,
  SlidersHorizontal,
  ChevronRight,
  ExternalLink,
  Bot,
  Eye,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '@/lib/useAuth';
import { profilesService } from '@/lib/services';
import type { UserProfile } from '@/lib/types';
import { navigateTo } from '@/lib/router';
import { useDialogA11y } from '@/hooks/useDialogA11y';

interface OnboardingFlowProps {
  /** Initial step to start from (defaults to 1 or saved step) */
  initialStep?: number;
  /** Invoked when onboarding is completed or dismissed */
  onDismiss: () => void;
  /** Whether displayed as modal overlay or full-page view */
  isModal?: boolean;
}

const TOTAL_STEPS = 5;

export function OnboardingFlow({
  initialStep = 1,
  onDismiss,
  isModal = true,
}: OnboardingFlowProps) {
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState<number>(initialStep);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Profile preferences state (Step 4)
  const [preferredName, setPreferredName] = useState<string>('');
  const [twinTone, setTwinTone] = useState<'contemplative' | 'analytical' | 'socratic'>('contemplative');
  const [responseStyle, setResponseStyle] = useState<'concise' | 'balanced' | 'detailed'>('balanced');
  const [groundingLevel, setGroundingLevel] = useState<'strict' | 'exploratory'>('strict');

  const containerRef = useRef<HTMLDivElement>(null);
  useDialogA11y(isModal, handleSkip, containerRef);

  // Initialize from user profile and local state
  useEffect(() => {
    let cancelled = false;

    async function loadState() {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const state = await profilesService.getOnboardingState(user.id);
        const profile = await profilesService.get(user.id);

        if (!cancelled) {
          if (initialStep > 1) {
            setCurrentStep(initialStep);
          } else if (state.step && state.step >= 1 && state.step <= TOTAL_STEPS) {
            setCurrentStep(state.step);
          }

          if (profile) {
            if (profile.preferred_name) setPreferredName(profile.preferred_name);
            else if (profile.display_name) setPreferredName(profile.display_name);
            if (profile.twin_tone) setTwinTone(profile.twin_tone);
            if (profile.response_style) setResponseStyle(profile.response_style);
            if (profile.grounding_level) setGroundingLevel(profile.grounding_level);
          } else {
            // Check local display_name
            const localName = localStorage.getItem('echoself:display_name');
            if (localName) setPreferredName(localName);
          }
        }
      } catch {
        // Fallback gracefully
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadState();
    return () => {
      cancelled = true;
    };
  }, [user, initialStep]);

  // Persist step changes for resumption
  async function goToStep(newStep: number) {
    if (newStep < 1 || newStep > TOTAL_STEPS) return;
    setCurrentStep(newStep);
    setSaveError(null);

    if (user) {
      void profilesService.saveOnboardingStep(user.id, newStep);
    }
  }

  // Graceful skip: mark completed so returning users are not prompted repeatedly
  async function handleSkip() {
    setSaving(true);
    try {
      if (user) {
        await profilesService.completeOnboarding(user.id);
      }
    } catch {
      // Degrade gracefully
    } finally {
      setSaving(false);
      onDismiss();
    }
  }

  // Save Step 4 optional preferences
  async function handleSavePreferences(advance = true) {
    if (!user) {
      if (advance) goToStep(5);
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      await profilesService.upsert({
        id: user.id,
        preferred_name: preferredName.trim(),
        twin_tone: twinTone,
        response_style: responseStyle,
        grounding_level: groundingLevel,
        onboarding_step: 5,
      });

      if (advance) {
        goToStep(5);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not save preferences. You can continue or adjust later in Settings.';
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
  }

  // Final actions on Step 5
  async function handleFinishAction(action: 'memory' | 'chat' | 'demo' | 'workspace') {
    setSaving(true);
    try {
      if (user) {
        await profilesService.completeOnboarding(user.id, {
          preferred_name: preferredName.trim() || undefined,
          twin_tone: twinTone,
          response_style: responseStyle,
          grounding_level: groundingLevel,
        });
      }
    } catch {
      // Degrade gracefully
    } finally {
      setSaving(false);
      onDismiss();

      // Execute chosen action
      switch (action) {
        case 'memory':
          navigateTo('inbox');
          break;
        case 'chat':
          navigateTo('chat');
          break;
        case 'demo':
          navigateTo('memories');
          break;
        case 'workspace':
        default:
          navigateTo('home');
          break;
      }
    }
  }

  return (
    <div
      ref={containerRef}
      role={isModal ? 'dialog' : 'region'}
      aria-modal={isModal ? 'true' : undefined}
      aria-labelledby="onboarding-step-heading"
      className={
        isModal
          ? 'fixed inset-0 z-50 overflow-y-auto bg-charcoal/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5'
          : 'w-full max-w-3xl mx-auto py-4 sm:py-8'
      }
    >
      <div className="relative w-full max-w-2xl bg-paper rounded-2xl sm:rounded-3xl border border-linen-dark/80 shadow-2xl p-5 sm:p-8 flex flex-col my-auto transition-all">
        {/* Top Header Bar: Progress Indicator & Skip Action */}
        <div className="flex items-center justify-between pb-4 sm:pb-6 border-b border-linen-dark/50 gap-4">
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-widest font-semibold text-terracotta">
              Step {currentStep} of {TOTAL_STEPS}
            </span>
            <div className="flex items-center gap-1.5 ml-2" aria-hidden="true">
              {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((stepNum) => (
                <button
                  key={stepNum}
                  type="button"
                  onClick={() => goToStep(stepNum)}
                  className={`h-1.5 rounded-full transition-all cursor-pointer ${
                    stepNum === currentStep
                      ? 'w-7 bg-terracotta'
                      : stepNum < currentStep
                      ? 'w-3 bg-terracotta/40 hover:bg-terracotta/60'
                      : 'w-3 bg-linen-dark/60'
                  }`}
                  aria-label={`Go to step ${stepNum}`}
                />
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={handleSkip}
            disabled={saving}
            className="text-xs font-medium text-slateink hover:text-charcoal px-2.5 py-1 rounded-full hover:bg-linen/80 transition-colors inline-flex items-center gap-1 cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-terracotta/50"
          >
            <span>Skip for now</span>
            <X className="w-3.5 h-3.5 text-slateink-light" />
          </button>
        </div>

        {/* Step Body */}
        <div className="py-5 sm:py-7 flex-1">
          {/* STEP 1: Welcome to EchoSelf */}
          {currentStep === 1 && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div className="w-12 h-12 rounded-2xl bg-terracotta/10 text-terracotta flex items-center justify-center">
                <Compass className="w-6 h-6 text-terracotta" />
              </div>

              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wider text-slateink font-medium">Welcome to EchoSelf</p>
                <h1
                  id="onboarding-step-heading"
                  className="font-serif text-2xl sm:text-3xl font-bold text-charcoal leading-tight"
                >
                  Meet the Twin you can examine.
                </h1>
                <p className="text-sm sm:text-base text-slateink leading-relaxed pt-1">
                  EchoSelf helps you organize life experiences, explore possible recurring patterns, and compare
                  decisions using your own recorded memories and values.
                </p>
              </div>

              <div className="bg-linen/40 rounded-2xl p-4 sm:p-5 border border-linen-dark/60 space-y-3">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-4 h-4 text-sage-dark shrink-0 mt-0.5" />
                  <p className="text-xs sm:text-sm text-charcoal leading-relaxed">
                    <strong>Grounded in evidence:</strong> Your Twin does not claim human consciousness, psychic insight, or perfect recall. Every substantive response is traced to real records you can inspect.
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-4 h-4 text-sage-dark shrink-0 mt-0.5" />
                  <p className="text-xs sm:text-sm text-charcoal leading-relaxed">
                    <strong>Transparent arithmetic:</strong> Decision analyses expose their underlying value weights and citations, assisting your judgment rather than making decisions for you.
                  </p>
                </div>
              </div>

              <div className="pt-3 flex flex-col sm:flex-row items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={handleSkip}
                  className="w-full sm:w-auto text-xs font-medium text-slateink hover:text-charcoal py-2 px-3 text-center cursor-pointer"
                >
                  Skip introduction
                </button>
                <button
                  type="button"
                  onClick={() => goToStep(2)}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full bg-terracotta text-paper text-sm font-semibold hover:bg-terracotta-dark transition-all shadow-xs cursor-pointer focus-visible:ring-2 focus-visible:ring-terracotta/50"
                >
                  <span>How EchoSelf works</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: How EchoSelf Works */}
          {currentStep === 2 && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div className="w-12 h-12 rounded-2xl bg-sage-light/60 text-sage-dark flex items-center justify-center">
                <Layers className="w-6 h-6 text-sage-dark" />
              </div>

              <div className="space-y-1.5">
                <p className="text-xs uppercase tracking-wider text-slateink font-medium">Core Workflow</p>
                <h2
                  id="onboarding-step-heading"
                  className="font-serif text-2xl sm:text-3xl font-bold text-charcoal leading-tight"
                >
                  How EchoSelf works
                </h2>
                <p className="text-xs sm:text-sm text-slateink leading-relaxed">
                  A compact, user-governed cycle between your lived experiences and your digital model:
                </p>
              </div>

              {/* Sequential numbered workflow list */}
              <div className="space-y-2.5 pt-1">
                <div className="flex items-start gap-3.5 p-3 sm:p-3.5 rounded-xl bg-linen/30 border border-linen-dark/50">
                  <div className="w-6 h-6 rounded-full bg-terracotta/15 text-terracotta text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                    1
                  </div>
                  <div>
                    <h3 className="text-xs sm:text-sm font-semibold text-charcoal">Record an experience</h3>
                    <p className="text-xs text-slateink leading-relaxed mt-0.5">
                      Capture fleeting thoughts in your Capture Inbox or log detailed memories with emotional tone and context.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5 p-3 sm:p-3.5 rounded-xl bg-linen/30 border border-linen-dark/50">
                  <div className="w-6 h-6 rounded-full bg-terracotta/15 text-terracotta text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                    2
                  </div>
                  <div>
                    <h3 className="text-xs sm:text-sm font-semibold text-charcoal">Ask the Twin a question</h3>
                    <p className="text-xs text-slateink leading-relaxed mt-0.5">
                      In Twin Chat, inquire about recurring themes, personal priorities, or how past dilemmas were resolved.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5 p-3 sm:p-3.5 rounded-xl bg-linen/30 border border-linen-dark/50">
                  <div className="w-6 h-6 rounded-full bg-terracotta/15 text-terracotta text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                    3
                  </div>
                  <div>
                    <h3 className="text-xs sm:text-sm font-semibold text-charcoal">Inspect supporting evidence</h3>
                    <p className="text-xs text-slateink leading-relaxed mt-0.5">
                      Every claim highlights direct citations with timestamps. You always see what data influenced the answer.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5 p-3 sm:p-3.5 rounded-xl bg-linen/30 border border-linen-dark/50">
                  <div className="w-6 h-6 rounded-full bg-terracotta/15 text-terracotta text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                    4
                  </div>
                  <div>
                    <h3 className="text-xs sm:text-sm font-semibold text-charcoal">Correct a misunderstanding</h3>
                    <p className="text-xs text-slateink leading-relaxed mt-0.5">
                      If an AI interpretation is imprecise or wrong, flag or correct it in the Review Center. Your corrections govern future answers.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5 p-3 sm:p-3.5 rounded-xl bg-linen/30 border border-linen-dark/50">
                  <div className="w-6 h-6 rounded-full bg-terracotta/15 text-terracotta text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                    5
                  </div>
                  <div>
                    <h3 className="text-xs sm:text-sm font-semibold text-charcoal">Reflect on decisions & lessons</h3>
                    <p className="text-xs text-slateink leading-relaxed mt-0.5">
                      Use the Decision Mirror and Weekly Review to compare options and preserve genuine lessons without automated life coaching.
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-3 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => goToStep(1)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-slateink hover:text-charcoal px-3 py-2 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>
                <button
                  type="button"
                  onClick={() => goToStep(3)}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-terracotta text-paper text-sm font-semibold hover:bg-terracotta-dark transition-all shadow-xs cursor-pointer focus-visible:ring-2 focus-visible:ring-terracotta/50"
                >
                  <span>Trust & Expectations</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Establish Trust and Expectations */}
          {currentStep === 3 && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div className="w-12 h-12 rounded-2xl bg-amberclay-light/60 text-amberclay-DEFAULT flex items-center justify-center">
                <ShieldCheck className="w-6 h-6 text-amberclay-DEFAULT" />
              </div>

              <div className="space-y-1.5">
                <p className="text-xs uppercase tracking-wider text-slateink font-medium">Clear Boundaries</p>
                <h2
                  id="onboarding-step-heading"
                  className="font-serif text-2xl sm:text-3xl font-bold text-charcoal leading-tight"
                >
                  Trust, evidence & privacy
                </h2>
                <p className="text-xs sm:text-sm text-slateink leading-relaxed">
                  We believe personal AI should be truthful about what it knows and transparent about what it does with your data.
                </p>
              </div>

              <div className="space-y-3 pt-1">
                <div className="p-4 rounded-2xl bg-paper border border-linen-dark/70 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-charcoal">
                    <CheckCircle2 className="w-4 h-4 text-sage-dark shrink-0" />
                    <span>Records vs. AI Interpretations</span>
                  </div>
                  <p className="text-xs text-slateink leading-relaxed pl-6">
                    Your recorded memories are permanent ground truth. AI-suggested beliefs, patterns, and graph connections are candidate proposals that remain pending until you approve or dismiss them.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-paper border border-linen-dark/70 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-charcoal">
                    <CheckCircle2 className="w-4 h-4 text-sage-dark shrink-0" />
                    <span>Absence of Evidence is Acknowledged</span>
                  </div>
                  <p className="text-xs text-slateink leading-relaxed pl-6">
                    If your records lack relevant memories or contain conflicting experiences, the Twin states this limitation explicitly instead of fabricating comforting falsehoods.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-linen/50 border border-linen-dark/70 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-charcoal">
                    <Lock className="w-4 h-4 text-terracotta shrink-0" />
                    <span>How AI Processing & Data Sharing Works</span>
                  </div>
                  <p className="text-xs text-slateink leading-relaxed pl-6">
                    Your records reside in your private PostgreSQL workspace protected by Row Level Security. When you ask questions in Twin Chat or run decision analyses in live mode, relevant memory excerpts are sent securely via an Edge Function to Google Gemini API to formulate responses. We never sell your personal information or use private memories to train foundation models.
                  </p>
                  <div className="pl-6 pt-1">
                    <a
                      href="/privacy"
                      onClick={(e) => {
                        e.preventDefault();
                        navigateTo('privacy');
                      }}
                      className="text-xs font-medium text-terracotta hover:underline inline-flex items-center gap-1"
                    >
                      <span>Review our complete Privacy & Data Center</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </div>

              <div className="pt-3 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => goToStep(2)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-slateink hover:text-charcoal px-3 py-2 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>
                <button
                  type="button"
                  onClick={() => goToStep(4)}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-terracotta text-paper text-sm font-semibold hover:bg-terracotta-dark transition-all shadow-xs cursor-pointer focus-visible:ring-2 focus-visible:ring-terracotta/50"
                >
                  <span>Optional setup</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: Optional Personal Setup */}
          {currentStep === 4 && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div className="w-12 h-12 rounded-2xl bg-terracotta/10 text-terracotta flex items-center justify-center">
                <SlidersHorizontal className="w-6 h-6 text-terracotta" />
              </div>

              <div className="space-y-1.5">
                <p className="text-xs uppercase tracking-wider text-slateink font-medium">Personalization</p>
                <h2
                  id="onboarding-step-heading"
                  className="font-serif text-2xl sm:text-3xl font-bold text-charcoal leading-tight"
                >
                  Optional personal setup
                </h2>
                <p className="text-xs sm:text-sm text-slateink leading-relaxed">
                  Tailor your workspace and Twin behavior. No sensitive details or personality tests required; adjust anytime in Settings.
                </p>
              </div>

              {saveError && (
                <div className="p-3 rounded-xl bg-clayred-light/40 border border-clayred-DEFAULT/30 text-xs text-clayred-DEFAULT flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{saveError}</span>
                </div>
              )}

              <div className="space-y-4 pt-1">
                {/* Preferred Name */}
                <div>
                  <label htmlFor="onboarding-preferred-name" className="block text-xs font-semibold text-charcoal mb-1">
                    Preferred name / form of address
                  </label>
                  <input
                    id="onboarding-preferred-name"
                    type="text"
                    value={preferredName}
                    onChange={(e) => setPreferredName(e.target.value)}
                    placeholder="e.g. Jordan or your first name"
                    className="w-full h-10 px-3.5 rounded-xl border border-linen-dark bg-white text-xs sm:text-sm text-charcoal focus:border-terracotta focus:outline-none shadow-2xs"
                  />
                  <p className="text-[11px] text-slateink-light mt-1">
                    How the Twin addresses you in dialogue. Can be a first name, initial, or pseudonym.
                  </p>
                </div>

                {/* Response Style */}
                <div>
                  <label className="block text-xs font-semibold text-charcoal mb-1.5">
                    Response style
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'concise', label: 'Concise', desc: 'Brief observations with direct citations' },
                      { id: 'balanced', label: 'Balanced', desc: 'Standard context with key evidence' },
                      { id: 'detailed', label: 'Detailed', desc: 'In-depth analysis of trade-offs' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setResponseStyle(opt.id as any)}
                        className={`p-2.5 sm:p-3 rounded-xl border text-left transition-all cursor-pointer ${
                          responseStyle === opt.id
                            ? 'border-terracotta bg-terracotta/5 ring-1 ring-terracotta text-charcoal'
                            : 'border-linen-dark bg-white/70 hover:bg-white text-slateink'
                        }`}
                      >
                        <p className="text-xs font-semibold text-charcoal">{opt.label}</p>
                        <p className="text-[11px] leading-tight text-slateink-light mt-0.5 hidden sm:block">
                          {opt.desc}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Twin Tone */}
                <div>
                  <label className="block text-xs font-semibold text-charcoal mb-1.5">
                    Twin tone
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'contemplative', label: 'Contemplative', desc: 'Gentle, thoughtful cadence' },
                      { id: 'analytical', label: 'Analytical', desc: 'Structured, precise, logic-first' },
                      { id: 'socratic', label: 'Socratic', desc: 'Probing questions and reflection' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setTwinTone(opt.id as any)}
                        className={`p-2.5 sm:p-3 rounded-xl border text-left transition-all cursor-pointer ${
                          twinTone === opt.id
                            ? 'border-terracotta bg-terracotta/5 ring-1 ring-terracotta text-charcoal'
                            : 'border-linen-dark bg-white/70 hover:bg-white text-slateink'
                        }`}
                      >
                        <p className="text-xs font-semibold text-charcoal">{opt.label}</p>
                        <p className="text-[11px] leading-tight text-slateink-light mt-0.5 hidden sm:block">
                          {opt.desc}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="pt-3 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => goToStep(3)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-slateink hover:text-charcoal px-3 py-2 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => goToStep(5)}
                    className="text-xs font-medium text-slateink hover:text-charcoal px-3 py-2 cursor-pointer"
                  >
                    Skip setup
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSavePreferences(true)}
                    disabled={saving}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-terracotta text-paper text-sm font-semibold hover:bg-terracotta-dark disabled:opacity-50 transition-all shadow-xs cursor-pointer focus-visible:ring-2 focus-visible:ring-terracotta/50"
                  >
                    <span>{saving ? 'Saving…' : 'Save & Continue'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: First Meaningful Action */}
          {currentStep === 5 && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div className="w-12 h-12 rounded-2xl bg-sage-light/60 text-sage-dark flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-sage-dark" />
              </div>

              <div className="space-y-1.5">
                <p className="text-xs uppercase tracking-wider text-slateink font-medium">Ready to Begin</p>
                <h2
                  id="onboarding-step-heading"
                  className="font-serif text-2xl sm:text-3xl font-bold text-charcoal leading-tight"
                >
                  Where would you like to start?
                </h2>
                <p className="text-xs sm:text-sm text-slateink leading-relaxed">
                  Your private workspace is ready. Choose your first meaningful action:
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {/* Action 1: Capture First Memory */}
                <button
                  type="button"
                  onClick={() => void handleFinishAction('memory')}
                  disabled={saving}
                  className="p-4 rounded-2xl border border-linen-dark/80 bg-white/70 hover:bg-white hover:border-terracotta/60 text-left transition-all shadow-2xs group cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-xl bg-terracotta/10 text-terracotta flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                    <BookOpen className="w-4 h-4 text-terracotta" />
                  </div>
                  <h3 className="text-sm font-semibold text-charcoal flex items-center justify-between">
                    <span>Capture a memory</span>
                    <ChevronRight className="w-4 h-4 text-slateink-light group-hover:text-terracotta transition-colors" />
                  </h3>
                  <p className="text-xs text-slateink leading-relaxed mt-1">
                    Record a recent experience, milestone, or thought in your Capture Inbox to start grounding your model.
                  </p>
                </button>

                {/* Action 2: Explore Twin Chat */}
                <button
                  type="button"
                  onClick={() => void handleFinishAction('chat')}
                  disabled={saving}
                  className="p-4 rounded-2xl border border-linen-dark/80 bg-white/70 hover:bg-white hover:border-terracotta/60 text-left transition-all shadow-2xs group cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-xl bg-sage-light/60 text-sage-dark flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                    <MessageSquare className="w-4 h-4 text-sage-dark" />
                  </div>
                  <h3 className="text-sm font-semibold text-charcoal flex items-center justify-between">
                    <span>Explore Twin Chat</span>
                    <ChevronRight className="w-4 h-4 text-slateink-light group-hover:text-terracotta transition-colors" />
                  </h3>
                  <p className="text-xs text-slateink leading-relaxed mt-1">
                    Ask an exploratory question and inspect how citations work. (Requires Gemini API key for live mode).
                  </p>
                </button>

                {/* Action 3: Explore Sample Persona (Jordan) */}
                <button
                  type="button"
                  onClick={() => void handleFinishAction('demo')}
                  disabled={saving}
                  className="p-4 rounded-2xl border border-linen-dark/80 bg-white/70 hover:bg-white hover:border-terracotta/60 text-left transition-all shadow-2xs group cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-xl bg-amberclay-light/60 text-amberclay-DEFAULT flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                    <Eye className="w-4 h-4 text-amberclay-DEFAULT" />
                  </div>
                  <h3 className="text-sm font-semibold text-charcoal flex items-center justify-between">
                    <span>Inspect sample data</span>
                    <ChevronRight className="w-4 h-4 text-slateink-light group-hover:text-terracotta transition-colors" />
                  </h3>
                  <p className="text-xs text-slateink leading-relaxed mt-1">
                    Browse the fictional Jordan persona to see how an established model connects memories, beliefs, and decisions.
                  </p>
                </button>

                {/* Action 4: Go directly to Workspace */}
                <button
                  type="button"
                  onClick={() => void handleFinishAction('workspace')}
                  disabled={saving}
                  className="p-4 rounded-2xl border border-linen-dark/80 bg-white/70 hover:bg-white hover:border-terracotta/60 text-left transition-all shadow-2xs group cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-xl bg-linen text-slateink flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                    <Compass className="w-4 h-4 text-slateink" />
                  </div>
                  <h3 className="text-sm font-semibold text-charcoal flex items-center justify-between">
                    <span>Enter workspace</span>
                    <ChevronRight className="w-4 h-4 text-slateink-light group-hover:text-terracotta transition-colors" />
                  </h3>
                  <p className="text-xs text-slateink leading-relaxed mt-1">
                    Jump straight to your workspace overview and explore at your own pace.
                  </p>
                </button>
              </div>

              <div className="pt-3 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => goToStep(4)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-slateink hover:text-charcoal px-3 py-2 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>

                <button
                  type="button"
                  onClick={() => void handleFinishAction('workspace')}
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-terracotta text-paper text-sm font-semibold hover:bg-terracotta-dark transition-all shadow-xs cursor-pointer focus-visible:ring-2 focus-visible:ring-terracotta/50"
                >
                  <span>{saving ? 'Finishing…' : 'Enter Workspace'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
