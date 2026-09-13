import { Document, Packer, Paragraph, TextRun, AlignmentType, convertInchesToTwip } from "docx";
import { saveAs } from "file-saver";
import { BaseService } from './BaseService';

// Interfaces for mock logic since AIAssistantService doesn't have a rigid structure exported yet
export interface DocumentSegment {
  text: string;
  isRedacted?: boolean;
}

export class WordExportService extends BaseService {
  constructor() {
    super();
  }

  /**
   * Genera un archivo Word físico adhiriéndose al formato SCJN / Nuevo León.
   * Utiliza la estandarización Arial 12, interlineado 1.5 y testado de datos.
   */
  public async exportToWord(): Promise<void> {
    this.log('Iniciando construcción física de .docx');

    try {
      // Configuraciones institucionales
      const doc = new Document({
        creator: "LexIA Pro - Poder Judicial",
        title: "Sentencia Definitiva MOC-SCJN",
        description: "Documento oficial generado con Inteligencia Artificial Criptográfica",
        sections: [{
          properties: {
            page: {
              margin: {
                top: convertInchesToTwip(1),
                right: convertInchesToTwip(1),
                bottom: convertInchesToTwip(1),
                left: convertInchesToTwip(1.2), // Margen izquierdo para empastado
              },
            },
          },
          children: [
            // Encabezado Centrado
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: "PODER JUDICIAL DEL ESTADO DE NUEVO LEÓN",
                  font: "Arial",
                  size: 24, // 12pt * 2
                  bold: true,
                })
              ],
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 400 },
              children: [
                new TextRun({
                  text: "SENTENCIA DEFINITIVA",
                  font: "Arial",
                  size: 24,
                  bold: true,
                })
              ],
            }),
            
            // Cuerpo del Documento (Con ejemplos testados)
            new Paragraph({
              alignment: AlignmentType.JUSTIFIED,
              spacing: { line: 360 }, // 1.5 line spacing (240 * 1.5)
              children: [
                new TextRun({
                  text: "En la ciudad de Monterrey, Nuevo León, siendo el día doce de octubre del año dos mil veintitrés, se dictamina el presente fallo relativo al expediente 452/2023. ",
                  font: "Arial",
                  size: 24,
                }),
              ],
            }),

            new Paragraph({
              alignment: AlignmentType.JUSTIFIED,
              spacing: { line: 360, before: 200 },
              children: [
                new TextRun({
                  text: "Se hace constar que el C. ",
                  font: "Arial",
                  size: 24,
                }),
                new TextRun({
                  text: "[NOMBRE_REDACTADO_IMPLICADO]",
                  font: "Arial",
                  size: 24,
                  bold: true,
                  color: "B91C1C",
                  shading: { type: "solid", fill: "FEE2E2", color: "FEE2E2" } // Red highlight for redacted
                }),
                new TextRun({
                  text: ", con domicilio en ",
                  font: "Arial",
                  size: 24,
                }),
                new TextRun({
                  text: "[CALLE_Y_NUMERO_OCULTO]",
                  font: "Arial",
                  size: 24,
                  bold: true,
                  color: "B91C1C",
                  shading: { type: "solid", fill: "FEE2E2", color: "FEE2E2" }
                }),
                new TextRun({
                  text: ", comparece ante este tribunal.",
                  font: "Arial",
                  size: 24,
                }),
              ],
            }),

            new Paragraph({
              alignment: AlignmentType.JUSTIFIED,
              spacing: { line: 360, before: 200 },
              children: [
                new TextRun({
                  text: "RESULTANDO: Que habiéndose cumplido con las formalidades esenciales del procedimiento...",
                  font: "Arial",
                  size: 24,
                }),
              ],
            }),

            // Footer / Signatures
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 800 },
              children: [
                new TextRun({
                  text: "___________________________________",
                  font: "Arial",
                  size: 24,
                }),
              ],
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: "Firma de la Autoridad Competente",
                  font: "Arial",
                  size: 20,
                  italics: true,
                  color: "64748B"
                }),
              ],
            }),
          ]
        }]
      });

      // Compilar a formato Blob binario
      const blob = await Packer.toBlob(doc);
      
      // Descargar el archivo via file-saver
      saveAs(blob, "Sentencia_Oficial_PJENL_123.docx");
      
      this.log("Archivo exportado exitosamente.");

    } catch (e) {
      this.handleError(e);
      alert("Error en la compilación del archivo Word.");
    }
  }
}
