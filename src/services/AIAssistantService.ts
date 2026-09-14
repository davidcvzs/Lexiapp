import { BaseService } from './BaseService';

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

  public initializeSession(transcription: string) {
    this.currentState.transcription = transcription;
    this.log('Sesion inicializada con transcripcion.', { chars: transcription.length });
  }

  public async sendInstruction(instruction: string): Promise<string> {
    this.log('Instruccion enviada a la IA (via backend): ' + instruction);
    try {
      this.currentState.userInstructions.push(instruction);
      
      const previous = this.currentState.userInstructions.slice(0, -1);
      
      const response = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instruction: instruction,
          transcript: this.currentState.transcription,
          mode: this.currentState.documentType || 'GENERAL',
          history: previous
        })
      });

      if (!response.ok) {
        throw new Error('Error en el servidor al generar documento.');
      }

      const data = await response.json();
      return data.result || '';
    } catch (e) {
      this.handleError(e);
      return "Hubo un error al procesar tu solicitud con LexIA (OpenAI).";
    }
  }

  public getState(): DocumentState {
    return this.currentState;
  }
}
