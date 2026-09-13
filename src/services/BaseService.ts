/**
 * BaseService encapsula la lógica común, manejo de errores
 * y dependencias globales que pueden ser heredadas por todos los demás servicios.
 */
export abstract class BaseService {
  protected basePath: string;

  constructor(basePath: string = '') {
    this.basePath = basePath;
  }

  /**
   * Método de log general para la aplicación.
   * @param message Mensaje a registrar.
   * @param info Objeto opcional de información adicional.
   */
  protected log(message: string, info?: any): void {
    if (import.meta.env.DEV) {
      console.log(`[${this.constructor.name}] ${message}`, info || '');
    }
  }

  /**
   * Captura y unifica el manejo de errores para peticiones.
   * @param error Objeto de error o mensaje capturado.
   */
  protected handleError(error: any): void {
    console.error(`[${this.constructor.name}] Error detectado:`, error);
    // TODO: Enviar al monitor de errores de la empresa (ej: Sentry)
  }
}
