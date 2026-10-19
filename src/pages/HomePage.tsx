import { useState } from 'react';
import {
  ArrowRight,
  ChevronDown,
  Sparkles,
  BookOpen,
  Scale,
  Compass,
  RotateCcw,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  GitBranch,
  Layers,
  Sliders,
  ArrowUpRight,
  Share2,
  Check,
} from 'lucide-react';
import { navigateTo } from '@/lib/router';
import { useAuth } from '@/lib/useAuth';

export function HomePage() {
  const { user } = useAuth();
  const signedIn = !!user;
  // Section 1: Evidence Inspector Active Tab
  const [inspectorTab, setInspectorTab] = useState<'support' | 'conflict' | 'unknown'>('support');

  // Section 2: Decision Mirror Live Slider Weights (1-5)
  const [autonomyWeight, setAutonomyWeight] = useState(5);
  const [impactWeight, setImpactWeight] = useState(2);
  const [focusWeight, setFocusWeight] = useState(4);

  // Section 3: Interactive Mini Evidence Graph Active Node
  const [selectedGraphNode, setSelectedGraphNode] = useState<'values' | 'rfc' | 'decision' | 'mentor'>('values');

  // Section 5: FAQ Accordion State
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  // Calculate live Decision Mirror arithmetic
  // Option A: Director of Platform (High Org Impact 4, Low Autonomy 2, Low Focus 1)
  // Option B: Staff IC Lead (High Autonomy 5, High Focus 5, Moderate Impact 2)
  const optionAScore = Math.round(
    ((2 * autonomyWeight + 4 * impactWeight + 1 * focusWeight) /
      (5 * (autonomyWeight + impactWeight + focusWeight))) *
      100
  );
  const optionBScore = Math.round(
    ((5 * autonomyWeight + 2 * impactWeight + 5 * focusWeight) /
      (5 * (autonomyWeight + impactWeight + focusWeight))) *
      100
  );

  const graphNodes = {
    values: {
      title: 'Core Value: Craft & Autonomy',
      type: 'Belief / Value',
      date: 'Affirmed Oct 2026',
      badge: 'Core Anchor',
      badgeColor: 'bg-terracotta/15 text-terracotta-deep',
      excerpt: '"Craftsmanship and individual agency outrank hierarchical titles. Deep focus produces 10x leverage."',
      connections: ['Platform RFC (Supporting Memory)', 'Staff IC Choice (Influenced Decision)', 'Junior Mentoring (Nuance)'],
    },
    rfc: {
      title: 'Platform Architecture Breakthrough',
      type: 'Memory #4',
      date: 'Aug 22, 2026',
      badge: '94% Relevance',
      badgeColor: 'bg-sage/15 text-sage-dark',
      excerpt: '"Deepest flow state of the entire quarter. Zero synchronization meetings; just pristine technical design."',
      connections: ['Core Value: Craft & Autonomy'],
    },
    decision: {
      title: 'Staff IC vs Director Promotion',
      type: 'Decision Deliberation',
      date: 'Sep 30, 2026',
      badge: 'Resolved 88% Match',
      badgeColor: 'bg-amberclay/15 text-amberclay-DEFAULT',
      excerpt: '"Weighed 3 core principles against 2 distinct organizational offers. Arithmetic confirmed Staff IC alignment."',
      connections: ['Core Value: Craft & Autonomy', 'Platform RFC'],
    },
    mentor: {
      title: 'Mentoring Maya on Query Planner',
      type: 'Memory #9',
      date: 'May 14, 2025',
      badge: 'Conflict / Nuance',
      badgeColor: 'bg-linen-dark/50 text-charcoal',
      excerpt: '"Spent 3 hours helping debug planner indexes. Felt immense joy seeing it click. Leadership is not zero-sum with craft."',
      connections: ['Core Value: Craft & Autonomy'],
    },
  };

  const faqs = [
    {
      q: 'Is EchoSelf a chatbot or a structured digital twin?',
      a: 'EchoSelf is not an open-domain conversational chatbot or a generic roleplay persona. It is a structured personal knowledge model designed to reflect you. Every assertion it makes about your personality, tendencies, or beliefs is grounded in recorded memories, decisions, and explicitly confirmed principles with verifiable citations.',
    },
    {
      q: 'Where does its knowledge about me come from?',
      a: 'Strictly from the records you create: reflections, journal entries, decisions, and confirmed values. EchoSelf never scrapes your browser history, intercepts external emails, or purchases third-party datasets. If an event has not been recorded, the twin explicitly declares it as an unknown.',
    },
    {
      q: 'Can I correct or veto its interpretations?',
      a: 'Yes. Whenever your twin synthesizes a pattern or surfaces an inference, you can confirm it, refine the wording, or reject it as an overreach. The system records your correction as authoritative ground truth, adjusting all subsequent retrievals immediately.',
    },
    {
      q: 'Does it make decisions for me?',
      a: 'No. EchoSelf does not prescribe outcomes or claim to predict the future. Through the Decision Mirror, it reveals how your available options align with your own recorded priorities and historical choices using transparent, inspectable arithmetic.',
    },
    {
      q: 'Is my data private and secure?',
      a: 'Yes. EchoSelf is built on private database workspaces isolated by Postgres Row-Level Security (RLS). Your records are never used to train global foundation models. You maintain complete sovereignty with one-click JSON/CSV export and instant record deletion.',
    },
    {
      q: 'Can I explore it without creating an account?',
      a: 'Yes. The public demo runs a fully interactive fictional persona ("Jordan") with 16 memories, 8 beliefs, and 4 evaluated decisions. You can inspect evidence citations, query the twin, and test the Decision Mirror immediately without signing up.',
    },
  ];

  return (
    <div className="space-y-16 sm:space-y-24 md:space-y-32">
      {/* =========================================================================
          1. REFINED EDITORIAL HERO SECTION (Light, Breathable Left/Right Split)
          ========================================================================= */}
      <section className="pt-2 sm:pt-4 lg:pt-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          {/* Left Column: Focused Editorial Copy (7 cols on lg) */}
          <div className="lg:col-span-7 space-y-4 sm:space-y-5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-linen/80 border border-linen-dark/80 text-xs font-semibold text-terracotta-deep shadow-2xs">
              <Sparkles className="w-3.5 h-3.5 text-terracotta" aria-hidden="true" />
              <span>Evidence-Grounded Personal Intelligence</span>
            </div>

            <h1 className="font-serif text-3xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-charcoal leading-[1.08]">
              Meet the self you can{' '}
              <span className="italic font-normal text-terracotta underline decoration-terracotta/25 decoration-wavy decoration-2">
                examine
              </span>
              .
            </h1>

            <p className="text-sm sm:text-base lg:text-lg text-slateink leading-relaxed font-sans max-w-xl">
              Your memories, values, and decisions organized into a transparent personal model. Ask questions, test dilemmas, and verify every cited piece of evidence behind its words.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => navigateTo('memories')}
                className="inline-flex items-center justify-center gap-2 px-5 sm:px-6 py-2.5 sm:py-3 rounded-full bg-charcoal text-paper font-semibold text-xs sm:text-sm hover:bg-slateink-dark hover:scale-[1.01] active:scale-98 transition-all shadow-lifted cursor-pointer"
              >
                <span>{signedIn ? 'Open Personal Workspace' : 'Explore Jordan Demo'}</span>
                <ArrowRight className="w-4 h-4 text-terracotta-light" aria-hidden="true" />
              </button>

              <a
                href="#how-it-works"
                className="inline-flex items-center justify-center gap-1.5 px-4 sm:px-5 py-2.5 sm:py-3 rounded-full border border-linen-dark/90 bg-white/80 hover:bg-white text-charcoal font-medium text-xs sm:text-sm transition-colors shadow-2xs"
              >
                <span>How it works</span>
                <ChevronDown className="w-3.5 h-3.5 text-slateink-light" aria-hidden="true" />
              </a>

              <a
                href="#decision-mirror"
                className="hidden sm:inline-flex items-center gap-1 text-xs font-semibold text-terracotta-deep hover:text-terracotta transition-colors px-2 py-1"
              >
                <span>Try Decision Mirror</span>
                <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
              </a>
            </div>
          </div>

          {/* Right Column: Refined, Lightweight Preview Card (5 cols on lg) */}
          <div className="lg:col-span-5">
            <div className="rounded-2xl sm:rounded-3xl border border-linen-dark bg-white shadow-card p-5 sm:p-6 space-y-3.5">
              <div className="flex items-center justify-between text-xs text-slateink pb-2.5 border-b border-linen-dark/60">
                <span className="font-serif font-bold text-charcoal flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-terracotta" />
                  Twin Synthesis
                </span>
                <span className="text-[11px] bg-sage/15 text-sage-dark font-medium px-2 py-0.5 rounded-full">
                  {signedIn ? 'Preview Demo' : 'Sample Persona (Jordan)'}
                </span>
              </div>

              {/* Inquiry & Response */}
              <div className="space-y-2.5">
                <div className="text-xs text-slateink">
                  <span className="font-semibold text-charcoal">Query: </span>
                  &ldquo;Why do I hesitate whenever a leadership promotion comes up?&rdquo;
                </div>

                <div className="p-3.5 rounded-xl bg-paper-soft border border-linen-dark/80 text-xs sm:text-sm text-charcoal leading-relaxed space-y-1.5">
                  <p>
                    &ldquo;Across your records, your hesitation isn&apos;t about leadership scope. It stems from a verified tension between <strong>direct craft</strong> and <strong>organizational overhead</strong>.&rdquo;
                  </p>
                </div>

                {/* Grounded Citation */}
                <div className="p-2.5 rounded-xl bg-linen-light border border-linen-dark/70 text-xs flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <BookOpen className="w-3.5 h-3.5 text-terracotta shrink-0" />
                    <span className="font-medium text-charcoal truncate">Memory #1: Platform Architecture Offer</span>
                  </div>
                  <span className="text-[11px] font-semibold text-sage-dark shrink-0">92% Match</span>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between text-[11px] text-slateink-light border-t border-linen-dark/50">
                <span>0 Hallucinations · Declared Unknowns</span>
                <button
                  type="button"
                  onClick={() => navigateTo('chat')}
                  className="font-medium text-terracotta-deep hover:underline flex items-center gap-0.5 cursor-pointer"
                >
                  <span>Open Chat</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          2. METRIC CREDIBILITY STRIP (4-Column Horizontal Bar)
          ========================================================================= */}
      <section className="rounded-2xl sm:rounded-3xl border border-linen-dark/80 bg-white shadow-card p-6 sm:p-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8 divide-y sm:divide-y-0 sm:divide-x divide-linen-dark/60">
          <div className="space-y-1 pt-4 sm:pt-0">
            <span className="font-serif text-3xl sm:text-4xl font-bold text-charcoal">100%</span>
            <p className="text-xs font-semibold text-charcoal">Inspectable Citations</p>
            <p className="text-[11px] text-slateink leading-relaxed">
              Every inference cites an exact date, score, and passage.
            </p>
          </div>

          <div className="space-y-1 pt-4 sm:pt-0 sm:pl-6">
            <span className="font-serif text-3xl sm:text-4xl font-bold text-terracotta">0</span>
            <p className="text-xs font-semibold text-charcoal">Global Training Sets</p>
            <p className="text-[11px] text-slateink leading-relaxed">
              Your private records are never ingested to train global LLMs.
            </p>
          </div>

          <div className="space-y-1 pt-4 sm:pt-0 sm:pl-6">
            <span className="font-serif text-3xl sm:text-4xl font-bold text-charcoal">3-Way</span>
            <p className="text-xs font-semibold text-charcoal">Decision Arithmetic</p>
            <p className="text-[11px] text-slateink leading-relaxed">
              Transparent multi-factor weighting replaces arbitrary AI advice.
            </p>
          </div>

          <div className="space-y-1 pt-4 sm:pt-0 sm:pl-6">
            <span className="font-serif text-3xl sm:text-4xl font-bold text-sage-dark">RLS</span>
            <p className="text-xs font-semibold text-charcoal">Postgres Isolation</p>
            <p className="text-[11px] text-slateink leading-relaxed">
              Row-Level Security isolates your tenant workspace at the database engine.
            </p>
          </div>
        </div>
      </section>

      {/* =========================================================================
          3. LEFT-RIGHT SECTION 1: THE EVIDENCE GROUNDING ENGINE
          Left Text Narrative / Right Live Interactive Inspector Tabs
          ========================================================================= */}
      <section id="how-it-works" className="scroll-mt-24">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
          {/* Left Column: Storytelling (6 cols on lg) */}
          <div className="lg:col-span-6 space-y-5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-terracotta/10 border border-terracotta/30 text-xs font-semibold text-terracotta-deep">
              <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
              <span>01 · Grounding Engine</span>
            </div>

            <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-charcoal leading-[1.12]">
              An answer can sound personal without being true.
            </h2>

            <p className="text-sm sm:text-base text-slateink leading-relaxed font-sans">
              Standard conversational AI produces articulate, empathetic-sounding psychological advice—leaving you unable to distinguish real patterns from hallucinated flattery.
            </p>

            <p className="text-sm sm:text-base text-slateink leading-relaxed font-sans">
              EchoSelf enforces a strict design principle: <strong>don&apos;t just provide a response; show the exact records that produced it.</strong>
            </p>

            {/* Feature Checkpoints */}
            <div className="space-y-3 pt-2">
              <div className="flex items-start gap-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-sage/15 text-sage-dark shrink-0 mt-0.5">
                  <Check className="w-3.5 h-3.5" />
                </span>
                <div>
                  <h4 className="text-xs sm:text-sm font-semibold text-charcoal">Traceable Citations</h4>
                  <p className="text-xs text-slateink leading-relaxed">
                    Confidence scores, memory timestamps, and reliability rankings on every claim.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-amberclay/15 text-amberclay-DEFAULT shrink-0 mt-0.5">
                  <AlertCircle className="w-3.5 h-3.5" />
                </span>
                <div>
                  <h4 className="text-xs sm:text-sm font-semibold text-charcoal">Surfaced Nuance & Contradictions</h4>
                  <p className="text-xs text-slateink leading-relaxed">
                    Flags when a new decision conflicts with an established belief, avoiding one-dimensional caricatures.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-linen-dark/60 text-charcoal shrink-0 mt-0.5">
                  <HelpCircle className="w-3.5 h-3.5" />
                </span>
                <div>
                  <h4 className="text-xs sm:text-sm font-semibold text-charcoal">Explicitly Declared Unknowns</h4>
                  <p className="text-xs text-slateink leading-relaxed">
                    If an area is unrecorded, EchoSelf declares it unknown rather than guessing.
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => navigateTo('memories')}
                className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-terracotta-deep hover:text-terracotta transition-colors group cursor-pointer"
              >
                <span>{signedIn ? 'Open Memory Ledger' : "Inspect Jordan's Memory Ledger"}</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>

          {/* Right Column: Live Interactive Evidence Inspector (6 cols on lg) */}
          <div className="lg:col-span-6">
            <div className="rounded-2xl sm:rounded-3xl border border-linen-dark bg-white p-5 sm:p-7 shadow-card space-y-5">
              <div className="border-b border-linen-dark/60 pb-3">
                <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slateink-light">
                  <span>Synthesized Insight</span>
                  <span className="text-sage-dark font-medium">Authoritative Record</span>
                </div>
                <h3 className="font-serif text-lg sm:text-xl font-bold text-charcoal mt-1.5 leading-snug">
                  &ldquo;You hesitate on leadership when team autonomy is threatened, but thrive when directly guiding architecture.&rdquo;
                </h3>
              </div>

              {/* Inspector Tabs */}
              <div className="flex items-center gap-2 border-b border-linen-dark/50 pb-3">
                <button
                  type="button"
                  onClick={() => setInspectorTab('support')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    inspectorTab === 'support'
                      ? 'bg-terracotta/15 text-terracotta-deep shadow-2xs'
                      : 'text-slateink hover:text-charcoal'
                  }`}
                >
                  Supporting (2)
                </button>
                <button
                  type="button"
                  onClick={() => setInspectorTab('conflict')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    inspectorTab === 'conflict'
                      ? 'bg-amberclay/20 text-amberclay-DEFAULT shadow-2xs'
                      : 'text-slateink hover:text-charcoal'
                  }`}
                >
                  Conflict / Nuance (1)
                </button>
                <button
                  type="button"
                  onClick={() => setInspectorTab('unknown')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    inspectorTab === 'unknown'
                      ? 'bg-clayred-light/30 text-clayred-DEFAULT shadow-2xs'
                      : 'text-slateink hover:text-charcoal'
                  }`}
                >
                  Unknowns (2)
                </button>
              </div>

              {/* Inspector Content */}
              {inspectorTab === 'support' && (
                <div className="space-y-3 animate-[fadeIn_150ms_ease-out]">
                  <div className="p-3.5 rounded-xl bg-paper-soft border border-linen-dark/80 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-charcoal">Memory: Small Team vs Director Offer</span>
                      <span className="text-sage-dark font-medium text-[11px]">Oct 14, 2026 · 92%</span>
                    </div>
                    <p className="text-xs text-slateink leading-relaxed font-serif italic">
                      &ldquo;He wants a big traditional role; I love building with the small platform team.&rdquo;
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-paper-soft border border-linen-dark/80 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-charcoal">Memory: Architecture RFC Breakthrough</span>
                      <span className="text-sage-dark font-medium text-[11px]">Aug 22, 2026 · 88%</span>
                    </div>
                    <p className="text-xs text-slateink leading-relaxed font-serif italic">
                      &ldquo;Deepest flow state of the quarter. Zero sync meetings, just clear engineering leverage.&rdquo;
                    </p>
                  </div>
                </div>
              )}

              {inspectorTab === 'conflict' && (
                <div className="p-4 rounded-xl bg-amberclay-light/20 border border-amberclay-light/80 space-y-2 animate-[fadeIn_150ms_ease-out]">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-amberclay-DEFAULT">Nuance: Mentoring Junior Engineer</span>
                    <span className="text-slateink-light text-[11px]">May 14, 2025</span>
                  </div>
                  <p className="text-xs text-charcoal leading-relaxed font-serif italic">
                    &ldquo;Spent the afternoon helping Maya debug planner indexes. Felt deeply fulfilled seeing her own understanding click. Perhaps leadership is not zero-sum with craft after all.&rdquo;
                  </p>
                  <p className="text-[11px] text-slateink-dark pt-1 border-t border-amberclay-DEFAULT/20">
                    <strong>EchoSelf Guardrail:</strong> Surfaced intentionally to prevent rigid over-generalization.
                  </p>
                </div>
              )}

              {inspectorTab === 'unknown' && (
                <div className="p-4 rounded-xl bg-linen/50 border border-linen-dark space-y-2 animate-[fadeIn_150ms_ease-out]">
                  <p className="text-xs font-semibold text-charcoal">Declared Knowledge Gaps:</p>
                  <ul className="text-xs text-slateink space-y-1.5 list-disc list-inside">
                    <li>Zero recorded entries discussing compensation or equity trade-offs.</li>
                    <li>No data regarding family or partner preferences on travel demands.</li>
                  </ul>
                  <p className="text-[11px] text-slateink-light italic pt-1 border-t border-linen-dark/60">
                    EchoSelf explicitly declares these gaps rather than fabricating plausible advice.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          4. LEFT-RIGHT SECTION 2: THE DECISION MIRROR
          Left Live Sandbox / Right Editorial Deep-Dive (Reversed Layout)
          ========================================================================= */}
      <section id="decision-mirror" className="scroll-mt-24">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
          {/* Left Column: Live Interactive Sandbox (6 cols on lg) */}
          <div className="lg:col-span-6 order-2 lg:order-1">
            <div className="rounded-2xl sm:rounded-3xl border border-linen-dark bg-white p-5 sm:p-7 shadow-card space-y-5">
              <div className="flex items-center justify-between border-b border-linen-dark/60 pb-3">
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slateink-light">
                    Active Dilemma Sandbox
                  </span>
                  <h3 className="font-serif text-lg sm:text-xl font-bold text-charcoal mt-0.5">
                    Director of Platform vs Staff IC Lead
                  </h3>
                </div>
                <span className="text-xs font-semibold text-terracotta bg-terracotta/10 px-2.5 py-1 rounded-full">
                  Live Arithmetic
                </span>
              </div>

              {/* Slider Controls */}
              <div className="p-4 rounded-xl bg-paper-soft border border-linen-dark/80 space-y-3.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-charcoal">
                  Adjust Priority Weights (1 to 5):
                </p>

                <div className="space-y-3 text-xs">
                  <div className="space-y-1">
                    <div className="flex justify-between font-medium">
                      <span>Autonomy & Craft</span>
                      <span className="font-bold text-terracotta">{autonomyWeight}/5</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="5"
                      value={autonomyWeight}
                      onChange={(e) => setAutonomyWeight(Number(e.target.value))}
                      className="w-full accent-terracotta cursor-pointer"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between font-medium">
                      <span>Org-Wide Leverage</span>
                      <span className="font-bold text-terracotta">{impactWeight}/5</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="5"
                      value={impactWeight}
                      onChange={(e) => setImpactWeight(Number(e.target.value))}
                      className="w-full accent-terracotta cursor-pointer"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between font-medium">
                      <span>Cognitive Focus</span>
                      <span className="font-bold text-terracotta">{focusWeight}/5</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="5"
                      value={focusWeight}
                      onChange={(e) => setFocusWeight(Number(e.target.value))}
                      className="w-full accent-terracotta cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* Real-Time Alignment Cards */}
              <div className="grid grid-cols-2 gap-3">
                <div
                  className={`p-4 rounded-xl border transition-all ${
                    optionAScore > optionBScore
                      ? 'border-terracotta bg-terracotta/10 shadow-sm'
                      : 'border-linen-dark/80 bg-paper-soft'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <h4 className="font-serif font-bold text-sm text-charcoal">A: Director</h4>
                    <span className="font-serif text-xl font-bold text-charcoal">{optionAScore}%</span>
                  </div>
                  <p className="text-[11px] text-slateink mt-1 leading-relaxed">
                    Maximizes organizational scope, but trades away daily craft.
                  </p>
                </div>

                <div
                  className={`p-4 rounded-xl border transition-all ${
                    optionBScore >= optionAScore
                      ? 'border-terracotta bg-terracotta/10 shadow-sm'
                      : 'border-linen-dark/80 bg-paper-soft'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <h4 className="font-serif font-bold text-sm text-charcoal">B: Staff IC</h4>
                    <span className="font-serif text-xl font-bold text-charcoal">{optionBScore}%</span>
                  </div>
                  <p className="text-[11px] text-slateink mt-1 leading-relaxed">
                    Maximizes deep focus and hands-on architecture leverage.
                  </p>
                </div>
              </div>

              <div className="pt-2 text-center">
                <p className="text-[11px] text-slateink italic">
                  Measures mathematical alignment with recorded preferences, not arbitrary fortune-telling.
                </p>
              </div>
            </div>
          </div>

          {/* Right Column: Narrative (6 cols on lg) */}
          <div className="lg:col-span-6 order-1 lg:order-2 space-y-5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amberclay/15 border border-amberclay/30 text-xs font-semibold text-amberclay-DEFAULT">
              <Scale className="w-3.5 h-3.5" aria-hidden="true" />
              <span>02 · Decision Mirror</span>
            </div>

            <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-charcoal leading-[1.12]">
              Transparent arithmetic over black-box intuition.
            </h2>

            <p className="text-sm sm:text-base text-slateink leading-relaxed font-sans">
              Critical life choices shouldn&apos;t be outsourced to a chatbot prompt that generates plausible-sounding advice on a whim.
            </p>

            <p className="text-sm sm:text-base text-slateink leading-relaxed font-sans">
              The Decision Mirror structures your deliberations into concrete options, weighted criteria, and transparent arithmetic grounded in your confirmed values.
            </p>

            <div className="space-y-3 pt-2">
              <div className="flex items-start gap-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-terracotta/15 text-terracotta shrink-0 mt-0.5">
                  <Sliders className="w-3.5 h-3.5" />
                </span>
                <div>
                  <h4 className="text-xs sm:text-sm font-semibold text-charcoal">Inspectable Arithmetic</h4>
                  <p className="text-xs text-slateink leading-relaxed">
                    Every score shows the exact weighted formula so you always understand why one path scores higher.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-sage/15 text-sage-dark shrink-0 mt-0.5">
                  <RotateCcw className="w-3.5 h-3.5" />
                </span>
                <div>
                  <h4 className="text-xs sm:text-sm font-semibold text-charcoal">Post-Decision Outcome Reflection</h4>
                  <p className="text-xs text-slateink leading-relaxed">
                    Revisit decisions 3 or 6 months later to reflect on whether expected trade-offs materialized.
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => navigateTo('decisions')}
                className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-terracotta-deep hover:text-terracotta transition-colors group cursor-pointer"
              >
                <span>Open Decision Studio</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          5. LEFT-RIGHT SECTION 3: THE EVIDENCE GRAPH
          Left Editorial Narrative / Right Interactive Visual Map
          ========================================================================= */}
      <section>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
          {/* Left Column: Narrative (6 cols on lg) */}
          <div className="lg:col-span-6 space-y-5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sage/15 border border-sage/30 text-xs font-semibold text-sage-dark">
              <GitBranch className="w-3.5 h-3.5" aria-hidden="true" />
              <span>03 · Evidence Graph</span>
            </div>

            <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-charcoal leading-[1.12]">
              Your life is a living model, not isolated diary entries.
            </h2>

            <p className="text-sm sm:text-base text-slateink leading-relaxed font-sans">
              A single breakthrough project two years ago can inform a core belief that shapes a major decision today. EchoSelf models these connections as an inspectable knowledge graph.
            </p>

            <p className="text-sm sm:text-base text-slateink leading-relaxed font-sans">
              Navigate between recorded memories, derived beliefs, and evaluated decisions to see how your thinking evolves across time.
            </p>

            <div className="space-y-3 pt-2">
              <div className="flex items-start gap-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-linen-dark/60 text-charcoal shrink-0 mt-0.5">
                  <Share2 className="w-3.5 h-3.5" />
                </span>
                <div>
                  <h4 className="text-xs sm:text-sm font-semibold text-charcoal">Bidirectional Provenance</h4>
                  <p className="text-xs text-slateink leading-relaxed">
                    Trace from a belief backwards to supporting memories, or forward to affected decisions.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-terracotta/15 text-terracotta shrink-0 mt-0.5">
                  <Layers className="w-3.5 h-3.5" />
                </span>
                <div>
                  <h4 className="text-xs sm:text-sm font-semibold text-charcoal">Filter by Life Theme</h4>
                  <p className="text-xs text-slateink leading-relaxed">
                    Isolate career crossroads, relational patterns, or personal health reflections.
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => navigateTo('graph')}
                className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-terracotta-deep hover:text-terracotta transition-colors group cursor-pointer"
              >
                <span>Explore Full Evidence Graph</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>

          {/* Right Column: Interactive Mini Graph Visualizer (6 cols on lg) */}
          <div className="lg:col-span-6">
            <div className="rounded-2xl sm:rounded-3xl border border-linen-dark bg-white p-5 sm:p-7 shadow-card space-y-4">
              <div className="flex items-center justify-between border-b border-linen-dark/60 pb-3">
                <span className="text-xs font-serif font-bold text-charcoal">
                  Interactive Network Sample
                </span>
                <span className="text-[11px] text-slateink">Tap any node to inspect</span>
              </div>

              {/* Node Grid Selector */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setSelectedGraphNode('values')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    selectedGraphNode === 'values'
                      ? 'bg-terracotta/10 border-terracotta ring-1 ring-terracotta/30'
                      : 'bg-paper-soft border-linen-dark/80 hover:bg-linen/40'
                  }`}
                >
                  <span className="text-[10px] font-semibold uppercase text-terracotta-deep">Belief Node</span>
                  <p className="font-semibold text-charcoal mt-0.5 truncate">Craft & Autonomy</p>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedGraphNode('rfc')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    selectedGraphNode === 'rfc'
                      ? 'bg-sage/15 border-sage-dark ring-1 ring-sage/30'
                      : 'bg-paper-soft border-linen-dark/80 hover:bg-linen/40'
                  }`}
                >
                  <span className="text-[10px] font-semibold uppercase text-sage-dark">Memory Node</span>
                  <p className="font-semibold text-charcoal mt-0.5 truncate">Platform RFC</p>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedGraphNode('decision')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    selectedGraphNode === 'decision'
                      ? 'bg-amberclay/20 border-amberclay-DEFAULT ring-1 ring-amberclay/30'
                      : 'bg-paper-soft border-linen-dark/80 hover:bg-linen/40'
                  }`}
                >
                  <span className="text-[10px] font-semibold uppercase text-amberclay-DEFAULT">Decision Node</span>
                  <p className="font-semibold text-charcoal mt-0.5 truncate">Staff IC vs Director</p>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedGraphNode('mentor')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    selectedGraphNode === 'mentor'
                      ? 'bg-linen border-charcoal/40 ring-1 ring-charcoal/20'
                      : 'bg-paper-soft border-linen-dark/80 hover:bg-linen/40'
                  }`}
                >
                  <span className="text-[10px] font-semibold uppercase text-slateink-dark">Nuance Node</span>
                  <p className="font-semibold text-charcoal mt-0.5 truncate">Mentoring Maya</p>
                </button>
              </div>

              {/* Node Detail Card */}
              <div className="p-4 rounded-xl bg-paper-soft border border-linen-dark space-y-2 animate-[fadeIn_120ms_ease-out]">
                <div className="flex items-center justify-between text-xs">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${graphNodes[selectedGraphNode].badgeColor}`}>
                    {graphNodes[selectedGraphNode].badge}
                  </span>
                  <span className="text-slateink text-[11px]">{graphNodes[selectedGraphNode].date}</span>
                </div>
                <h4 className="font-serif font-bold text-sm text-charcoal">
                  {graphNodes[selectedGraphNode].title}
                </h4>
                <p className="text-xs text-slateink font-serif italic leading-relaxed">
                  {graphNodes[selectedGraphNode].excerpt}
                </p>
                <div className="pt-2 border-t border-linen-dark/60 text-[11px] text-slateink">
                  <span className="font-semibold text-charcoal">Connected To: </span>
                  <span>{graphNodes[selectedGraphNode].connections.join(', ')}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          6. FREQUENTLY ASKED QUESTIONS (Split 2-Column on Desktop)
          ========================================================================= */}
      <section className="pt-4">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14">
          {/* Left Column: Heading & Context (4 cols on lg) */}
          <div className="lg:col-span-4 space-y-4">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-linen border border-linen-dark text-xs font-semibold text-slateink">
              <HelpCircle className="w-3.5 h-3.5 text-terracotta" />
              <span>Questions & Answers</span>
            </div>

            <h2 className="font-serif text-3xl sm:text-4xl font-bold text-charcoal tracking-tight">
              Frequently asked questions.
            </h2>

            <p className="text-xs sm:text-sm text-slateink leading-relaxed">
              Clear answers regarding privacy boundaries, capabilities, and data sovereignty.
            </p>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => navigateTo('settings')}
                className="inline-flex items-center gap-2 text-xs font-semibold text-terracotta-deep hover:underline cursor-pointer"
              >
                <span>Read privacy & export documentation</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Right Column: Accordions (8 cols on lg) */}
          <div className="lg:col-span-8 space-y-3">
            {faqs.map((faq, i) => {
              const isOpen = openFaq === i;
              return (
                <div
                  key={faq.q}
                  className="rounded-2xl border border-linen-dark/80 bg-white overflow-hidden shadow-2xs transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? null : i)}
                    className="w-full flex items-center justify-between p-4 sm:p-5 text-left text-xs sm:text-sm font-semibold text-charcoal hover:bg-linen/20 transition-colors gap-3 cursor-pointer"
                  >
                    <span>{faq.q}</span>
                    <ChevronDown
                      className={`w-4 h-4 text-slateink-light shrink-0 transition-transform duration-200 ${
                        isOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-4 sm:px-5 pb-5 pt-1 text-xs sm:text-sm text-slateink leading-relaxed border-t border-linen-dark/40 animate-[fadeIn_100ms_ease-out]">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* =========================================================================
          8. ASTONISHING CLOSING HERO EXPERIENCE (High-Contrast Editorial Banner)
          ========================================================================= */}
      <section className="relative rounded-3xl bg-charcoal text-paper overflow-hidden shadow-card p-8 sm:p-12 lg:p-16">
        {/* Ambient Subtle Glow */}
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 rounded-full bg-terracotta/20 blur-3xl pointer-events-none" />

        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-8 space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-paper/10 border border-paper/20 text-xs font-semibold text-amberclay-light">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Instant Interactive Sandbox</span>
            </div>

            <h2 className="font-serif text-3xl sm:text-5xl font-bold tracking-tight text-paper leading-[1.1]">
              Meet the self you can examine.
            </h2>

            <p className="text-sm sm:text-base text-linen-light max-w-xl leading-relaxed">
              Explore the pre-loaded fictional persona &ldquo;Jordan&rdquo; with 16 memories, 8 beliefs, and 4 evaluated decisions. No credit card or sign-up required.
            </p>
          </div>

          <div className="lg:col-span-4 flex flex-col sm:flex-row lg:flex-col items-stretch gap-3">
            <button
              type="button"
              onClick={() => navigateTo('memories')}
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full bg-terracotta text-paper font-semibold text-sm sm:text-base hover:bg-terracotta-dark hover:scale-[1.01] active:scale-98 transition-all shadow-lifted cursor-pointer"
            >
              <span>Explore Demo Persona</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => navigateTo('signup')}
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full border border-linen/30 bg-white/10 hover:bg-white/20 text-paper font-medium text-sm sm:text-base transition-colors cursor-pointer"
            >
              <span>Create Free Account</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
