import { BaseService } from './BaseService';

export class TranscriptionService extends BaseService {
  constructor() {
    super();
  }

  public async processMedia(file: File): Promise<string> {
    this.log('Iniciando carga de archivo al servidor: ' + file.name);
    try {
      const formData = new FormData();
      formData.append('media', file);

      const response = await fetch('/api/transcription/jobs', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 501) {
          throw new Error('Integración del transcriptor pendiente');
        }
        throw new Error(data.error || 'Error al procesar.');
      }

      // In the future this should return the actual transcript
      return data.transcript || 'Transcripción completada.';
    } catch (e: any) {
      this.handleError(e);
      if (e.message && e.message.includes('Integración del transcriptor pendiente')) {
         throw new Error('Integración del transcriptor pendiente');
      }
      throw new Error('Fallo al transcribir el archivo multimedia: ' + (e as Error).message);
    }
  }
}
