import { Document, Packer, Paragraph, TextRun, AlignmentType, convertInchesToTwip } from "docx";
import { saveAs } from "file-saver";
import { BaseService } from './BaseService';

export class WordExportService extends BaseService {
  constructor() {
    super();
  }

  public async exportToWord(content: string, isPublicVersion: boolean): Promise<void> {
    this.log('Iniciando construccion fisica de .docx');
    if (!content) {
       content = "";
    }

    try {
      let textToExport = content;

      if (isPublicVersion) {
        // Mismo regex utilizado en la UI para mantener consistencia
        const piiRegex = /([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+ [A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?|\b\d{2}[\/\-]\d{2}[\/\-]\d{4}\b|\b[A-Z]{4}\d{6}[A-Z0-9]{8}\b)/g;
        textToExport = textToExport.replace(piiRegex, "[ANONIMIZADO]");
      }

      // Separar el contenido en párrafos para el documento Word (por saltos de línea \n)
      const textParagraphs = textToExport.split('\n');

      const docxParagraphs = textParagraphs.map(textLine => {
        return new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { line: 360 }, // Interlineado 1.5 (240 * 1.5)
          children: [
            new TextRun({
              text: textLine,
              font: "Times New Roman",
              size: 24, // 12pt
            })
          ],
        });
      });

      const doc = new Document({
        creator: "Redactor Jurídico AI - Poder Judicial",
        title: "Sentencia Definitiva",
        sections: [{
          properties: {
            page: {
              margin: {
                top: convertInchesToTwip(1),
                right: convertInchesToTwip(1),
                bottom: convertInchesToTwip(1),
                left: convertInchesToTwip(1.2), // Margen estándar de encuadernación
              },
            },
          },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 400 },
              children: [
                new TextRun({
                  text: "PODER JUDICIAL DEL ESTADO DE NUEVO LEÓN",
                  font: "Times New Roman",
                  size: 28, // 14pt (un poco más grande para el encabezado)
                  bold: true,
                })
              ],
            }),
            ...docxParagraphs
          ]
        }]
      });

      const blob = await Packer.toBlob(doc);
      
      const dateStr = new Date().toISOString().split('T')[0];
      const versionStr = isPublicVersion ? 'PUBLICA' : 'OFICIAL';
      const fileName = `Sentencia_Definitiva_${dateStr}_${versionStr}.docx`;
      
      saveAs(blob, fileName);
      
      this.log(`Archivo ${fileName} exportado exitosamente.`);

    } catch (e) {
      this.handleError(e as Error);
      alert("Error en la compilacion del archivo Word.");
    }
  }
}
