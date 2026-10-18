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
  ExternalLink,
  MessageCircle,
} from 'lucide-react';
import { navigateTo } from '@/lib/router';

export function HomePage() {
  // Interactive preview state: open citation
  const [activeCitation, setActiveCitation] = useState<number | null>(0);

  // Interactive Evidence Inspector tab
  const [inspectorTab, setInspectorTab] = useState<'support' | 'conflict' | 'unknown'>('support');

  // Interactive Decision Mirror weight slider state
  const [autonomyWeight, setAutonomyWeight] = useState(4);
  const [impactWeight, setImpactWeight] = useState(2);
  const [focusWeight, setFocusWeight] = useState(5);

  // FAQ accordion state
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  // Calculate live Decision Mirror arithmetic
  // Option A: Director of Platform (High Org Impact 4, Moderate Autonomy 2, Low Focus 1)
  // Option B: Staff IC on Core Team (High Autonomy 5, High Focus 5, Moderate Impact 2)
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

  const faqs = [
    {
      q: 'Is EchoSelf a chatbot or a digital twin?',
      a: 'EchoSelf is not a generic conversational persona or an open-domain chatbot. It is a structured personal knowledge model designed to reflect you. Every assertion it makes about your personality, tendencies, or beliefs is grounded in recorded memories, decisions, and explicitly confirmed principles.',
    },
    {
      q: 'Where does its knowledge about me come from?',
      a: 'Strictly from the records you create: journal entries, reflections, recorded choices, and values you confirm. It does not scrape your web history, read your external emails, or purchase third-party data. If an event has not been recorded, the twin explicitly treats it as unknown.',
    },
    {
      q: 'Can I correct its interpretations?',
      a: 'Yes. Whenever your twin synthesizes a pattern or surfaces an inference, you can confirm it, refine it, or flag it as an overreach. The system records your correction as authoritative ground truth, adjusting all subsequent retrievals.',
    },
    {
      q: 'Does it make decisions for me?',
      a: 'No. EchoSelf does not prescribe outcomes or claim to predict the future. Through the Decision Mirror, it reveals how your available options align with your own recorded priorities and historical choices using transparent, inspectable arithmetic.',
    },
    {
      q: 'Is my data private?',
      a: 'Yes. EchoSelf is built on private database workspaces isolated by Postgres Row-Level Security (RLS). Your records are never used to train global foundation models. You maintain complete ownership with instant one-click data export and deletion tools.',
    },
    {
      q: 'Can I explore it without creating an account?',
      a: 'Yes. The public demo runs a fully interactive fictional persona ("Jordan") with 16 memories, 8 beliefs, and 4 evaluated decisions. You can inspect evidence citations, query the twin, and test the Decision Mirror without creating an account.',
    },
  ];

  return (
    <div className="space-y-24 md:space-y-36">
      {/* =========================================================================
          1. HERO SECTION
          ========================================================================= */}
      <section className="pt-4 md:pt-10 max-w-4xl mx-auto text-center space-y-7">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-linen/70 border border-linen-dark/60 text-xs font-semibold uppercase tracking-wider text-terracotta-deep shadow-xs">
          <Sparkles className="w-3.5 h-3.5 text-terracotta" />
          <span>A more thoughtful kind of AI</span>
        </div>

        <h1 className="font-serif text-4xl sm:text-6xl md:text-7xl font-bold tracking-tight text-charcoal leading-[1.08]">
          An AI twin that shows its <em className="italic font-normal text-terracotta">evidence</em>.
        </h1>

        <p className="max-w-2xl mx-auto text-base sm:text-lg md:text-xl text-slateink leading-relaxed font-sans">
          Your memories. Your values. Your decisions. EchoSelf helps you explore your experiences,
          understand possible patterns, and see the records behind its interpretations.
        </p>

        {/* Primary Call to Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 pt-2">
          <button
            onClick={() => navigateTo('memories')}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-full bg-charcoal text-paper font-semibold text-sm sm:text-base hover:bg-charcoal/90 hover:scale-[1.02] active:scale-98 transition-all shadow-lifted"
          >
            <span>Explore the demo</span>
            <ArrowRight className="w-4 h-4 text-terracotta-light" />
          </button>

          <a
            href="#how-it-works"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-6 py-3.5 rounded-full border border-linen-dark bg-white/70 hover:bg-white text-charcoal font-medium text-sm sm:text-base transition-colors"
          >
            <span>How it works</span>
            <ChevronDown className="w-4 h-4 text-slateink-light" />
          </a>
        </div>

        <p className="text-xs text-slateink-light tracking-wide pt-1">
          Explore a fictional sample persona. No account required.
        </p>
      </section>

      {/* =========================================================================
          2. A REAL PRODUCT PREVIEW (Twin Chat in Action)
          ========================================================================= */}
      <section className="max-w-4xl mx-auto">
        <div className="rounded-3xl border border-linen-dark/80 bg-white/90 backdrop-blur-xl shadow-lifted overflow-hidden">
          {/* Mock Window Top Bar */}
          <div className="px-5 py-3.5 border-b border-linen-dark/60 bg-paper/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-clayred-light border border-clayred-DEFAULT/40" />
              <span className="w-3 h-3 rounded-full bg-amberclay-light border border-amberclay-DEFAULT/40" />
              <span className="w-3 h-3 rounded-full bg-sage-light border border-sage-DEFAULT/40" />
              <span className="ml-2 text-xs font-serif font-semibold text-charcoal">EchoSelf · Twin Chat Live Inspection</span>
            </div>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-sage-dark bg-sage/10 px-2.5 py-0.5 rounded-full">
              <CheckCircle2 className="w-3 h-3" /> Grounded in 16 Records
            </span>
          </div>

          <div className="p-5 sm:p-8 space-y-6">
            {/* User Query */}
            <div className="flex items-start gap-3 justify-end">
              <div className="bg-charcoal text-paper rounded-2xl rounded-tr-xs px-5 py-3 max-w-lg text-sm font-medium shadow-xs">
                Why do I feel torn every time a leadership role comes up at work?
              </div>
            </div>

            {/* Twin Response */}
            <div className="flex items-start gap-3.5">
              <div className="w-8 h-8 rounded-xl bg-terracotta text-paper flex items-center justify-center shrink-0 font-serif font-bold text-sm shadow-xs mt-0.5">
                E
              </div>

              <div className="flex-1 space-y-4">
                <div className="bg-paper-soft border border-linen-dark/70 rounded-2xl rounded-tl-xs p-5 sm:p-6 text-sm sm:text-base text-charcoal leading-relaxed space-y-3">
                  <p>
                    Across your recorded choices, your hesitation isn&apos;t about leadership itself. It stems from an unaddressed tension between <strong>team autonomy</strong> and <strong>protecting your creative craft</strong>.
                  </p>
                  <p className="text-sm text-slateink leading-relaxed">
                    When you led the Platform Architecture RFC, your satisfaction was 92%. But when evaluating the Director role, you noted feeling drained by organizational politics.
                  </p>
                </div>

                {/* Interactive Citations Tray */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slateink-light">
                    Cited Evidence Records (Click to inspect):
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {/* Citation 1 */}
                    <button
                      onClick={() => setActiveCitation(activeCitation === 0 ? null : 0)}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        activeCitation === 0
                          ? 'bg-terracotta/10 border-terracotta ring-1 ring-terracotta/30 shadow-xs'
                          : 'bg-white border-linen-dark/70 hover:bg-linen/30'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-terracotta-deep flex items-center gap-1.5">
                          <BookOpen className="w-3.5 h-3.5" /> Memory #1: Platform Offer
                        </span>
                        <span className="text-[10px] bg-linen px-2 py-0.5 rounded-full font-medium">92% Match</span>
                      </div>
                      <p className="text-xs text-charcoal mt-1 line-clamp-1">
                        &ldquo;He wants a big traditional role; I love building with the small team.&rdquo;
                      </p>
                    </button>

                    {/* Citation 2 */}
                    <button
                      onClick={() => setActiveCitation(activeCitation === 1 ? null : 1)}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        activeCitation === 1
                          ? 'bg-terracotta/10 border-terracotta ring-1 ring-terracotta/30 shadow-xs'
                          : 'bg-white border-linen-dark/70 hover:bg-linen/30'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-terracotta-deep flex items-center gap-1.5">
                          <Compass className="w-3.5 h-3.5" /> Belief: Direct Craft over Admin
                        </span>
                        <span className="text-[10px] bg-linen px-2 py-0.5 rounded-full font-medium">Core Value</span>
                      </div>
                      <p className="text-xs text-charcoal mt-1 line-clamp-1">
                        &ldquo;I do my best thinking with my hands in the code.&rdquo;
                      </p>
                    </button>
                  </div>

                  {/* Expanded Citation Preview */}
                  {activeCitation === 0 && (
                    <div className="p-4 rounded-xl bg-white border border-linen-dark shadow-sm text-xs space-y-2 animate-[fadeIn_120ms_ease-out]">
                      <div className="flex items-center justify-between text-slateink-light">
                        <span>Source: Personal Journal · Recorded Oct 14, 2026</span>
                        <span className="text-terracotta-deep font-semibold">Reliability: 92%</span>
                      </div>
                      <p className="text-charcoal leading-relaxed font-serif italic">
                        &ldquo;Two offers inside the company: a director role on a large org, or staying with the four-person platform team I helped build. Different kinds of leverage. What actually bothered me was the assumption that bigger org equals better work.&rdquo;
                      </p>
                      <div className="flex items-center gap-1 text-[11px] text-slateink">
                        <span className="px-2 py-0.5 rounded bg-linen">#career</span>
                        <span className="px-2 py-0.5 rounded bg-linen">#decision</span>
                        <span className="px-2 py-0.5 rounded bg-linen">#autonomy</span>
                      </div>
                    </div>
                  )}

                  {activeCitation === 1 && (
                    <div className="p-4 rounded-xl bg-white border border-linen-dark shadow-sm text-xs space-y-2 animate-[fadeIn_120ms_ease-out]">
                      <div className="flex items-center justify-between text-slateink-light">
                        <span>Source: Confirmed Value Statement · Active</span>
                        <span className="text-sage-dark font-semibold">Self-Affirmed</span>
                      </div>
                      <p className="text-charcoal leading-relaxed font-serif italic">
                        &ldquo;Craftsmanship and autonomy outrank organizational status. When coordination meetings exceed 15 hours a week, my cognitive clarity plummets.&rdquo;
                      </p>
                    </div>
                  )}

                  {/* Uncertainty Indicator */}
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-linen/50 border border-linen-dark/60 text-xs text-slateink">
                    <AlertCircle className="w-4 h-4 text-amberclay-DEFAULT shrink-0" />
                    <span>
                      <strong>Honest Uncertainty:</strong> Zero recorded evidence regarding compensation pressure or family expectations. The twin explicitly leaves those factors unassumed.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          3. THE PROBLEM WITH ORDINARY AI
          ========================================================================= */}
      <section className="max-w-4xl mx-auto py-6">
        <div className="p-8 sm:p-12 rounded-3xl bg-charcoal text-paper shadow-card space-y-6 relative overflow-hidden">
          <div className="relative z-10 space-y-4">
            <p className="text-xs uppercase tracking-[0.2em] text-amberclay-light font-semibold">
              The Grounding Gap
            </p>
            <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight leading-tight">
              An answer can sound personal without being grounded.
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 text-sm leading-relaxed text-linen-light">
              <p>
                Standard conversational AI produces articulate, empathetic-sounding psychological advice. But behind the screen, you have no way to distinguish what you actually said from what the model invented or generalized from internet stereotypes.
              </p>
              <p>
                EchoSelf introduces a strict principle: <strong>don&apos;t just give an answer. Let people inspect the evidence behind it.</strong> Every pattern, reflection, and decision mirror points directly to inspectable records you own.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          4. HOW ECHOSELF WORKS
          ========================================================================= */}
      <section id="how-it-works" className="max-w-5xl mx-auto space-y-12">
        <div className="text-center space-y-3 max-w-xl mx-auto">
          <p className="text-xs uppercase tracking-[0.2em] text-terracotta-deep font-semibold">
            One Connected Experience
          </p>
          <h2 className="font-serif text-3xl sm:text-4xl font-bold text-charcoal tracking-tight">
            How EchoSelf works
          </h2>
          <p className="text-sm text-slateink leading-relaxed">
            A quiet loop of capture, examination, transparent choice, and active reflection.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* Step 1: Remember */}
          <div className="p-6 rounded-2xl bg-white border border-linen-dark/80 shadow-card space-y-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-terracotta/10 text-terracotta-deep">
              <BookOpen className="w-6 h-6" />
            </span>
            <h3 className="font-serif text-xl font-bold text-charcoal">Remember</h3>
            <p className="text-xs font-semibold text-terracotta-deep uppercase tracking-wider">
              Record experiences
            </p>
            <p className="text-xs text-slateink leading-relaxed">
              Capture moments, thoughts, values, and choices in your own natural language with private confidence weights.
            </p>
          </div>

          {/* Step 2: Examine */}
          <div className="p-6 rounded-2xl bg-white border border-linen-dark/80 shadow-card space-y-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-sage/15 text-sage-dark">
              <MessageCircle className="w-6 h-6" />
            </span>
            <h3 className="font-serif text-xl font-bold text-charcoal">Examine</h3>
            <p className="text-xs font-semibold text-sage-dark uppercase tracking-wider">
              Ask & Inspect Sources
            </p>
            <p className="text-xs text-slateink leading-relaxed">
              Ask your twin difficult questions; inspect the exact citations, dates, and reliability factors behind its claims.
            </p>
          </div>

          {/* Step 3: Decide */}
          <div className="p-6 rounded-2xl bg-white border border-linen-dark/80 shadow-card space-y-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-amberclay/15 text-amberclay-DEFAULT">
              <Scale className="w-6 h-6" />
            </span>
            <h3 className="font-serif text-xl font-bold text-charcoal">Decide</h3>
            <p className="text-xs font-semibold text-amberclay-DEFAULT uppercase tracking-wider">
              Compare Priorities
            </p>
            <p className="text-xs text-slateink leading-relaxed">
              Weigh real choices using transparent arithmetic grounded in your confirmed values rather than black-box guesses.
            </p>
          </div>

          {/* Step 4: Reflect */}
          <div className="p-6 rounded-2xl bg-white border border-linen-dark/80 shadow-card space-y-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-linen text-slateink-dark">
              <RotateCcw className="w-6 h-6" />
            </span>
            <h3 className="font-serif text-xl font-bold text-charcoal">Reflect</h3>
            <p className="text-xs font-semibold text-slateink-dark uppercase tracking-wider">
              Correct & Evolve
            </p>
            <p className="text-xs text-slateink leading-relaxed">
              Flag incorrect model assumptions, update evolving beliefs, and observe how your life priorities shift across time.
            </p>
          </div>
        </div>
      </section>

      {/* =========================================================================
          5. THE SIGNATURE EXPERIENCE: EVIDENCE INSPECTOR
          ========================================================================= */}
      <section className="max-w-4xl mx-auto space-y-8">
        <div className="text-center space-y-3 max-w-xl mx-auto">
          <p className="text-xs uppercase tracking-[0.2em] text-terracotta-deep font-semibold">
            Signature Experience
          </p>
          <h2 className="font-serif text-3xl sm:text-4xl font-bold text-charcoal tracking-tight">
            The Evidence Inspector
          </h2>
          <p className="text-sm text-slateink leading-relaxed">
            Every interpretation is laid bare with supporting records, nuance, and declared unknowns.
          </p>
        </div>

        <div className="rounded-3xl border border-linen-dark/80 bg-white p-6 sm:p-8 shadow-card space-y-6">
          <div className="border-b border-linen-dark/50 pb-5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slateink-light">
              Synthesized Hypothesis
            </span>
            <h3 className="font-serif text-xl sm:text-2xl font-bold text-charcoal mt-1 leading-snug">
              &ldquo;You hesitate on leadership when team autonomy is threatened, but thrive when directly guiding architecture.&rdquo;
            </h3>
          </div>

          {/* Inspector Tabs */}
          <div className="flex items-center gap-2 border-b border-linen-dark/50 pb-3">
            <button
              onClick={() => setInspectorTab('support')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                inspectorTab === 'support'
                  ? 'bg-terracotta/15 text-terracotta-deep'
                  : 'text-slateink hover:text-charcoal'
              }`}
            >
              Supporting Memories (2)
            </button>
            <button
              onClick={() => setInspectorTab('conflict')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                inspectorTab === 'conflict'
                  ? 'bg-amberclay/20 text-amberclay-DEFAULT'
                  : 'text-slateink hover:text-charcoal'
              }`}
            >
              Surfaced Conflict (1)
            </button>
            <button
              onClick={() => setInspectorTab('unknown')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                inspectorTab === 'unknown'
                  ? 'bg-clayred-light/30 text-clayred-DEFAULT'
                  : 'text-slateink hover:text-charcoal'
              }`}
            >
              Declared Unknowns
            </button>
          </div>

          {/* Inspector Content */}
          {inspectorTab === 'support' && (
            <div className="space-y-3 animate-[fadeIn_150ms_ease-out]">
              <div className="p-4 rounded-xl bg-paper-soft border border-linen-dark/70 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-charcoal">Memory: The small team vs big director role</span>
                  <span className="text-sage-dark font-medium">Recorded Oct 14, 2026 · 92% Confidence</span>
                </div>
                <p className="text-xs text-slateink-dark leading-relaxed font-serif">
                  &ldquo;He wants a big traditional role; I love building with the small platform team. What actually bothered me was the assumption that bigger org equals better work.&rdquo;
                </p>
              </div>

              <div className="p-4 rounded-xl bg-paper-soft border border-linen-dark/70 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-charcoal">Memory: Architecture RFC breakthrough</span>
                  <span className="text-sage-dark font-medium">Recorded Aug 22, 2026 · 88% Confidence</span>
                </div>
                <p className="text-xs text-slateink-dark leading-relaxed font-serif">
                  &ldquo;Spent Saturday drafting the offline-sync protocol. Deepest flow state I&apos;ve experienced all year. Zero meetings, just clear engineering.&rdquo;
                </p>
              </div>
            </div>
          )}

          {inspectorTab === 'conflict' && (
            <div className="p-4 rounded-xl bg-amberclay-light/20 border border-amberclay-light space-y-2 animate-[fadeIn_150ms_ease-out]">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-amberclay-DEFAULT">Nuance: Mentoring the Junior Engineer</span>
                <span className="text-slateink-light">May 2025</span>
              </div>
              <p className="text-xs text-charcoal leading-relaxed font-serif">
                &ldquo;Spent the afternoon helping Maya debug the query planner. Felt deeply fulfilled seeing her own understanding click. Perhaps leadership isn&apos;t zero-sum with craft after all.&rdquo;
              </p>
              <p className="text-[11px] text-slateink-dark">
                <strong>EchoSelf Note:</strong> Surfaced to prevent one-dimensional caricatures of your personality.
              </p>
            </div>
          )}

          {inspectorTab === 'unknown' && (
            <div className="p-4 rounded-xl bg-linen/40 border border-linen-dark space-y-2 animate-[fadeIn_150ms_ease-out]">
              <p className="text-xs font-semibold text-charcoal">Identified Information Gaps:</p>
              <ul className="text-xs text-slateink space-y-1.5 list-disc list-inside">
                <li>No recorded entries discussing financial compensation or equity trade-offs.</li>
                <li>Zero data regarding partner or family preferences on work travel demands.</li>
              </ul>
              <p className="text-[11px] text-slateink-light italic">
                EchoSelf explicitly declares these unknowns rather than guessing or fabricating advice.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* =========================================================================
          6. DECISION MIRROR (Interactive Arithmetic Preview)
          ========================================================================= */}
      <section className="max-w-4xl mx-auto space-y-8">
        <div className="text-center space-y-3 max-w-xl mx-auto">
          <p className="text-xs uppercase tracking-[0.2em] text-terracotta-deep font-semibold">
            Transparent Arithmetic
          </p>
          <h2 className="font-serif text-3xl sm:text-4xl font-bold text-charcoal tracking-tight">
            Decision Mirror
          </h2>
          <p className="text-sm text-slateink leading-relaxed">
            Changing your priorities changes the comparison in real time—with inspectable reasoning.
          </p>
        </div>

        <div className="rounded-3xl border border-linen-dark/80 bg-white p-6 sm:p-8 shadow-card space-y-8">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-slateink-light">
              Active Dilemma
            </span>
            <h3 className="font-serif text-2xl font-bold text-charcoal mt-1">
              Take the promotion or keep building the small team
            </h3>
          </div>

          {/* Interactive Weight Sliders */}
          <div className="space-y-4 p-5 rounded-2xl bg-paper-soft border border-linen-dark/60">
            <p className="text-xs font-semibold uppercase tracking-wider text-slateink">
              Adjust Your Priority Weights (1 to 5):
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-medium">
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

              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-medium">
                  <span>Org-Wide Impact</span>
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

              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-medium">
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

          {/* Calculated Alignment Comparison */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className={`p-5 rounded-2xl border transition-all ${optionAScore > optionBScore ? 'border-terracotta bg-terracotta/5 shadow-sm' : 'border-linen-dark/70 bg-white'}`}>
              <div className="flex items-center justify-between">
                <h4 className="font-serif font-bold text-base text-charcoal">Option A: Director of Platform</h4>
                <span className="font-serif text-2xl font-bold text-charcoal">{optionAScore}%</span>
              </div>
              <p className="text-xs text-slateink mt-2 leading-relaxed">
                High org-wide leverage, but requires delegating hands-on craft and taking on coordination load.
              </p>
            </div>

            <div className={`p-5 rounded-2xl border transition-all ${optionBScore >= optionAScore ? 'border-terracotta bg-terracotta/5 shadow-sm' : 'border-linen-dark/70 bg-white'}`}>
              <div className="flex items-center justify-between">
                <h4 className="font-serif font-bold text-base text-charcoal">Option B: Staff IC on Small Team</h4>
                <span className="font-serif text-2xl font-bold text-charcoal">{optionBScore}%</span>
              </div>
              <p className="text-xs text-slateink mt-2 leading-relaxed">
                Maximum craft alignment and high daily focus; lower administrative reach across other teams.
              </p>
            </div>
          </div>

          <p className="text-xs text-center text-slateink-light italic">
            Note: This measures alignment with your recorded preferences, not the probability of external success.
          </p>
        </div>
      </section>

      {/* =========================================================================
          7. TRUST, UNCERTAINTY, AND PRIVACY
          ========================================================================= */}
      <section className="max-w-4xl mx-auto space-y-8">
        <div className="text-center space-y-3 max-w-xl mx-auto">
          <p className="text-xs uppercase tracking-[0.2em] text-terracotta-deep font-semibold">
            Architectural Guarantees
          </p>
          <h2 className="font-serif text-3xl sm:text-4xl font-bold text-charcoal tracking-tight">
            Trust, uncertainty, and privacy
          </h2>
          <p className="text-sm text-slateink leading-relaxed">
            Engineered with strict security boundaries, honest limits, and user ownership.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="p-6 rounded-2xl bg-white border border-linen-dark/80 shadow-xs space-y-2.5">
            <div className="flex items-center gap-2.5 text-terracotta-deep font-semibold text-sm">
              <CheckCircle2 className="w-5 h-5" />
              <span>Traceable evidence</span>
            </div>
            <p className="text-xs text-slateink leading-relaxed">
              Inspect the exact memories, timestamps, and confidence scores associated with any synthesized interpretation.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-white border border-linen-dark/80 shadow-xs space-y-2.5">
            <div className="flex items-center gap-2.5 text-amberclay-DEFAULT font-semibold text-sm">
              <AlertCircle className="w-5 h-5" />
              <span>Conflicts surfaced</span>
            </div>
            <p className="text-xs text-slateink leading-relaxed">
              When your records contradict each other, EchoSelf highlights the disagreement instead of silently hiding it.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-white border border-linen-dark/80 shadow-xs space-y-2.5">
            <div className="flex items-center gap-2.5 text-slateink-dark font-semibold text-sm">
              <HelpCircle className="w-5 h-5" />
              <span>Honest uncertainty</span>
            </div>
            <p className="text-xs text-slateink leading-relaxed">
              The model recognizes when available data is insufficient, plainly stating unknowns rather than fabricating advice.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-white border border-linen-dark/80 shadow-xs space-y-2.5">
            <div className="flex items-center gap-2.5 text-sage-dark font-semibold text-sm">
              <ShieldCheck className="w-5 h-5" />
              <span>User control</span>
            </div>
            <p className="text-xs text-slateink leading-relaxed">
              Authenticated Postgres workspaces with RLS isolation. Full control to review, export to JSON/CSV, or wipe records.
            </p>
          </div>
        </div>
      </section>

      {/* =========================================================================
          8. FREQUENTLY ASKED QUESTIONS
          ========================================================================= */}
      <section className="max-w-3xl mx-auto space-y-8">
        <div className="text-center space-y-2">
          <h2 className="font-serif text-3xl font-bold text-charcoal tracking-tight">
            Frequently asked questions
          </h2>
          <p className="text-xs text-slateink">Clear answers regarding current capabilities and privacy.</p>
        </div>

        <div className="space-y-3">
          {faqs.map((faq, i) => {
            const isOpen = openFaq === i;
            return (
              <div
                key={faq.q}
                className="rounded-2xl border border-linen-dark/70 bg-white overflow-hidden transition-all shadow-xs"
              >
                <button
                  onClick={() => setOpenFaq(isOpen ? null : i)}
                  className="w-full flex items-center justify-between p-5 text-left text-sm font-semibold text-charcoal hover:bg-linen/20 transition-colors"
                >
                  <span>{faq.q}</span>
                  <ChevronDown className={`w-4 h-4 text-slateink-light transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {isOpen && (
                  <div className="px-5 pb-5 pt-1 text-xs sm:text-sm text-slateink leading-relaxed border-t border-linen-dark/40 animate-[fadeIn_100ms_ease-out]">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* =========================================================================
          9. CLEAR CLOSING ACTION
          ========================================================================= */}
      <section className="max-w-3xl mx-auto text-center space-y-6 pt-6 pb-12">
        <h2 className="font-serif text-3xl sm:text-5xl font-bold text-charcoal tracking-tight">
          Meet the self you can examine.
        </h2>

        <p className="max-w-lg mx-auto text-sm sm:text-base text-slateink leading-relaxed">
          Start with a fictional experience. Explore the evidence. See how EchoSelf approaches a difficult question.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <button
            onClick={() => navigateTo('memories')}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-full bg-charcoal text-paper font-semibold text-sm sm:text-base hover:bg-charcoal/90 hover:scale-[1.02] active:scale-98 transition-all shadow-lifted"
          >
            <span>Explore EchoSelf</span>
            <ArrowRight className="w-4 h-4 text-terracotta-light" />
          </button>

          <button
            onClick={() => navigateTo('signin')}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-full border border-linen-dark bg-white hover:bg-linen/30 text-charcoal font-medium text-sm sm:text-base transition-colors"
          >
            <span>Sign in to your private workspace</span>
          </button>
        </div>

        {/* Minimal Restrained Footer */}
        <div className="pt-16 mt-16 border-t border-linen-dark/60 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slateink">
          <p>© EchoSelf · An evidence-grounded personal model.</p>
          <div className="flex items-center gap-4 text-slateink-dark">
            <button onClick={() => navigateTo('memories')} className="hover:underline">Demo Persona</button>
            <button onClick={() => navigateTo('graph')} className="hover:underline">Evidence Graph</button>
            <button onClick={() => navigateTo('decisions')} className="hover:underline">Decision Mirror</button>
            <button onClick={() => navigateTo('settings')} className="hover:underline">Privacy & Data</button>
          </div>
        </div>
      </section>
    </div>
  );
}
