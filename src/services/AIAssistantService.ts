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

  private async fetchWithRetry(url: string, options: RequestInit, retries = 3): Promise<Response> {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(url, options);
        if (response.ok) return response;
        if (response.status === 429 || response.status >= 500) {
           const delay = Math.pow(2, i) * 1000;
           console.warn(`Error API ${response.status}. Reintentando en ${delay}ms...`);
           await new Promise(res => setTimeout(res, delay));
           continue;
        }
        return response; 
      } catch (e) {
        if (i === retries - 1) throw e;
        const delay = Math.pow(2, i) * 1000;
        await new Promise(res => setTimeout(res, delay));
      }
    }
    throw new Error('API Timeout / Network Failure tras múltiples reintentos');
  }

  public async sendInstruction(
    instruction: string, 
    onChunk?: (chunk: string) => void
  ): Promise<string> {
    this.log('Instruccion enviada a la IA: ' + instruction.substring(0, 50) + '...');
    
    // Configuración de endpoints (Ej. OpenAI o Cloudflare Worker) a través de variables de entorno (Vite)
    const apiUrl = import.meta.env?.VITE_AI_API_URL || '/api/ai/generate';
    const apiKey = import.meta.env?.VITE_AI_API_KEY || '';

    try {
      this.currentState.userInstructions.push(instruction);
      
      // Construir payload dinámico (soporte nativo para OpenAI o Backend genérico)
      const isOpenAI = apiUrl.includes('openai.com');
      
      let payload: any = {
        instruction: instruction,
        stream: !!onChunk
      };

      if (isOpenAI) {
        payload = {
          model: "gpt-4o",
          messages: [
            { role: "system", content: "Eres LexIA, un asistente jurídico experto del Poder Judicial del Estado de Nuevo León." },
            { role: "user", content: instruction }
          ],
          stream: !!onChunk
        };
      }

      const response = await this.fetchWithRetry(apiUrl, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Error en el servidor: ${response.status} ${response.statusText}`);
      }

      if (onChunk && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let finalResult = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          
          // Procesamiento básico de eventos SSE
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const dataStr = line.replace('data: ', '').trim();
              if (dataStr === '[DONE]') continue;
              try {
                const parsed = JSON.parse(dataStr);
                const textChunk = parsed.choices?.[0]?.delta?.content || parsed.text || '';
                finalResult += textChunk;
                onChunk(textChunk);
              } catch (err) {
                 // Ignorar fragmentos incompletos
              }
            }
          }
        }
        return finalResult;
      } else {
        const data = await response.json();
        return data.result || data.choices?.[0]?.message?.content || '';
      }
    } catch (e) {
      this.handleError(e as Error);
      alert("Hubo un error de red o de cuota al procesar tu solicitud con la IA.");
      return "";
    }
  }

  public getState(): DocumentState {
    return this.currentState;
  }
}
