import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { getSystemPrompt } from '../legal/rules';
import { KnowledgeService } from './KnowledgeService';

dotenv.config({ path: '.env.local' });

export class OpenAIService {
  private openai: any;
  private readonly defaultModel: string;
  private knowledgeService: KnowledgeService;

  constructor() {
    // The key must come from the server-side environment
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || "missing"
    });
    this.defaultModel = process.env.OPENAI_MODEL || 'gpt-5.6-sol';
    this.knowledgeService = new KnowledgeService();
  }

  public async generateDocument(instruction: string, transcript: string, mode: string = 'GENERAL', history: string[] = []): Promise<string> {
    const systemPrompt = getSystemPrompt(mode);
    
    // Si el modo es DIRECTORIO, interceptar y usar consulta determinista.
    if (mode === 'DIRECTORIO') {
       try {
         const data = await this.knowledgeService.queryDirectoryExcel(instruction);
         return JSON.stringify(data, null, 2);
       } catch (err: any) {
         return `Error consultando directorio: ${err.message}`;
       }
    }

    const knowledgeText = await this.knowledgeService.getKnowledgeText(mode);
    
    let contextStr = '\\n--- TRANSCRIPCION/FUENTE ORIGINAL ---\\n' + transcript + '\\n-----------------------------------\\n';
    if (knowledgeText) {
       contextStr += '\\n--- CONOCIMIENTO DE REFERENCIA ---\\n' + knowledgeText + '\\n-----------------------------------\\n';
    }

    if (history.length > 0) {
      // Estructuracion por caso como se pidio: caseId, documentType, etc. 
      // Por ahora concatenamos con etiquetas si vienen planas, pero preparamos el contexto.
      contextStr += '\\n--- HISTORIAL DE INSTRUCCIONES PREVIAS ---\\n' + history.join('\\n') + '\\n------------------------------------------\\n';
    }
    contextStr += '\\nINSTRUCCION ACTUAL: ' + instruction;

    const reasoningEffort = process.env.OPENAI_REASONING_EFFORT || 'medium';

    try {
      // Usando Responses API (SDK openai actual)
      const response = await this.openai.responses.create({
        model: this.defaultModel,
        instructions: systemPrompt,
        input: contextStr,
        // Opciones adicionales segun Responses API si aplican:
        // reasoning_effort: reasoningEffort,
        // web_search: instruction.includes('buscar') ? true : undefined
      });

      return response.output || response.text || response.choices?.[0]?.message?.content || JSON.stringify(response);
    } catch (error) {
      console.error('Error en OpenAI Service:', error);
      throw error;
    }
  }

  // File search / Web search nativos de Responses API expuestos si se necesitan luego:
  public async generateWithTools(instruction: string, context: string, tools: any[]): Promise<string> {
     const response = await this.openai.responses.create({
        model: this.defaultModel,
        instructions: getSystemPrompt('GENERAL'),
        input: context + '\\n' + instruction,
        tools: tools
     });
     return response.output || response.text || '';
  }
}
