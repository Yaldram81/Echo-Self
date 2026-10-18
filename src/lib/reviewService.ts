import { supabase } from './supabaseClient';
import {
  beliefsService,
  decisionsService,
  edgeConfirmationsService,
  flagsService,
  memoriesService,
  relationshipsService,
  type StatementRelationshipRow,
} from './services';
import { buildEvidenceGraph, applyEdgeConfirmations } from './evidenceGraph';
import type {
  Belief,
  BeliefProposal,
  Decision,
  InterpretationFlag,
  Memory,
} from './types';

export type ReviewItemKind =
  | 'belief_suggestion'
  | 'interpretation_flag'
  | 'statement_relationship'
  | 'graph_edge'
  | 'decision_proposal';

export type ReviewItemStatus = 'pending' | 'approved' | 'dismissed';

export interface SupportingRecordRef {
  id: string;
  title: string;
  type: 'memory' | 'belief' | 'decision';
  href: string;
  excerpt?: string;
}

export interface UnifiedReviewItem {
  id: string;
  kind: ReviewItemKind;
  title: string;
  categoryLabel: string;
  summary: string;
  createdAt: string;
  status: ReviewItemStatus;
  reviewedAt?: string | null;

  // 5 core governance pillars
  proposal: string;
  rationale: string;
  supportingRecords: SupportingRecordRef[];
  uncertainties: string;
  impactExplanation: string;

  // Provenance & Source Health
  sourceDeleted?: boolean;
  raw: {
    belief?: Belief;
    flag?: InterpretationFlag;
    relationship?: StatementRelationshipRow;
    edge?: {
      id: string;
      source: string;
      target: string;
      kind: string;
      label: string;
      trace: string;
    };
    decision?: Decision;
    proposal?: BeliefProposal;
  };
}

export const reviewService = {
  /**
   * Load all reviewable items across the application for the current user.
   * Resolves underlying source records to verify validity and flag stale sources.
   */
  async listAll(): Promise<UnifiedReviewItem[]> {
    // 1. Concurrently fetch all entities
    const [memories, beliefs, decisions, flags, relationships, confirmations] = await Promise.all([
      memoriesService.list().catch(() => [] as Memory[]),
      beliefsService.listWithHistory().catch(() => [] as Belief[]),
      decisionsService.list().catch(() => [] as Decision[]),
      flagsService.list().catch(() => [] as InterpretationFlag[]),
      relationshipsService.list().catch(() => [] as StatementRelationshipRow[]),
      edgeConfirmationsService.list().catch(() => []),
    ]);

    const memoryMap = new Map<string, Memory>(memories.map((m) => [m.id, m]));
    const beliefMap = new Map<string, Belief>(beliefs.map((b) => [b.id, b]));
    const decisionMap = new Map<string, Decision>(decisions.map((d) => [d.id, d]));
    const confirmationMap = new Map(confirmations.map((c) => [c.edge_key, c]));

    const items: UnifiedReviewItem[] = [];

    // =========================================================================
    // 1. Suggested Beliefs & Values (origin: 'suggestion')
    // =========================================================================
    for (const b of beliefs) {
      if (b.origin === 'suggestion') {
        // Find matching memories by matching keywords in statement
        const stmtWords = b.statement.toLowerCase().split(/\W+/).filter((w) => w.length > 4);
        const matchedMemories = memories.filter((m) => {
          const hay = `${m.title} ${m.content}`.toLowerCase();
          return stmtWords.some((w) => hay.includes(w));
        });

        items.push({
          id: `belief_suggestion:${b.id}`,
          kind: 'belief_suggestion',
          title: `Suggested ${b.kind === 'value' ? 'Value' : 'Belief'}: "${b.statement}"`,
          categoryLabel: b.kind === 'value' ? 'Core Value' : 'Belief Statement',
          summary: b.statement,
          createdAt: b.formed_at || b.created_at,
          status: 'pending',
          reviewedAt: b.last_reviewed,
          proposal: `Adopt statement "${b.statement}" as a confirmed user ${b.kind} with strength ${b.strength}/100.`,
          rationale: b.description || 'Observed recurring pattern across your personal reflections.',
          supportingRecords: matchedMemories.slice(0, 3).map((m) => ({
            id: m.id,
            title: m.title,
            type: 'memory',
            href: `/memory/${m.id}`,
            excerpt: m.content.slice(0, 100) + '…',
          })),
          uncertainties: 'This principle was extracted from your writing; verify whether it reflects a core truth or a passing situation.',
          impactExplanation: 'Approving confirms this statement in your Beliefs & Values system and includes it in your Twin Chat context. Dismissing permanently deletes it.',
          sourceDeleted: false,
          raw: { belief: b },
        });
      } else if (b.origin === 'confirmed_suggestion') {
        items.push({
          id: `belief_suggestion:${b.id}`,
          kind: 'belief_suggestion',
          title: `Confirmed ${b.kind === 'value' ? 'Value' : 'Belief'}: "${b.statement}"`,
          categoryLabel: b.kind === 'value' ? 'Core Value' : 'Belief Statement',
          summary: b.statement,
          createdAt: b.formed_at || b.created_at,
          status: 'approved',
          reviewedAt: b.last_reviewed,
          proposal: `Statement "${b.statement}" was confirmed by user.`,
          rationale: b.description || 'User-confirmed suggestion.',
          supportingRecords: [],
          uncertainties: 'None. Statement is confirmed.',
          impactExplanation: 'Statement is active in Beliefs & Values and Twin retrieval.',
          sourceDeleted: false,
          raw: { belief: b },
        });
      }
    }

    // =========================================================================
    // 2. Interpretation Flags / Corrections (status: 'proposed' | 'confirmed' | 'dismissed')
    // =========================================================================
    for (const flag of flags) {
      const parentMem = memoryMap.get(flag.memory_id);
      const isPending = flag.status === 'proposed';
      const isApproved = flag.status === 'confirmed';
      const isDismissed = flag.status === 'dismissed' || flag.status === 'superseded';

      items.push({
        id: `interpretation_flag:${flag.id}`,
        kind: 'interpretation_flag',
        title: `Interpretation Correction: ${parentMem ? parentMem.title : 'Missing Memory'}`,
        categoryLabel: flag.topic ? `Correction (${flag.topic})` : 'Memory Correction',
        summary: flag.correction_note,
        createdAt: flag.created_at,
        status: isPending ? 'pending' : isApproved ? 'approved' : 'dismissed',
        reviewedAt: flag.reviewed_at,
        proposal: `Apply correction note: "${flag.correction_note}" to replace the interpretation of excerpt "${flag.answer_excerpt}".`,
        rationale: `User flagged Twin interpretation as inaccurate: "${flag.answer_excerpt}".`,
        supportingRecords: parentMem
          ? [
              {
                id: parentMem.id,
                title: parentMem.title,
                type: 'memory',
                href: `/memory/${parentMem.id}`,
                excerpt: parentMem.content.slice(0, 100) + '…',
              },
            ]
          : [],
        uncertainties: flag.topic
          ? `Scoped to topic "${flag.topic}".`
          : 'Applies as a general override for interpretations of this memory.',
        impactExplanation: 'Approving makes this correction authoritative in future Twin Chat answers. Dismissing keeps the original interpretation.',
        sourceDeleted: !parentMem,
        raw: { flag },
      });
    }

    // =========================================================================
    // 3. Statement Relationships (status: 'candidate' | 'confirmed' | 'dismissed')
    // =========================================================================
    for (const rel of relationships) {
      const isPending = rel.status === 'candidate';
      const isApproved = rel.status === 'confirmed';
      const isDismissed = rel.status === 'dismissed';

      const aRec = rel.a_type === 'belief' ? beliefMap.get(rel.a_id) : memoryMap.get(rel.a_id);
      const bRec = rel.b_type === 'belief' ? beliefMap.get(rel.b_id) : memoryMap.get(rel.b_id);
      const aTitle = aRec ? ('statement' in aRec ? aRec.statement : aRec.title) : 'Unknown Record';
      const bTitle = bRec ? ('statement' in bRec ? bRec.statement : bRec.title) : 'Unknown Record';

      const supporting: SupportingRecordRef[] = [];
      if (aRec) {
        supporting.push({
          id: rel.a_id,
          title: aTitle,
          type: rel.a_type,
          href: rel.a_type === 'memory' ? `/memory/${rel.a_id}` : '/beliefs',
        });
      }
      if (bRec) {
        supporting.push({
          id: rel.b_id,
          title: bTitle,
          type: rel.b_type,
          href: rel.b_type === 'memory' ? `/memory/${rel.b_id}` : '/beliefs',
        });
      }

      items.push({
        id: `statement_relationship:${rel.id}`,
        kind: 'statement_relationship',
        title: `Relationship: ${rel.relation.replace('_', ' ').toUpperCase()} between statements`,
        categoryLabel: `Relationship (${rel.relation})`,
        summary: rel.explanation,
        createdAt: rel.created_at,
        status: isPending ? 'pending' : isApproved ? 'approved' : 'dismissed',
        reviewedAt: rel.reviewed_at,
        proposal: `Record confirmed connection (${rel.relation}) between "${aTitle}" and "${bTitle}".`,
        rationale: rel.explanation || `Derived from ${rel.source} analysis.`,
        supportingRecords: supporting,
        uncertainties: rel.source === 'model'
          ? 'Identified by AI semantic analysis; may conflate situational tension with fundamental conflict.'
          : 'Detected via deterministic keyword pattern rules.',
        impactExplanation: 'Approving cements this relationship in your Evidence Graph and Relationships view. Dismissing removes it from suggestions.',
        sourceDeleted: !aRec || !bRec,
        raw: { relationship: rel },
      });
    }

    // =========================================================================
    // 4. Evidence Graph Inferred Connections
    // =========================================================================
    const rawGraph = buildEvidenceGraph(memories, beliefs, decisions);
    for (const edge of rawGraph.edges) {
      if (edge.basis === 'inferred') {
        const conf = confirmationMap.get(edge.id);
        const isPending = !conf;
        const isApproved = conf?.status === 'confirmed';
        const isDismissed = conf?.status === 'dismissed';

        const sourceRawId = edge.source.split(':')[1];
        const targetRawId = edge.target.split(':')[1];
        const sourceMem = memoryMap.get(sourceRawId);
        const sourceBelief = beliefMap.get(sourceRawId);
        const targetMem = memoryMap.get(targetRawId);
        const targetBelief = beliefMap.get(targetRawId);

        const supporting: SupportingRecordRef[] = [];
        if (sourceMem) supporting.push({ id: sourceMem.id, title: sourceMem.title, type: 'memory', href: `/memory/${sourceMem.id}` });
        else if (sourceBelief) supporting.push({ id: sourceBelief.id, title: sourceBelief.statement, type: 'belief', href: '/beliefs' });

        if (targetMem) supporting.push({ id: targetMem.id, title: targetMem.title, type: 'memory', href: `/memory/${targetMem.id}` });
        else if (targetBelief) supporting.push({ id: targetBelief.id, title: targetBelief.statement, type: 'belief', href: '/beliefs' });

        items.push({
          id: `graph_edge:${edge.id}`,
          kind: 'graph_edge',
          title: `Graph Connection: ${edge.label}`,
          categoryLabel: 'Graph Connection',
          summary: edge.trace,
          createdAt: conf?.created_at || new Date().toISOString(),
          status: isPending ? 'pending' : isApproved ? 'approved' : 'dismissed',
          reviewedAt: conf?.created_at,
          proposal: `Confirm connection "${edge.label}" between ${supporting[0]?.title ?? 'Source'} and ${supporting[1]?.title ?? 'Target'}.`,
          rationale: edge.trace,
          supportingRecords: supporting,
          uncertainties: 'Inferred by keyword matching; context may differ from apparent semantic overlap.',
          impactExplanation: 'Approving marks this as a user-confirmed edge on the Evidence Graph. Dismissing suppresses the connection.',
          sourceDeleted: supporting.length < 2,
          raw: {
            edge: {
              id: edge.id,
              source: edge.source,
              target: edge.target,
              kind: edge.kind,
              label: edge.label,
              trace: edge.trace,
            },
          },
        });
      }
    }

    // =========================================================================
    // 5. Decision Belief Proposals
    // =========================================================================
    for (const d of decisions) {
      if (Array.isArray(d.proposals)) {
        for (const p of d.proposals) {
          const isPending = p.status === 'pending';
          const isApproved = p.status === 'approved';
          const isDismissed = p.status === 'dismissed';
          const targetBelief = beliefMap.get(p.beliefId);

          const supporting: SupportingRecordRef[] = [
            {
              id: d.id,
              title: d.title,
              type: 'decision',
              href: `/decision/${d.id}`,
              excerpt: d.context.slice(0, 100) + '…',
            },
          ];
          if (targetBelief) {
            supporting.push({
              id: targetBelief.id,
              title: targetBelief.statement,
              type: 'belief',
              href: '/beliefs',
            });
          }

          items.push({
            id: `decision_proposal:${d.id}:${p.id}`,
            kind: 'decision_proposal',
            title: `Belief Adjustment from Decision: "${d.title}"`,
            categoryLabel: 'Belief Adjustment',
            summary: `${p.beliefStatement}: ${p.change}`,
            createdAt: p.createdAt,
            status: isPending ? 'pending' : isApproved ? 'approved' : 'dismissed',
            reviewedAt: p.resolvedAt,
            proposal: `Adjust belief "${p.beliefStatement}": ${p.change}`,
            rationale: p.reason,
            supportingRecords: supporting,
            uncertainties: 'Suggested based on your outcome reflection for this decision.',
            impactExplanation: 'Approving adjusts your belief strength and logs the decision in the belief history. Dismissing leaves the belief unchanged.',
            sourceDeleted: !targetBelief,
            raw: { decision: d, proposal: p },
          });
        }
      }
    }

    // Sort newest first
    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return items;
  },

  /**
   * Approve a review item.
   * Modifies real system state and guards against stale source records.
   */
  async approve(item: UnifiedReviewItem, editedText?: string): Promise<void> {
    if (item.sourceDeleted) {
      throw new Error('Cannot approve item: The underlying source record has been deleted.');
    }

    switch (item.kind) {
      case 'belief_suggestion': {
        const b = item.raw.belief;
        if (!b) throw new Error('Belief data missing');
        if (editedText && editedText.trim() && editedText !== b.statement) {
          await beliefsService.update(b.id, {
            statement: editedText.trim(),
            description: b.description || '',
            kind: b.kind,
            category: b.category,
            strength: b.strength,
            last_reviewed: new Date().toISOString(),
          });
        }
        await beliefsService.confirmSuggestion(b.id);
        break;
      }

      case 'interpretation_flag': {
        const flag = item.raw.flag;
        if (!flag) throw new Error('Flag data missing');
        if (editedText && editedText.trim() && editedText !== flag.correction_note) {
          await flagsService.amend(flag.id, { correction_note: editedText.trim() });
        }
        await flagsService.setStatus(flag.id, 'confirmed');
        break;
      }

      case 'statement_relationship': {
        const rel = item.raw.relationship;
        if (!rel) throw new Error('Relationship data missing');
        if (editedText && editedText.trim() && editedText !== rel.explanation) {
          await relationshipsService.amendExplanation(rel.id, editedText.trim());
        }
        await relationshipsService.setStatus(rel.id, 'confirmed');
        break;
      }

      case 'graph_edge': {
        const edge = item.raw.edge;
        if (!edge) throw new Error('Edge data missing');
        await edgeConfirmationsService.decide({
          edge_key: edge.id,
          source_id: edge.source,
          target_id: edge.target,
          kind: edge.kind as any,
          status: 'confirmed',
        });
        break;
      }

      case 'decision_proposal': {
        const d = item.raw.decision;
        const p = item.raw.proposal;
        if (!d || !p) throw new Error('Proposal data missing');
        const approvedProp: BeliefProposal = {
          ...p,
          status: 'approved',
          resolvedAt: new Date().toISOString(),
        };
        await decisionsService.applyApprovedProposal(d.id, approvedProp);
        break;
      }
    }

    // Record audit entry in review_actions_log
    try {
      await supabase.from('review_actions_log').insert({
        item_id: item.id,
        item_kind: item.kind,
        action: 'approved',
        decision_context: {
          title: item.title,
          proposal: item.proposal,
          edited: !!editedText,
        },
      });
    } catch {
      // Non-blocking
    }
  },

  /**
   * Dismiss a review item.
   * Dismissal is persisted permanently so it does not keep reappearing as pending.
   */
  async dismiss(item: UnifiedReviewItem): Promise<void> {
    switch (item.kind) {
      case 'belief_suggestion': {
        const b = item.raw.belief;
        if (b) await beliefsService.dismissSuggestion(b.id);
        break;
      }

      case 'interpretation_flag': {
        const flag = item.raw.flag;
        if (flag) await flagsService.setStatus(flag.id, 'dismissed');
        break;
      }

      case 'statement_relationship': {
        const rel = item.raw.relationship;
        if (rel) await relationshipsService.setStatus(rel.id, 'dismissed');
        break;
      }

      case 'graph_edge': {
        const edge = item.raw.edge;
        if (edge) {
          await edgeConfirmationsService.decide({
            edge_key: edge.id,
            source_id: edge.source,
            target_id: edge.target,
            kind: edge.kind as any,
            status: 'dismissed',
          });
        }
        break;
      }

      case 'decision_proposal': {
        const d = item.raw.decision;
        const p = item.raw.proposal;
        if (d && p) {
          const dismissedProp: BeliefProposal = {
            ...p,
            status: 'dismissed',
            resolvedAt: new Date().toISOString(),
          };
          await decisionsService.saveProposal(d.id, dismissedProp);
        }
        break;
      }
    }

    // Record audit entry in review_actions_log
    try {
      await supabase.from('review_actions_log').insert({
        item_id: item.id,
        item_kind: item.kind,
        action: 'dismissed',
        decision_context: {
          title: item.title,
          proposal: item.proposal,
        },
      });
    } catch {
      // Non-blocking
    }
  },
};
