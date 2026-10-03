import 'dotenv/config';
import dotenv from 'dotenv';
import { LEGAL_REFERENCES } from '../shared/legalTasks.js';
import type { ReferenceId } from '../shared/legalTasks.js';
import { KnowledgeService } from '../server/services/KnowledgeService.js';
dotenv.config({ path: '.env.local', quiet: true });
const knowledge = new KnowledgeService();
let missing = 0;
for (const id of Object.keys(LEGAL_REFERENCES) as ReferenceId[]) {
  try {
    const [reference] = await knowledge.readReferences([id]);
    console.log(`OK ${reference.filename}: ${reference.content.length} caracteres; SHA-256 ${reference.sha256}`);
  } catch { missing++; console.log(`ERROR ${LEGAL_REFERENCES[id].file}: ausente, vacío o ilegible`); }
}
console.log(`Referencias verificadas: ${Object.keys(LEGAL_REFERENCES).length - missing}/${Object.keys(LEGAL_REFERENCES).length}. No se muestra contenido.`);
if (missing) process.exitCode = 1;
