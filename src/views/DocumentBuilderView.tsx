import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { 
  Gavel, 
  Download, 
  ShieldCheck, 
  FileText,
  Wand2,
  History,
  Settings,
  Upload,
  Mic,
  Copy,
  Printer
} from 'lucide-react';
import { WordExportService } from '../services/WordExportService';
import { AIAssistantService } from '../services/AIAssistantService';

const wordService = new WordExportService();
const aiAssistant = new AIAssistantService();

export const DocumentBuilderView: React.FC = () => {  
  const location = useLocation();
  const [documentContent, setDocumentContent] = useState<string>('Esperando generación de acta...');
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    const transcriptionData = location.state?.transcriptionData;
    if (transcriptionData) {
      aiAssistant.initializeSession(transcriptionData);
      setDocumentContent('Transcripción lista. Presione "Generar Proyecto" para iniciar.');
    }
  }, [location.state]);

  const handleGenerateAct = async () => {
    setIsGenerating(true);
    setDocumentContent('Generando acta judicial con IA (analizando legalidad, imputación, etc.)...');
    
    // Conectar AIAssistantService para generar el acta
    const prompt = "Por favor, elabora el Acta Judicial siguiendo estrictamente las reglas del PJENL. Utiliza la transcripción provista.";
    const result = await aiAssistant.sendInstruction(prompt);
    
    setDocumentContent(result);
    setIsGenerating(false);
  };

  const handleExport = async () => {
    try {
      await wordService.exportToWord();
    } catch (error) {
      console.error(error);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(documentContent);
    alert('Texto copiado al portapapeles');
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f5f8', display: 'flex', flexDirection: 'column', fontFamily: 'Inter, sans-serif' }}>
      {/* Header Navigation */}
      <header style={{ position: 'sticky', top: 0, zIndex: 50, backgroundColor: 'white', borderBottom: '1px solid #e2e8f0', padding: '0.75rem 1rem' }}>
        <div style={{ maxWidth: '80rem', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: '2.5rem', height: '2.5rem', backgroundColor: '#000066', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Gavel size={24} color="#C5A059" />
            </div>
            <div>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.025em' }}>Redactor Jurídico AI</h1>
              <p style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 600, margin: 0 }}>Poder Judicial del Estado de Nuevo León</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: 'rgba(197,160,89,0.1)', padding: '0.375rem 0.75rem', borderRadius: '9999px' }}>
              <Wand2 size={14} color="#000066" />
              <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#000066', textTransform: 'uppercase', letterSpacing: '0.05em' }}>IA Asistida 2026</span>
            </div>
            <button style={{ padding: '0.5rem', borderRadius: '9999px', border: 'none', background: 'transparent', cursor: 'pointer', color: '#475569', transition: 'color 0.2s' }}><History size={20} /></button>
            <button style={{ padding: '0.5rem', borderRadius: '9999px', border: 'none', background: 'transparent', cursor: 'pointer', color: '#475569', transition: 'color 0.2s' }}><Settings size={20} /></button>
          </div>
        </div>
      </header>

      {/* Main Content Grid */}
      <main style={{ flex: 1, maxWidth: '80rem', width: '100%', margin: '0 auto', padding: '1.5rem 1rem', display: 'grid', gridTemplateColumns: 'repeat(12, minmax(0, 1fr))', gap: '1.5rem' }}>
        
        {/* Left Column: Input & Configuration */}
        <aside style={{ gridColumn: 'span 5 / span 5', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Configuration Section */}
          <section style={{ backgroundColor: 'white', padding: '1.25rem', borderRadius: '0.75rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
            <h2 style={{ fontSize: '0.875rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#0f172a', marginBottom: '1.25rem' }}>Configuración del Documento</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '1rem' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0f172a' }}>Tipo de Resolución</span>
                  <select style={{ borderRadius: '0.5rem', border: '1px solid #cbd5e1', padding: '0.5rem', fontSize: '0.875rem', color: '#0f172a', backgroundColor: '#ffffff', outline: 'none' }}>
                    <option style={{ backgroundColor: '#ffffff', color: '#0f172a' }}>Acta Judicial (Control Detención)</option>
                    <option style={{ backgroundColor: '#ffffff', color: '#0f172a' }}>Acta en Bloque</option>
                    <option style={{ backgroundColor: '#ffffff', color: '#0f172a' }}>Sentencia Definitiva</option>
                  </select>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0f172a' }}>Materia</span>
                  <select style={{ borderRadius: '0.5rem', border: '1px solid #cbd5e1', padding: '0.5rem', fontSize: '0.875rem', color: '#0f172a', backgroundColor: '#ffffff', outline: 'none' }}>
                    <option style={{ backgroundColor: '#ffffff', color: '#0f172a' }}>Penal</option>
                    <option style={{ backgroundColor: '#ffffff', color: '#0f172a' }}>Civil</option>
                    <option style={{ backgroundColor: '#ffffff', color: '#0f172a' }}>Familiar</option>
                  </select>
                </label>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', backgroundColor: '#f8fafc', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0f172a' }}>Formato Lectura Fácil</span>
                  <span style={{ fontSize: '0.625rem', color: '#475569', fontWeight: 600 }}>Protocolo PJENL 2026 para grupos vulnerables</span>
                </div>
                <label style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input type="checkbox" defaultChecked style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
                  <div style={{ width: '2.75rem', height: '1.5rem', backgroundColor: '#000066', borderRadius: '9999px', position: 'relative' }}>
                    <div style={{ position: 'absolute', top: '2px', left: '22px', backgroundColor: 'white', borderRadius: '50%', width: '1.25rem', height: '1.25rem' }}></div>
                  </div>
                </label>
              </div>
            </div>
          </section>

          {/* Transcription Section */}
          <section style={{ backgroundColor: 'white', padding: '1.25rem', borderRadius: '0.75rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', flex: 1, minHeight: '400px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '0.875rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#0f172a' }}>Insumos del Caso</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0.125rem 0.5rem', backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '9999px' }}>
                  <ShieldCheck size={12} color="#059669" />
                  <span style={{ fontSize: '0.5625rem', fontWeight: 800, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Entorno Seguro</span>
                </div>
                <button style={{ fontSize: '0.75rem', fontWeight: 800, color: '#000066', display: 'flex', alignItems: 'center', gap: '0.25rem', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                  <Upload size={14} /> Importar
                </button>
              </div>
            </div>
            
            <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column' }}>
              <textarea 
                value={location.state?.transcriptionData || ""}
                placeholder="Pegue aquí la transcripción de la audiencia, hechos relevantes o el dictamen pericial..."
                style={{ flex: 1, width: '100%', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0', fontSize: '0.875rem', resize: 'none', backgroundColor: '#f8fafc', color: '#0f172a', outline: 'none' }}
                onChange={() => {}}
              />
              <div style={{ position: 'absolute', bottom: '0.75rem', right: '0.75rem' }}>
                <button style={{ padding: '0.5rem', backgroundColor: 'white', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', borderRadius: '9999px', border: '1px solid #e2e8f0', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Mic size={18} color="#000066" />
                </button>
              </div>
            </div>

            <div style={{ marginTop: '1rem' }}>
              <button 
                onClick={handleGenerateAct}
                disabled={isGenerating}
                style={{ width: '100%', backgroundColor: '#000066', color: 'white', fontWeight: 800, fontSize: '1rem', padding: '0.75rem 1rem', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', cursor: isGenerating ? 'not-allowed' : 'pointer', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,102,0.2)', opacity: isGenerating ? 0.7 : 1, transition: 'all 0.2s' }}>
                <Wand2 size={18} />
                {isGenerating ? 'Generando Proyecto...' : 'Generar Proyecto de Sentencia'}
              </button>
              
              <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'flex-start', gap: '0.5rem', padding: '0 0.25rem' }}>
                <ShieldCheck size={14} color="#64748b" style={{ flexShrink: 0, marginTop: '2px' }} />
                <p style={{ fontSize: '0.625rem', lineHeight: 1.5, color: '#475569', fontStyle: 'italic', fontWeight: 600, margin: 0 }}>
                  Toda la información ingresada es confidencial y se procesa exclusivamente para la generación de este proyecto legal bajo protocolos de seguridad del PJENL.
                </p>
              </div>
            </div>
          </section>
        </aside>

        {/* Right Column: Preview Area */}
        <div style={{ gridColumn: 'span 7 / span 7', display: 'flex', flexDirection: 'column', minHeight: '600px' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '0.75rem', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            
            {/* Toolbar Preview */}
            <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f8fafc' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FileText size={18} color="#475569" />
                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#475569', fontStyle: 'italic' }}>Vista Previa del Borrador</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button onClick={handleCopy} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0.375rem 0.75rem', fontSize: '0.75rem', fontWeight: 800, color: '#0f172a', backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '0.5rem', cursor: 'pointer', transition: 'background-color 0.2s' }}>
                  <Copy size={14} /> Copiar Texto
                </button>
                <button onClick={handleExport} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0.375rem 0.75rem', fontSize: '0.75rem', fontWeight: 800, color: '#0f172a', backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '0.5rem', cursor: 'pointer', transition: 'background-color 0.2s' }}>
                  <Download size={14} /> Exportar Word
                </button>
                <button style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0.375rem 0.75rem', fontSize: '0.75rem', fontWeight: 800, color: '#0f172a', backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '0.5rem', cursor: 'pointer', transition: 'background-color 0.2s' }}>
                  <Printer size={14} />
                </button>
              </div>
            </div>

            {/* Legal Document Canvas */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '3rem 4rem', backgroundColor: 'white', fontFamily: '"Times New Roman", Times, serif', lineHeight: 1.6, color: '#0f172a' }}>
              <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
                <div style={{ fontWeight: 800, fontSize: '1.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Poder Judicial del Estado de Nuevo León</div>
                <div style={{ fontSize: '1rem', fontWeight: 600, fontStyle: 'italic', marginTop: '0.5rem' }}>Borrador Asistido por IA - {new Date().toLocaleDateString('es-MX')}</div>
              </div>
              
              {/* Output Content */}
              <div style={{ fontSize: '1.125rem', textAlign: 'justify', whiteSpace: 'pre-wrap', color: '#0f172a' }}>
                {documentContent}
              </div>

            </div>
          </div>
        </div>

      </main>
    </div>
  );
};
