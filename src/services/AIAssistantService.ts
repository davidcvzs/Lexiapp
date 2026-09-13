import { BaseService } from './BaseService';
import { GoogleGenAI } from '@google/genai';

export interface DocumentSection {
  title: string;
  content: string;
}

export interface DocumentState {
  transcription: string;
  documentType: string;
  completedSections: DocumentSection[];
  currentStep: number;
  userInstructions: string[];
  searchResults: any[];
  formatPreferences: Record<string, any>;
}

export class AIAssistantService extends BaseService {
  private currentState: DocumentState;

  constructor() {
    super();
    this.currentState = {
      transcription: '',
      documentType: '',
      completedSections: [],
      currentStep: 1,
      userInstructions: [],
      searchResults: [],
      formatPreferences: {}
    };
  }

  /**
   * Inicializa la sesión de IA con la transcripción obtenida.
   * @param transcription Texto completo de la transcripción inicial.
   */
  public initializeSession(transcription: string) {
    this.currentState.transcription = transcription;
    this.log('Sesión inicializada con transcripción.', { chars: transcription.length });
  }

  /**
   * Envía una instrucción o paso al API de Asistente, adjuntando todo el contexto anterior.
   * @param instruction Texto de instrucción. Ej: "Redacta el RESULTANDO"
   */
  public async sendInstruction(instruction: string): Promise<string> {
    this.log(`Instrucción enviada a la IA: ${instruction}`);
    try {
      this.currentState.userInstructions.push(instruction);

      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) {
        this.log(`No se encontró VITE_GEMINI_API_KEY, usando mock.`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        return `Respuesta simulada de la IA para: "${instruction}"`;
      }

      this.log(`Llamando a Gemini 1.5 Pro (Asistente)...`);
      const ai = new GoogleGenAI({ apiKey });

      let contextPrompt = `Eres un asistente legal experto del Poder Judicial del Estado de Nuevo León (PJENL).\n`;
      contextPrompt += `Tu objetivo es elaborar exclusivamente actas judiciales conforme al método habitual, a partir de transcripciones, datos de audiencia o formatos previos.\n`;
      contextPrompt += `\nREGLAS GENERALES:\n`;
      contextPrompt += `- Trabajar estrictamente con los datos proporcionados. NUNCA inventar nombres, fechas, horas, salas, sedes, carpetas, comparecientes, intervenciones, resoluciones ni hechos.\n`;
      contextPrompt += `- Corregir ortografía y sintaxis sin alterar el sentido jurídico ni agregar información.\n`;
      contextPrompt += `- Usar un encabezado compacto y mantener los datos juntos.\n`;
      contextPrompt += `- Incluir siempre únicamente los apercibimientos jurídicamente aplicables con su artículo correspondiente.\n`;
      contextPrompt += `\nACTAS EN BLOQUE:\n`;
      contextPrompt += `- Colocar el encabezado "ACTA EN BLOQUE". Agrupar los asuntos conforme al formato indicado.\n`;
      contextPrompt += `\nCONTROLES DE DETENCIÓN (incluir si aplica):\n`;
      contextPrompt += `1. Legalidad de la detención.\n`;
      contextPrompt += `2. Formulación de imputación.\n`;
      contextPrompt += `3. Hechos expuestos por el Ministerio Público, de forma textual.\n`;
      contextPrompt += `4. Resolución de vinculación a proceso o no vinculación.\n`;
      contextPrompt += `5. Delito y clasificación jurídica.\n`;
      contextPrompt += `6. Forma de intervención (ej. autor material directo y dolo, artículos 39 frac. I, y 27).\n`;
      contextPrompt += `7. Medidas cautelares (con fracciones correspondientes).\n`;
      contextPrompt += `8. Plazo para cierre de investigación.\n`;
      contextPrompt += `9. Apelabilidad.\n\n`;
      contextPrompt += `A continuación te presento la transcripción de un caso o audiencia:\n\n---\n`;
      contextPrompt += `${this.currentState.transcription || 'Sin transcripción provista.'}\n---\n\n`;
      
      const previous = this.currentState.userInstructions.slice(0, -1);
      if (previous.length > 0) {
        contextPrompt += `Historial de instrucciones previas:\n`;
        previous.forEach(inst => {
            contextPrompt += `- ${inst}\n`;
        });
      }
      
      contextPrompt += `\nNueva instrucción del usuario: ${instruction}\n`;
      contextPrompt += `\nPor favor, responde redactando el texto solicitado o respondiendo la pregunta según corresponda.`;

      const response = await ai.models.generateContent({
        model: 'gemini-1.5-pro',
        contents: contextPrompt
      });

      return response.text || '';
    } catch (e) {
      this.handleError(e);
      return "Hubo un error al procesar tu solicitud con Gemini.";
    }
  }

  public getState(): DocumentState {
    return this.currentState;
  }
}
