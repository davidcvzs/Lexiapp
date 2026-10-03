import type { GenerationProvenance } from './legalTasks.js';
export interface MatterSource { original: string; working: string; contrast: string }
export interface GuidedMatter { id: string; label: string; source?: MatterSource; completed: string[]; speaker: string; receptionClosed: boolean }
export interface GuidedSection { id: string; stepId: string; matterId: string; title: string; start: number; end: number; status: 'draft' | 'accepted' | 'stale'; instruction: string; provenance?: GenerationProvenance }
export interface LegalReference { id: string; matterId: string; title: string; source: 'SCJN' | 'PJENL' | 'DOF' | 'USER'; text: string; url: string }
export interface GuidedWorkflow { version: 1; taskId: string; formatId: string; currentStepId: string; activeMatterId: string; mode: 'individual' | 'combo'; matters: GuidedMatter[]; sections: GuidedSection[]; references: LegalReference[]; userTemplate: string; requestAnalysis: boolean }
export interface GuidedContext {
  stepId: string; action: 'generate' | 'rewrite' | 'fragment' | 'custom'; matter: { id: string; label: string; mode: 'individual' | 'combo'; speaker: string; receptionClosed: boolean };
  sections: { id: string; title: string; content: string; status: GuidedSection['status'] }[];
  references: LegalReference[]; userTemplate: string; requestAnalysis: boolean;
  target?: { sectionId: string; start: number; end: number; text: string };
}
