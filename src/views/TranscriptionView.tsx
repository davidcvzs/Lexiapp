import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  UploadCloud, 
  Play, 
  Download,
  ScrollText,
  FileSignature,
  Search,
  ArrowLeft,
  Bookmark,
  MoreVertical,
  Volume2,
  Settings,
  Maximize
} from 'lucide-react';
import styles from './TranscriptionView.module.css';
import { TranscriptionService } from '../services/TranscriptionService';
import { AIAssistantService } from '../services/AIAssistantService';

const transcriptionService = new TranscriptionService();
const aiAssistant = new AIAssistantService();

type ViewState = 'UPLOAD' | 'TRANSCRIBING' | 'READY';

export const TranscriptionView: React.FC = () => {
  const navigate = useNavigate();
  const [viewState, setViewState] = useState<ViewState>('UPLOAD');
  const [progressText] = useState('Transcribiendo audio con IA...');
  const [transcriptionData, setTranscriptionData] = useState<string>('');
  const [fileName, setFileName] = useState<string>('audiencia.mp4');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setFileName(file.name);
    setViewState('TRANSCRIBING');
    
    try {
      const result = await transcriptionService.processMedia(file);
      setTranscriptionData(result);
      aiAssistant.initializeSession(result);
      setViewState('READY');
    } catch (e) {
      alert("Error al transcribir el archivo.");
      setViewState('UPLOAD');
    }
  };

  const navigateToBuilder = () => {
    navigate('/documents', { state: { transcriptionData } });
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', display: 'flex', flexDirection: 'column', fontFamily: 'Inter, sans-serif' }}>
      {viewState === 'UPLOAD' && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange}
            accept="audio/*,video/*"
            style={{ display: 'none' }}
          />
          <div onClick={triggerFileSelect} style={{ width: '100%', maxWidth: '600px', padding: '4rem 2rem', border: '2px dashed #cbd5e1', borderRadius: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff', cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)', transition: 'all 0.2s' }}>
            <UploadCloud size={64} color="#000066" style={{ marginBottom: '1rem' }} />
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.5rem', textAlign: 'center' }}>Arrastra tu video aquí o haz clic para seleccionar</h2>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.25rem 0.75rem', borderRadius: '9999px', backgroundColor: '#f1f5f9', color: '#475569' }}>MP4 MOV AVI MP3 WAV</span>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.25rem 0.75rem', borderRadius: '9999px', backgroundColor: '#f1f5f9', color: '#475569' }}>hasta 2GB</span>
            </div>
          </div>
        </div>
      )}

      {viewState === 'TRANSCRIBING' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
          <div style={{ backgroundColor: '#ffffff', padding: '3rem', borderRadius: '1rem', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', width: '100%', maxWidth: '400px' }}>
            <div className={styles.waveform}>
              <div className={styles.bar} style={{ backgroundColor: '#000066' }}></div>
              <div className={styles.bar} style={{ backgroundColor: '#C5A059' }}></div>
              <div className={styles.bar} style={{ backgroundColor: '#000066' }}></div>
              <div className={styles.bar} style={{ backgroundColor: '#C5A059' }}></div>
              <div className={styles.bar} style={{ backgroundColor: '#000066' }}></div>
            </div>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 800, color: '#0f172a', margin: 0, textAlign: 'center' }}>{progressText}</h2>
            <button onClick={() => setViewState('UPLOAD')} style={{ padding: '0.5rem 1.5rem', backgroundColor: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: '9999px', fontWeight: 700, cursor: 'pointer', fontSize: '0.875rem' }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {viewState === 'READY' && (
        <div style={{ maxWidth: '48rem', margin: '0 auto', backgroundColor: '#ffffff', minHeight: '100vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', borderLeft: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '1rem', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, backgroundColor: '#ffffff', zIndex: 10 }}>
            <div style={{ padding: '0.5rem', cursor: 'pointer', color: '#475569' }} onClick={() => setViewState('UPLOAD')}>
              <ArrowLeft size={24} />
            </div>
            <div style={{ flex: 1, padding: '0 0.5rem' }}>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Expediente: 123/2024</h2>
              <p style={{ fontSize: '0.75rem', color: '#475569', margin: 0, fontWeight: 500 }}>Archivo: {fileName}</p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button style={{ padding: '0.5rem', border: 'none', background: 'transparent', cursor: 'pointer', color: '#000066' }}>
                <Bookmark size={20} />
              </button>
              <button style={{ padding: '0.5rem', border: 'none', background: 'transparent', cursor: 'pointer', color: '#475569' }}>
                <MoreVertical size={20} />
              </button>
            </div>
          </div>

          {/* Video Player */}
          <div style={{ padding: '1.5rem 1.5rem 0.5rem 1.5rem' }}>
            <div style={{ position: 'relative', aspectRatio: '16/9', backgroundColor: '#0f172a', borderRadius: '0.75rem', overflow: 'hidden', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)' }}>
                <button style={{ width: '4rem', height: '4rem', borderRadius: '9999px', backgroundColor: '#000066', color: '#ffffff', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(0,0,102,0.4)' }}>
                  <Play size={32} fill="white" />
                </button>
              </div>
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '0.75rem 1rem', background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)' }}>
                <div style={{ display: 'flex', height: '0.375rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <div style={{ height: '0.25rem', flex: 0.35, backgroundColor: '#C5A059', borderRadius: '9999px' }}></div>
                  <div style={{ width: '0.75rem', height: '0.75rem', backgroundColor: '#C5A059', borderRadius: '9999px', zIndex: 1, boxShadow: '0 0 0 2px rgba(0,0,0,0.5)' }}></div>
                  <div style={{ height: '0.25rem', flex: 0.65, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: '9999px' }}></div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <Volume2 size={16} color="white" />
                    <span style={{ color: 'white', fontSize: '0.75rem', fontWeight: 600 }}>05:22 / 45:10</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <Settings size={16} color="white" />
                    <Maximize size={16} color="white" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Transcript Controls */}
          <div style={{ padding: '1rem 1.5rem', position: 'sticky', top: '72px', backgroundColor: '#ffffff', zIndex: 9, borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>Transcripción de Audiencia</h3>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', fontWeight: 700, color: '#000066', padding: '0.375rem 0.75rem', backgroundColor: 'rgba(0,0,102,0.05)', borderRadius: '0.5rem', border: '1px solid rgba(0,0,102,0.1)', cursor: 'pointer' }}>
                  <Download size={14} /> PDF
                </button>
              </div>
            </div>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Search size={20} color="#64748b" style={{ position: 'absolute', left: '0.75rem' }} />
              <input type="text" placeholder="Buscar en el testimonio..." style={{ width: '100%', padding: '0.75rem 1rem 0.75rem 2.5rem', borderRadius: '0.5rem', border: '1px solid #cbd5e1', fontSize: '0.875rem', backgroundColor: '#ffffff', color: '#0f172a', outline: 'none', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' }} />
            </div>
          </div>

          {/* Transcription List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', backgroundColor: '#f8fafc' }}>
            <div style={{ padding: '1.25rem', borderRadius: '0.75rem', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px 0 rgba(0,0,0,0.1)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <ScrollText size={20} color="#000066" />
                <h4 style={{ fontSize: '0.875rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>Resumen de la Audiencia</h4>
              </div>
              <p style={{ fontSize: '0.875rem', lineHeight: 1.6, color: '#475569', margin: 0, fontWeight: 500 }}>
                {transcriptionData.substring(0, 200)}...
              </p>
            </div>

            {transcriptionData.split('\n').filter(p => p.trim() !== '').map((paragraph, index) => (
              <div key={index} style={{ 
                display: 'flex', flexDirection: 'column', gap: '0.375rem', padding: '1rem', 
                borderRadius: '0.75rem', 
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderLeft: index % 2 === 0 ? '4px solid #000066' : '1px solid #e2e8f0',
                boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: index % 2 === 0 ? '#000066' : '#0f172a', textTransform: 'uppercase' }}>
                    {index % 2 === 0 ? 'Juez de Control' : 'Ministerio Público'}
                  </span>
                  <span style={{ fontSize: '0.625rem', fontWeight: 600, color: '#64748b' }}>--:--</span>
                </div>
                <p style={{ fontSize: '0.875rem', lineHeight: 1.6, color: '#1e293b', margin: 0, fontWeight: 500 }}>
                  {paragraph}
                </p>
              </div>
            ))}
          </div>

          {/* Bottom Actions */}
          <div style={{ padding: '1.25rem 1.5rem', borderTop: '1px solid #e2e8f0', backgroundColor: '#ffffff' }}>
            <button onClick={navigateToBuilder} style={{ width: '100%', padding: '0.875rem', backgroundColor: '#000066', color: '#ffffff', border: 'none', borderRadius: '0.5rem', fontWeight: 800, fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(0,0,102,0.2)' }}>
              <FileSignature size={18} /> Generar Acta Judicial
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
