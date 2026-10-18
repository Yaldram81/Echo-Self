export type MemoryCategory =
  | 'relationship'
  | 'health'
  | 'work'
  | 'personal_growth'
  | 'travel'
  | 'finance'
  | 'other';

export type MemorySource = 'journal' | 'conversation' | 'photo' | 'audio' | 'note';
export type Mood = 'positive' | 'neutral' | 'mixed' | 'difficult';

export interface Memory {
  id: string;
  user_id?: string | null;
  title: string;
  content: string;
  category: MemoryCategory;
  source: MemorySource;
  mood: Mood;
  confidence: number;
  tags: string[];
  ai_interpretation: string | null;
  occurred_at: string;
  created_at: string;
  /**
   * User-assigned significance, 1–5 (5 = most significant). NULL = not rated.
   * Independent of confidence (reliability) and of retrieval relevance. Never
   * inferred or defaulted by the app.
   */
  user_importance: number | null;
}

export interface MemoryInput {
  title: string;
  content: string;
  category: MemoryCategory;
  source: MemorySource;
  mood: Mood;
  confidence: number;
  tags: string[];
  occurred_at: string;
  /** Optional; omit or pass null to leave the record unrated. */
  user_importance?: number | null;
}

/** Documented 1–5 importance scale shown in the UI. */
export const MEMORY_IMPORTANCE_LABELS: Record<number, string> = {
  1: 'Minor',
  2: 'Low',
  3: 'Notable',
  4: 'Very significant',
  5: 'Among the most important',
};

export type BeliefKind = 'belief' | 'value';
export type BeliefStatus = 'active' | 'evolving' | 'revisited';
export type BeliefOrigin = 'user' | 'suggestion' | 'confirmed_suggestion';

export interface BeliefHistoryPoint {
  id: string;
  belief_id: string;
  strength: number;
  note: string;
  recorded_at: string;
}

export interface Belief extends BeliefHistoryPointOmit {
  user_id?: string | null;
  kind: BeliefKind;
  status: BeliefStatus;
  formed_at: string;
  description: string | null;
  origin: BeliefOrigin;
  last_reviewed: string | null;
  history?: BeliefHistoryPoint[];
}

export interface BeliefInput {
  statement: string;
  description: string;
  kind: BeliefKind;
  category: string;
  strength: number;
  last_reviewed: string | null;
}

/** A pair of user statements that pull in opposite directions. */
export interface BeliefContradiction {
  a: Belief;
  b: Belief;
  supportingMemories: Memory[];
}

export interface BeliefSuggestion {
  accept: (beliefId: string) => Promise<void>;
  dismiss: (beliefId: string) => Promise<void>;
}

type BeliefHistoryPointOmit = {
  id: string;
  statement: string;
  category: string;
  strength: number;
  last_reflected_at: string;
  created_at: string;
};

export interface DecisionOption {
  label: string;
  pros: string[];
  cons: string[];
}

export type DecisionStatus = 'unresolved' | 'decided' | 'archived';

export type ValueAlignmentKind = 'for' | 'against' | 'mixed' | 'neutral';

export interface ValueAlignment {
  value: string;
  alignment: ValueAlignmentKind;
  note: string;
}

export interface AnalyzedOption {
  label: string;
  valueAlignment: ValueAlignment[];
  tradeoffs: string[];
  risks: string[];
  opportunityCosts: string[];
}

export interface DecisionAnalysis {
  summary: string;
  options: AnalyzedOption[];
  contradictions: string[];
  missingInformation: string[];
  experiments: string[];
}

export interface OutcomeReflection {
  whatHappened: string;
  matchesOriginalReasoning: boolean;
  surprises: string;
  lesson: string;
  /** How the outcome measured against the decision's stated success definition. */
  successMeasure?: 'met' | 'partly' | 'not_met' | 'redefined';
  /** User's own words on how it measured, when they chose "redefined" or want nuance. */
  successNote?: string;
}

/** A belief/value change the mirror proposes; nothing applies without explicit approval. */
export interface BeliefProposal {
  id: string;
  beliefId: string;
  beliefStatement: string;
  /** What the mirror suggests changing, in user-visible terms. */
  change: string;
  /** Why: the divergence that triggered the proposal, citing the decision. */
  reason: string;
  status: 'pending' | 'approved' | 'dismissed';
  createdAt: string;
  resolvedAt: string | null;
}

/** Per-value arithmetic trace behind an option's alignment score. */
export interface ValueTraceLine {
  value: string;
  weight: number;
  supporting: number;
  contradicting: number;
  /** (supporting − contradicting) × weight */
  contribution: number;
  /** Explicit user judgments (pros/cons) included in the counts. */
  explicitCount: number;
  /** Inferred keyword classifications included in the counts. */
  inferredCount: number;
  /** User-corrected classifications included in the counts. */
  overrideCount: number;
  /** The record links behind the counts. */
  memoryIds: string[];
}

export interface ScoreTrace {
  /** Per-value weighted contributions. */
  lines: ValueTraceLine[];
  /** Σ (supporting − contradicting) × weight */
  net: number;
  /** Σ (supporting + contradicting) × weight */
  classifiedMass: number;
  /** The reported score: clamp(net ÷ classifiedMass, -1, 1). */
  score: number;
}

/** Persisted record of the exact inputs behind a generated analysis. */
export interface AnalysisSnapshot {
  /** Engine version that produced the report (must match ANALYSIS_VERSION). */
  engineVersion: string;
  /** FNV-1a hash over the canonical input bundle — detects any input change. */
  inputHash: string;
  computedAt: string;
  inputs: {
    valueWeights: Record<string, number>;
    evidenceMemoryIds: string[];
    explicitItems: { option: string; kind: 'pro' | 'con'; text: string }[];
    overrideCount: number;
    /** dm-5: the user's approved/corrected classifications (key → label). */
    approvedClassifications?: Record<string, 'for' | 'against' | 'neutral' | 'unknown'>;
    /** dm-5: per-option assessed/unassessed value coverage at snapshot time. */
    coverage?: {
      option: string;
      assessedValues: string[];
      unassessedValues: string[];
    }[];
    /** dm-5: values assessed for EVERY assessable option at snapshot time. */
    commonAssessedValues?: string[];
    /** dm-5: plain-language reason an overall ranking was withheld, if it was. */
    withheldRanking?: string | null;
  };
}

export interface Decision {
  id: string;
  user_id?: string | null;
  title: string;
  context: string;
  status: DecisionStatus;
  options: DecisionOption[];
  chosen_option: string | null;
  created_at: string;
  decided_at: string | null;
  constraints: string | null;
  uncertainties: string | null;
  values: string[];
  success_definition: string | null;
  analysis: DecisionAnalysis | null;
  analysis_edited: boolean;
  /** Stored record of which inputs produced the last generated analysis. */
  analysis_snapshot: AnalysisSnapshot | null;
  value_weights: Record<string, number>;
  /** User-corrected classifications, keyed "<decisionId>:<option>:<value>:<memoryId>". */
  classification_overrides: Record<string, 'for' | 'against' | 'neutral' | 'unknown'>;
  /** Belief/value updates the mirror proposed after a divergent reflection. */
  proposals?: BeliefProposal[];
  rationale: string | null;
  reflection: OutcomeReflection | null;
  reflected_at: string | null;
}

export interface DecisionInput {
  title: string;
  context: string;
  constraints: string;
  uncertainties: string;
  values: string[];
  success_definition: string;
  options: DecisionOption[];
}

export type TimelineEventType = 'memory' | 'decision' | 'belief' | 'milestone';
export type Importance = 'high' | 'medium' | 'low';

export interface TimelineEvent {
  id: string;
  title: string;
  description: string;
  event_type: TimelineEventType;
  importance: Importance;
  occurred_at: string;
  created_at: string;
}

export type ChatRole = 'user' | 'twin';

/** Lifecycle of a user correction. Only confirmed corrections are retrieved as authoritative context. */
export type CorrectionStatus = 'proposed' | 'confirmed' | 'superseded' | 'dismissed';

/**
 * A user correction saved against an interpretation of a memory record.
 * The original memory is never modified; the correction lives beside it.
 */
export interface InterpretationFlag {
  id: string;
  memory_id: string;
  answer_excerpt: string;
  correction_note: string;
  created_at: string;
  /** proposed → confirmed on review; superseded/dismissed corrections stay as history. */
  status: CorrectionStatus;
  /** Optional topic tag the user supplies; retrieval uses it to scope relevance. */
  topic: string | null;
  /** When the user last changed the status; NULL until then, never invented. */
  reviewed_at: string | null;
  /** The correction that replaced this one, when superseded. */
  superseded_by: string | null;
}

/** A stable reference from AI output back to an exact evidence record. */
export interface SourceRef {
  memoryId: string;
  title: string;
}

/** How well the evidence actually backs the claim, after audit. */
export type EvidenceStatus = 'direct' | 'partial' | 'conflicting' | 'insufficient';

/**
 * Semantic claim review (Upgrade 4): a second, server-side model pass that
 * judges MEANING — whether the cited record text actually supports the claim.
 * Distinct from the deterministic audit (structure, ids, verbatim quotes) and
 * never described as proof: a review label is one model's judgment of the
 * supplied evidence, not a calibrated probability.
 */
export type ReviewLabel =
  | 'supported'
  | 'partially_supported'
  | 'contradicted'
  | 'unsupported'
  | 'unable_to_assess';

export type ClaimReview =
  | { state: 'reviewed'; label: ReviewLabel; explanation: string }
  | { state: 'unreviewed'; reason?: string };

/** Reply-level record of whether the semantic review leg ran at all. */
export interface ReplyReview {
  ran: boolean;
  model?: string;
  /** Plain-language note when the review did not run or is bounded. */
  note?: string;
}

export type ClaimType = 'directly_supported' | 'interpretation' | 'conflicting_evidence' | 'unknown';

/** Per-claim evidence: which retrieved records back this claim, with the supporting excerpt. */
export interface ClaimEvidence {
  memoryId: string;
  title: string;
  /** Verbatim excerpt from the user-authored record text backing the claim. */
  excerpt: string;
  /** How this record relates to the claim (model-supplied, kept only when plausible). */
  relation?: string;
}

/** One substantive statement from a twin answer, kept separate from the prose. */
export interface AnswerClaim {
  /** Unique within this reply; lets the UI and tests address a single claim. */
  claimId: string;
  claim: string;
  type: ClaimType;
  /** Calibrated post-audit evidence label; the model's own label is never trusted as final. */
  evidenceStatus: EvidenceStatus;
  /** Why the evidence does or does not establish the claim. */
  basis?: string;
  /** Meaningful uncertainty explanation when support is partial or insufficient. */
  uncertainty?: string;
  /** Records retrieved for THIS request that relate to the claim. */
  evidence: ClaimEvidence[];
  /** User corrections that override or annotate this claim, when present. */
  corrections?: InterpretationFlag[];
  /**
   * Semantic review outcome for this claim. Absent or malformed input is
   * normalized to the unreviewed state — never to a verified label.
   */
  review?: ClaimReview;
}

/** Two retrieved records that pull in opposite directions; both are shown, no winner picked. */
export interface EvidenceConflict {
  a: { memoryId: string; title: string; occurred_at: string; excerpt: string };
  b: { memoryId: string; title: string; occurred_at: string; excerpt: string };
  explanation: string;
}

/**
 * A user correction shown beside the record it amends. Both sides are displayed;
 * no winner is picked — mirrors EvidenceConflict semantics.
 */
export interface EvidenceCorrection {
  memoryId: string;
  memoryTitle: string;
  correction: string;
  recordedAt: string;
}

/** Structured, evidence-grounded twin reply. */
export interface TwinReply {
  answer: string;
  sources: SourceRef[];
  inferences: string[];
  gaps: string[];
  followUps: string[];
  mode: 'live' | 'demo';
  /** Claim-level breakdown, when the reply was decomposed into claims. */
  claims?: AnswerClaim[];
  /** Record pairs found in conflict for this question. */
  conflicts?: EvidenceConflict[];
  /** User corrections relevant to this reply's evidence, shown beside their records. */
  corrections?: EvidenceCorrection[];
  /** Whether the server-side semantic review leg ran for this reply. */
  review?: ReplyReview;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  created_at: string;
  reply?: TwinReply;
  /** demo-mode: the memory ids whose text was used to compose the reply */
  evidenceIds?: string[];
  /** set when the user flags an interpretation as wrong */
  flagged?: boolean;
}

/** A pending user correction attached to a flagged answer. */
export interface CorrectionDraft {
  messageId: string;
  memoryId: string;
  note: string;
}

export type AiConfigStatus = 'unconfigured' | 'demo' | 'live';

export interface ServiceError {
  message: string;
}

export const MEMORY_CATEGORIES: MemoryCategory[] = [
  'relationship',
  'health',
  'work',
  'personal_growth',
  'travel',
  'finance',
  'other',
];

export const MEMORY_SOURCES: MemorySource[] = [
  'journal',
  'conversation',
  'photo',
  'audio',
  'note',
];

export const MEMORY_MOODS: Mood[] = ['positive', 'neutral', 'mixed', 'difficult'];

/** Timeline entry assembled from multiple record types. */
export interface TimelineEntry {
  id: string;
  kind: 'memory' | 'decision' | 'belief-change' | 'reflection';
  title: string;
  description: string;
  occurredAt: string;
  /** stable deep link into the source record */
  href: string;
  /** ids of other TimelineEntries this one is connected to */
  linkedIds: string[];
  /** true when the connection is recorded in data (e.g. decision cites memory); false = chronological only */
  linkDemonstrated: boolean;
}

export interface UserProfile {
  id: string;
  display_name: string;
  preferred_name: string;
  bio: string;
  avatar_color: string;
  twin_tone: 'contemplative' | 'analytical' | 'socratic';
  response_style: 'concise' | 'balanced' | 'detailed';
  twin_context: string;
  date_format: 'relative' | 'standard';
  grounding_level: 'strict' | 'exploratory';
  ai_personalization_enabled?: boolean;
  semantic_retrieval_enabled?: boolean;
  data_retention_period?: 'indefinite' | '1_year' | '2_years';
  onboarding_completed?: boolean;
  onboarding_step?: number;
  created_at: string;
  updated_at: string;
}

export interface PrivacyRecordCounts {
  memories: number;
  captures: number;
  beliefs: number;
  beliefs_history: number;
  decisions: number;
  reflections: number;
  interpretation_flags: number;
  insights: number;
  timeline_events: number;
  statement_relationships: number;
  graph_edge_confirmations: number;
  review_actions_log: number;
  total: number;
}

export interface DataExportBundle {
  exported_at: string;
  user_id: string;
  schema_version: string;
  counts: Record<string, number>;
  profile: Partial<UserProfile> | null;
  data: Record<string, unknown[]>;
}

export type CaptureStatus = 'inbox' | 'promoted' | 'archived';

export interface CaptureItem {
  id: string;
  user_id?: string | null;
  content: string;
  title?: string | null;
  category?: MemoryCategory | null;
  tags: string[];
  occurred_at: string;
  status: CaptureStatus;
  promoted_memory_id?: string | null;
  promoted_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CaptureInput {
  content: string;
  title?: string | null;
  category?: MemoryCategory | null;
  tags?: string[];
  occurred_at?: string;
}

export type InsightCategory =
  | 'recurring_theme'
  | 'decision_pattern'
  | 'decision_approach'
  | 'belief_evolution'
  | 'repeated_obstacle'
  | 'value_alignment'
  | 'value_decision_alignment'
  | 'stated_vs_choice_tension'
  | 'priority_tension'
  | 'reflection_prompt'
  | 'reflection_question'
  | 'missing_information';

export type EvidenceQuality =
  | 'multiple_examples'
  | 'single_example'
  | 'conflicting_evidence'
  | 'limited_recent'
  | 'insufficient_evidence';

export type InsightStatus = 'candidate' | 'confirmed' | 'dismissed';

export interface InsightItem {
  id: string;
  user_id?: string | null;
  category: InsightCategory;
  title: string;
  statement: string;
  scope_label: string;
  evidence_quality: EvidenceQuality;
  evidence_coverage: string;
  status: InsightStatus;
  user_correction?: string | null;
  supporting_memory_ids: string[];
  counter_memory_ids: string[];
  related_decision_ids: string[];
  related_belief_ids: string[];
  reasoning: string;
  uncertainty_notes?: string | null;
  promoted_belief_id?: string | null;
  generated_at: string;
  reviewed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface InsightInput {
  category: InsightCategory;
  title: string;
  statement: string;
  scope_label?: string;
  evidence_quality: EvidenceQuality;
  evidence_coverage?: string;
  supporting_memory_ids?: string[];
  counter_memory_ids?: string[];
  related_decision_ids?: string[];
  related_belief_ids?: string[];
  reasoning: string;
  uncertainty_notes?: string | null;
}

export type PeriodType = 'weekly' | 'custom' | 'monthly';
export type ReflectionStatus = 'draft' | 'saved' | 'archived';

export interface ProposedBeliefUpdate {
  statement: string;
  rationale: string;
  kind?: 'belief' | 'value';
}

export interface ReflectionItem {
  id: string;
  user_id?: string | null;
  period_start: string;
  period_end: string;
  period_type: PeriodType;
  title: string;
  content: string;
  guided_answers: Record<string, string>;
  summary?: string | null;
  memory_ids: string[];
  decision_ids: string[];
  belief_ids: string[];
  proposed_belief_update?: ProposedBeliefUpdate | null;
  status: ReflectionStatus;
  created_at: string;
  updated_at: string;
}

export interface ReflectionInput {
  period_start: string;
  period_end: string;
  period_type?: PeriodType;
  title?: string;
  content: string;
  guided_answers?: Record<string, string>;
  summary?: string | null;
  memory_ids?: string[];
  decision_ids?: string[];
  belief_ids?: string[];
  proposed_belief_update?: ProposedBeliefUpdate | null;
  status?: ReflectionStatus;
}

export interface PeriodSummary {
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  memories: Memory[];
  decisions: Decision[];
  beliefs: Belief[];
  insights: InsightItem[];
  unresolvedDecisions: Decision[];
  isEmpty: boolean;
}

export interface ReflectionPrompt {
  id: string;
  question: string;
  rationale: string;
  sourceType?: 'memory' | 'decision' | 'belief' | 'general';
  sourceId?: string;
  sourceTitle?: string;
  sourceUrl?: string;
  isAiGenerated?: boolean;
}


