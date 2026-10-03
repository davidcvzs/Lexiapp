import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { OpenAIService } from './server/services/OpenAIService.js';

async function run() {
  try {
    const s = new OpenAIService();
    const result = await s.generateDocument('Responde hola', '');
    console.log('OK:', result.trim());
  } catch (e) {
    console.error('ERROR:', (e instanceof Error ? e.message : String(e)));
  }
}
run();
