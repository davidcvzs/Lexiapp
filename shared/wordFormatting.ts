import { validateOfficialMarks } from './officialMarking.js';
import type { OfficialMark } from './officialMarking.js';

export const WORD_PROFILE_IDS = ['judicial', 'judicialDouble', 'transcript647'] as const;
export type WordProfileId = typeof WORD_PROFILE_IDS[number];
export interface WordFormat { profile: WordProfileId; court?: string; marks: OfficialMark[] }
export interface WordProfile {
  page: { width: number; height: number };
  margins: { top: number; right: number; bottom: number; left: number; header: number; footer: number };
  font: string; size: number; line: number; before: number; after: number; firstLine: number;
  alignment: 'left' | 'both'; pageNumbers: boolean;
}
/** Dimensions are OOXML twips. Judicial follows Blueprint; transcript647 follows the supplied model's NormalWeb style. */
export const WORD_PROFILES: Record<WordProfileId, WordProfile> = {
  judicial: { page: { width: 12240, height: 15840 }, margins: { top: 1701, right: 1417, bottom: 1417, left: 1701, header: 708, footer: 708 },
    font: 'Times New Roman', size: 24, line: 360, before: 0, after: 0, firstLine: 709, alignment: 'both', pageNumbers: true },
  judicialDouble: { page: { width: 12240, height: 15840 }, margins: { top: 1701, right: 1417, bottom: 1417, left: 1701, header: 708, footer: 708 },
    font: 'Times New Roman', size: 24, line: 480, before: 0, after: 0, firstLine: 709, alignment: 'both', pageNumbers: true },
  transcript647: { page: { width: 12240, height: 15840 }, margins: { top: 1440, right: 1800, bottom: 1440, left: 1800, header: 720, footer: 720 },
    font: 'Times New Roman', size: 24, line: 240, before: 100, after: 100, firstLine: 0, alignment: 'left', pageNumbers: false },
};

export function parseWordFormat(text: string, value: unknown): WordFormat {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Formato Word inválido.');
  const format = value as Record<string, unknown>;
  if (typeof format.profile !== 'string' || !(WORD_PROFILE_IDS as readonly string[]).includes(format.profile)) throw new Error('Elige un perfil Word válido.');
  if (format.court !== undefined && (typeof format.court !== 'string' || format.court.length > 300 || /[\r\n\t]/.test(format.court))) throw new Error('Juzgado del formato Word inválido.');
  return { profile: format.profile as WordProfileId, ...(format.court !== undefined ? { court: format.court as string } : {}), marks: validateOfficialMarks(text, format.marks ?? []) };
}
