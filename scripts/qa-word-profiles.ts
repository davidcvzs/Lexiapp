import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { formatLiteralTranscript } from '../shared/transcriptSegments.js';
import type { TranscriptSegment } from '../shared/transcriptSegments.js';
import { buildWordArtifact } from '../shared/wordDocument.js';
import type { OfficialMark, OfficialMarkCategory } from '../shared/officialMarking.js';
import type { WordProfileId } from '../shared/wordFormatting.js';

// Local synthetic fixtures for visual review of the phase-4 profiles; never reads credentials, sources or database records.
const folder = resolve('.firebase/phase4-word-profiles');
await mkdir(folder, { recursive: true });

function marksFor(text: string, terms: [string, OfficialMarkCategory][]): OfficialMark[] {
  const marks = terms.flatMap(([term, category]) => {
    const found: OfficialMark[] = [];
    for (let at = text.indexOf(term); at >= 0; at = text.indexOf(term, at + term.length)) found.push({ start: at, end: at + term.length, category });
    return found;
  }).sort((a, b) => a.start - b.start);
  return marks.filter((mark, index) => index === 0 || mark.start >= marks[index - 1].end);
}
const terms: [string, OfficialMarkCategory][] = [['Ana Sintética', 'name'], ['Prueba', 'surname'], ['J.Q.P.', 'initials'], ['«el Ensayo»', 'nickname'],
  ['calle Ficticia 123', 'address'], ['Marca Demo', 'vehicle_brand'], ['SER-0000-TEST', 'serial'], ['1 de enero de 2000', 'date'], ['34 años', 'age']];

// Long transcript: 260 segments (> one Worker page), long and short turns, speakers only where "identified".
const segments: TranscriptSegment[] = Array.from({ length: 260 }, (_, index) => ({
  index, start: index * 7.5, end: index * 7.5 + 6.8,
  text: index % 13 === 0
    ? `Ana Sintética Prueba manifestó que el día 1 de enero de 2000, con 34 años, vio a J.Q.P., conocido como «el Ensayo», en calle Ficticia 123, junto a un vehículo Marca Demo con serie SER-0000-TEST. Este turno es deliberadamente largo para comprobar el ajuste de línea, la continuidad entre páginas y que ninguna palabra quede cortada en el margen derecho del documento generado.`
    : index % 5 === 0 ? 'Sí.' : `Intervención sintética número ${index}: texto literal conservado con acentos á é í ó ú, eñe ñ y diéresis ü.`,
  ...(index % 3 === 0 ? { speaker: index % 2 === 0 ? 'Voz sintética A' : 'Voz sintética B' } : {}),
}));
const transcript = formatLiteralTranscript(segments);

const judicial = ['RESULTANDO', '', ...Array.from({ length: 6 }, (_, i) => `${i + 1}. Ana Sintética Prueba compareció el 1 de enero de 2000 y declaró tener 34 años; refirió domicilio en calle Ficticia 123. Este párrafo sintético verifica justificación, sangría de primera línea, interlineado y paginación en papel Carta sin contenido cortado.`),
  '', 'CONSIDERANDO', '', ...Array.from({ length: 8 }, (_, i) => `${['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'][i]}. Texto sintético de considerando con el vehículo Marca Demo, serie SER-0000-TEST, y la persona apodada «el Ensayo» (J.Q.P.). Se repite para forzar saltos de página y comprobar el pie con número de página.`),
  '', 'RESUELVE', '', 'PRIMERO. Resolutivo sintético.', 'SEGUNDO. Notifíquese.'].join('\n');

const cases: { profile: WordProfileId; text: string; court?: string; caseNumber?: string; documentType?: string }[] = [
  { profile: 'transcript647', text: transcript, caseNumber: 'TEST-QA-647' },
  { profile: 'judicial', text: judicial, court: 'Juzgado Sintético de Prueba', caseNumber: 'TEST-QA-J', documentType: 'Sentencia' },
  { profile: 'judicialDouble', text: judicial, court: 'Juzgado Sintético de Prueba', caseNumber: 'TEST-QA-J2', documentType: 'Acta' },
];
for (const item of cases) {
  const format = { profile: item.profile, ...(item.court ? { court: item.court } : {}), marks: marksFor(item.text, terms) };
  const artifact = await buildWordArtifact({ text: item.text, format, caseNumber: item.caseNumber, documentType: item.documentType });
  await writeFile(resolve(folder, `${item.profile}.docx`), artifact.bytes);
  console.log(`${item.profile}: ${format.marks.length} marcas, ${artifact.bytes.byteLength} bytes`);
}
console.log(`Archivos sintéticos para revisión visual: ${folder}`);
