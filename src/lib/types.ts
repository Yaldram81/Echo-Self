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
}

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
}

export interface Decision {
  id: string;
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
  value_weights: Record<string, number>;
  /** User-corrected classifications, keyed "<decisionId>:<option>:<value>:<memoryId>". */
  classification_overrides: Record<string, 'for' | 'against' | 'neutral' | 'unknown'>;
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

/** A stable reference from AI output back to an exact evidence record. */
export interface SourceRef {
  memoryId: string;
  title: string;
}

export type ClaimType = 'directly_supported' | 'interpretation' | 'conflicting_evidence' | 'unknown';

/** Per-claim evidence: which retrieved records back this claim, with the supporting excerpt. */
export interface ClaimEvidence {
  memoryId: string;
  title: string;
  /** Verbatim excerpt from the user-authored record text backing the claim. */
  excerpt: string;
}

/** One substantive statement from a twin answer, kept separate from the prose. */
export interface AnswerClaim {
  claim: string;
  type: ClaimType;
  /** Records retrieved for THIS request that relate to the claim. */
  evidence: ClaimEvidence[];
}

/** Two retrieved records that pull in opposite directions; both are shown, no winner picked. */
export interface EvidenceConflict {
  a: { memoryId: string; title: string; occurred_at: string; excerpt: string };
  b: { memoryId: string; title: string; occurred_at: string; excerpt: string };
  explanation: string;
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
