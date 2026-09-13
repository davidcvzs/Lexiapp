import React from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Bell, 
  User, 
  UploadCloud, 
  Folder, 
  Gavel, 
  Bot, 
  PlusCircle, 
  ArrowRight,
  Eye,
  HelpCircle,
  Home,
  FileText,
  Settings
} from 'lucide-react';

export const DashboardView: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f5f5f8', fontFamily: 'Inter, sans-serif' }}>
      
      {/* Header */}
      <header style={{ position: 'sticky', top: 0, zIndex: 50, backgroundColor: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #e2e8f0' }}>
        <div style={{ maxWidth: '80rem', margin: '0 auto', padding: '0 1rem', height: '4rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: '2.5rem', height: '2.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '0.5rem', backgroundColor: '#000066', color: '#C5A059', fontWeight: 'bold', fontSize: '1.5rem', boxShadow: '0 4px 6px -1px rgba(0,0,102,0.2)' }}>
              L
            </div>
            <div>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 'bold', letterSpacing: '-0.025em', color: '#000066', margin: 0, lineHeight: 1 }}>LegalFlow</h1>
              <p style={{ fontSize: '0.625rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#C5A059', fontWeight: 600, margin: 0 }}>Premium Legal Tech</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button style={{ padding: '0.5rem', color: '#475569', borderRadius: '9999px', border: 'none', background: 'transparent', cursor: 'pointer' }}>
              <Bell size={20} />
            </button>
            <div style={{ height: '2rem', width: '1px', backgroundColor: '#e2e8f0' }}></div>
            <button onClick={() => navigate('/profile')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem 0.75rem 0.25rem 0.25rem', borderRadius: '9999px', backgroundColor: '#f1f5f9', border: '1px solid #e2e8f0', cursor: 'pointer' }}>
              <div style={{ width: '1.75rem', height: '1.75rem', borderRadius: '9999px', backgroundColor: 'rgba(197,160,89,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#C5A059' }}>
                <User size={16} />
              </div>
              <span style={{ fontSize: '0.875rem', fontWeight: 500, color: '#334155' }}>Dr. Mendoza</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ flex: 1, maxWidth: '80rem', margin: '0 auto', width: '100%', padding: '2rem 1rem' }}>
        
        {/* Hero Section */}
        <section style={{ marginBottom: '2.5rem' }}>
          <div style={{ position: 'relative', overflow: 'hidden', borderRadius: '1rem', backgroundColor: '#000066', padding: '2rem 3rem', boxShadow: '0 20px 25px -5px rgba(0,0,102,0.2)' }}>
            <div style={{ position: 'relative', zIndex: 10, maxWidth: '42rem' }}>
              <span style={{ display: 'inline-block', padding: '0.25rem 0.75rem', borderRadius: '9999px', backgroundColor: 'rgba(197,160,89,0.2)', color: '#C5A059', fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem', border: '1px solid rgba(197,160,89,0.3)' }}>
                Inteligencia Artificial Jurídica
              </span>
              <h2 style={{ fontSize: '3rem', fontWeight: 'bold', color: 'white', marginBottom: '1rem', lineHeight: 1.1 }}>Gestión Transcripcional Inteligente</h2>
              <p style={{ color: '#cbd5e1', fontSize: '1.125rem', marginBottom: '2rem', lineHeight: 1.6 }}>Optimice sus procesos legales con transcripción automatizada, análisis predictivo y asistencia en tiempo real impulsada por IA avanzada.</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                <button 
                  onClick={() => navigate('/transcription')}
                  style={{ padding: '0.75rem 1.5rem', borderRadius: '0.5rem', backgroundColor: '#C5A059', color: '#000066', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem', border: 'none', cursor: 'pointer' }}>
                  <PlusCircle size={20} /> Nuevo Análisis
                </button>
                <button style={{ padding: '0.75rem 1.5rem', borderRadius: '0.5rem', backgroundColor: 'rgba(255,255,255,0.1)', color: 'white', fontWeight: 'bold', backdropFilter: 'blur(4px)', border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer' }}>
                  Ver Tutorial
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Action Grid */}
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '3rem' }}>
          {[
            { title: 'Cargar Audiencia', desc: 'Sube archivos de audio o video para transcripción inmediata.', icon: <UploadCloud size={24} />, route: '/transcription' },
            { title: 'Mis Casos', desc: 'Acceda a su historial de transcripciones y expedientes digitales.', icon: <Folder size={24} />, route: '/documents' },
            { title: 'Analizar Sentencia', desc: 'Extracción automática de fallos y puntos clave jurisprudenciales.', icon: <Gavel size={24} />, route: '/search' },
            { title: 'Asistente IA', desc: 'Consulta legal rápida y redacción asistida de documentos.', icon: <Bot size={24} />, route: '/document-builder' }
          ].map((item, idx) => (
            <div key={idx} onClick={() => navigate(item.route)} style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '0.75rem', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', cursor: 'pointer' }}>
              <div style={{ width: '3rem', height: '3rem', borderRadius: '0.5rem', backgroundColor: 'rgba(0,0,102,0.1)', color: '#000066', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
                {item.icon}
              </div>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#0f172a' }}>{item.title}</h3>
              <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '1rem' }}>{item.desc}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#000066', fontSize: '0.875rem', fontWeight: 600 }}>
                Comenzar <ArrowRight size={16} />
              </div>
            </div>
          ))}
        </section>

        {/* Recent Activity */}
        <section style={{ marginTop: '3rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#0f172a' }}>Actividad Reciente</h3>
            <button style={{ color: '#000066', fontSize: '0.875rem', fontWeight: 600, border: 'none', background: 'transparent', cursor: 'pointer' }}>Ver todo</button>
          </div>
          <div style={{ backgroundColor: 'white', borderRadius: '0.75rem', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <table style={{ width: '100%', textAlign: 'left', fontSize: '0.875rem', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '1rem 1.5rem', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em' }}>Expediente</th>
                  <th style={{ padding: '1rem 1.5rem', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em' }}>Tipo</th>
                  <th style={{ padding: '1rem 1.5rem', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em' }}>Fecha</th>
                  <th style={{ padding: '1rem 1.5rem', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em' }}>Estado</th>
                  <th style={{ padding: '1rem 1.5rem', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em', textAlign: 'right' }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '1rem 1.5rem', fontWeight: 600, color: '#0f172a' }}>EXP-2024-00124</td>
                  <td style={{ padding: '1rem 1.5rem', color: '#64748b' }}>Audiencia Civil</td>
                  <td style={{ padding: '1rem 1.5rem', color: '#64748b' }}>12 Oct, 2026</td>
                  <td style={{ padding: '1rem 1.5rem' }}><span style={{ padding: '0.25rem 0.5rem', borderRadius: '9999px', backgroundColor: '#dcfce7', color: '#15803d', fontSize: '0.75rem', fontWeight: 'bold' }}>Completado</span></td>
                  <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}><button style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#000066' }}><Eye size={18} /></button></td>
                </tr>
                <tr>
                  <td style={{ padding: '1rem 1.5rem', fontWeight: 600, color: '#0f172a' }}>EXP-2024-00125</td>
                  <td style={{ padding: '1rem 1.5rem', color: '#64748b' }}>Conciliación</td>
                  <td style={{ padding: '1rem 1.5rem', color: '#64748b' }}>11 Oct, 2026</td>
                  <td style={{ padding: '1rem 1.5rem' }}><span style={{ padding: '0.25rem 0.5rem', borderRadius: '9999px', backgroundColor: '#dbeafe', color: '#1d4ed8', fontSize: '0.75rem', fontWeight: 'bold' }}>Procesando</span></td>
                  <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}><button style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#000066' }}><Eye size={18} /></button></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

      </main>

      {/* Footer */}
      <footer style={{ marginTop: 'auto', borderTop: '1px solid #e2e8f0', backgroundColor: 'white', padding: '1.5rem 0' }}>
        <div style={{ maxWidth: '80rem', margin: '0 auto', padding: '0 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: '1.5rem', height: '1.5rem', borderRadius: '0.25rem', backgroundColor: '#000066', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#C5A059', fontWeight: 'bold', fontSize: '0.75rem' }}>L</div>
            <span style={{ fontSize: '0.875rem', fontWeight: 'bold', color: '#94a3b8' }}>LegalFlow © 2026</span>
          </div>
          <div style={{ display: 'flex', gap: '1.5rem' }}>
            <a href="#" style={{ fontSize: '0.875rem', color: '#64748b', textDecoration: 'none' }}>Privacidad</a>
            <a href="#" style={{ fontSize: '0.875rem', color: '#64748b', textDecoration: 'none' }}>Términos</a>
            <a href="#" style={{ fontSize: '0.875rem', color: '#64748b', textDecoration: 'none' }}>Soporte</a>
          </div>
          <button style={{ width: '2rem', height: '2rem', borderRadius: '9999px', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', border: 'none', cursor: 'pointer' }}>
            <HelpCircle size={16} />
          </button>
        </div>
      </footer>

      {/* Mobile Nav */}
      <nav style={{ display: 'none', position: 'fixed', bottom: 0, left: 0, right: 0, backgroundColor: 'white', borderTop: '1px solid #e2e8f0', padding: '0.5rem 1rem', justifyContent: 'space-around', zIndex: 50 }}>
        <button onClick={() => navigate('/dashboard')} style={{ border: 'none', background: 'transparent', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem', color: '#000066', textDecoration: 'none', cursor: 'pointer' }}><Home size={20} /><span style={{ fontSize: '0.625rem', fontWeight: 'bold' }}>Inicio</span></button>
        <button onClick={() => navigate('/documents')} style={{ border: 'none', background: 'transparent', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem', color: '#94a3b8', textDecoration: 'none', cursor: 'pointer' }}><FileText size={20} /><span style={{ fontSize: '0.625rem', fontWeight: 'bold' }}>Casos</span></button>
        <button onClick={() => navigate('/document-builder')} style={{ border: 'none', background: 'transparent', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem', color: '#94a3b8', textDecoration: 'none', cursor: 'pointer' }}><Bot size={20} /><span style={{ fontSize: '0.625rem', fontWeight: 'bold' }}>IA</span></button>
        <button onClick={() => navigate('/settings')} style={{ border: 'none', background: 'transparent', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem', color: '#94a3b8', textDecoration: 'none', cursor: 'pointer' }}><Settings size={20} /><span style={{ fontSize: '0.625rem', fontWeight: 'bold' }}>Ajustes</span></button>
      </nav>
    </div>
  );
};
