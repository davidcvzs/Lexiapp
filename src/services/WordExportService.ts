import { Document, Packer, Paragraph, TextRun, AlignmentType, convertInchesToTwip } from "docx";
import { saveAs } from "file-saver";
import { BaseService } from './BaseService';

export class WordExportService extends BaseService {
  constructor() {
    super();
  }

  public async exportToWord(content?: string): Promise<void> {
    this.log('Iniciando construccion fisica de .docx con marcado rojo real');
    if (!content) {
       content = "Contenido generado por IA...";
    }

    try {
      let entitiesToRedact: string[] = [];
      try {
        const response = await fetch('/api/ai/redact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content })
        });
        if (response.ok) {
          const data = await response.json();
          if (data.entities && Array.isArray(data.entities)) {
             entitiesToRedact = data.entities;
          }
        }
      } catch (err) {
        console.error("No se pudo contactar endpoint de redactado", err);
      }

      // Ordenar por longitud descendente para que no se pisen matches cortos dentro de largos
      entitiesToRedact.sort((a, b) => b.length - a.length);

      // Algoritmo rudimentario para separar runs
      let textRuns: {text: string, red: boolean}[] = [];

      // A better approach is to use regex or simply split the text
      // We will tokenize the text by the entities
      // To avoid complexity, we can do a simple search and replace strategy generating markers,
      // but let's build the runs dynamically.
      
      const regexSegments = entitiesToRedact.filter(e => e.trim().length > 0).map(e => {
         return e.replace(/[.*+?^$\\{\\}()|[\\]\\\\]/g, '\\\\$&');
      });
      
      if (regexSegments.length > 0) {
          const combinedRegex = new RegExp("(" + regexSegments.join('|') + ")", 'g');
          let lastIndex = 0;
          let match;
          
          while ((match = combinedRegex.exec(content)) !== null) {
              if (match.index > lastIndex) {
                 textRuns.push({ text: content.substring(lastIndex, match.index), red: false });
              }
              textRuns.push({ text: match[0], red: true });
              lastIndex = combinedRegex.lastIndex;
          }
          if (lastIndex < content.length) {
              textRuns.push({ text: content.substring(lastIndex), red: false });
          }
      } else {
          textRuns.push({ text: content, red: false });
      }

      const docxRuns = textRuns.map(run => new TextRun({
          text: run.text,
          font: "Arial",
          size: 24, // 12pt
          color: run.red ? "FF0000" : undefined,
      }));

      const doc = new Document({
        creator: "LexIA - Poder Judicial",
        title: "Documento Legal",
        sections: [{
          properties: {
            page: {
              margin: {
                top: convertInchesToTwip(1),
                right: convertInchesToTwip(1),
                bottom: convertInchesToTwip(1),
                left: convertInchesToTwip(1.2),
              },
            },
          },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 400 },
              children: [
                new TextRun({
                  text: "PODER JUDICIAL DEL ESTADO DE NUEVO LEON",
                  font: "Arial",
                  size: 24,
                  bold: true,
                })
              ],
            }),
            new Paragraph({
              alignment: AlignmentType.JUSTIFIED,
              spacing: { line: 360 },
              children: docxRuns,
            })
          ]
        }]
      });

      const blob = await Packer.toBlob(doc);
      saveAs(blob, "Documento_LexIA.docx");
      
      this.log("Archivo exportado exitosamente.");

    } catch (e) {
      this.handleError(e);
      alert("Error en la compilacion del archivo Word.");
    }
  }
}
