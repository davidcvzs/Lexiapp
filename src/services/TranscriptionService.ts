import { BaseService } from './BaseService';
import { GoogleGenAI } from '@google/genai';

export class TranscriptionService extends BaseService {
  constructor() {
    super();
  }

  /**
   * Helper para convertir File a Base64 para Gemini (inlineData)
   */
  private async fileToGenerativePart(file: File): Promise<{ inlineData: { data: string, mimeType: string } }> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          const base64Data = reader.result.split(',')[1];
          resolve({
            inlineData: { data: base64Data, mimeType: file.type || 'audio/mp3' },
          });
        } else {
          reject(new Error("No se pudo leer el archivo."));
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /**
   * Procesa el archivo de video/audio, lo sube y envía a transcribir.
   * @param file El archivo multimedia a procesar.
   */
  public async processMedia(file: File): Promise<string> {
    this.log(`Iniciando carga de archivo: ${file.name}`);
    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

      if (!apiKey) {
        this.log(`No se encontró VITE_GEMINI_API_KEY, usando mock.`);
        // Mock de transcripción (esperar 3 segundos para simular carga)
        await new Promise(resolve => setTimeout(resolve, 3000));
        return `Transcripción simulada para el archivo ${file.name}.\n\n[MOCK] Juez: Se abre la audiencia de la causa 123/2024.\n[MOCK] Defensa: Presente, su señoría.`;
      }

      this.log(`Llamando a Gemini 1.5 Pro...`);
      const ai = new GoogleGenAI({ apiKey });
      
      const audioPart = await this.fileToGenerativePart(file);
      const prompt = "Actúa como un experto transcriptor judicial peruano. Transcribe el siguiente audio con alta precisión. Identifica los hablantes cuando sea posible (ej. JUEZ, FISCAL, DEFENSA, TESTIGO). Entrega SOLO la transcripción, sin introducciones ni comentarios adicionales.";

      const response = await ai.models.generateContent({
        model: 'gemini-1.5-pro',
        contents: [
          {
            role: 'user',
            parts: [audioPart, { text: prompt }]
          }
        ]
      });

      // @google/genai usa la propiedad `text` como string
      return response.text || '';
    } catch (e) {
      this.handleError(e);
      throw new Error(`Fallo al transcribir el archivo multimedia: ${(e as Error).message}`);
    }
  }
}
