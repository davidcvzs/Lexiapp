import React from 'react';
import { Search, Filter, MoreVertical, FileText, Download, Calendar, Folder } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const DocumentsView: React.FC = () => {
  const navigate = useNavigate();

  const documents = [
    { id: '1', name: 'Acta_Audiencia_Inicial_123_2024.docx', type: 'Control Detención', date: '12 Oct, 2026', size: '45 KB', status: 'Completado' },
    { id: '2', name: 'Resolucion_Amparo_45_2026.docx', type: 'Sentencia', date: '11 Oct, 2026', size: '120 KB', status: 'Revisión' },
    { id: '3', name: 'Acta_Bloque_Civil_Octubre.docx', type: 'Acta en Bloque', date: '10 Oct, 2026', size: '85 KB', status: 'Completado' },
  ];

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f5f8', fontFamily: 'Inter, sans-serif', padding: '2rem 1rem' }}>
      <div style={{ maxWidth: '80rem', margin: '0 auto' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem' }}>
          <div>
            <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a', margin: '0 0 0.5rem', letterSpacing: '-0.025em' }}>Mis Documentos</h1>
            <p style={{ color: '#64748b', fontSize: '1rem', margin: 0, fontWeight: 500 }}>Gestiona, exporta y revisa tus actas y sentencias generadas.</p>
          </div>
          <button 
            onClick={() => navigate('/document-builder')}
            style={{ backgroundColor: '#000066', color: 'white', padding: '0.75rem 1.5rem', borderRadius: '0.5rem', fontWeight: 700, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: '0 4px 6px -1px rgba(0,0,102,0.2)' }}>
            <FileText size={18} /> Nuevo Documento
          </button>
        </div>

        {/* Filters and Search */}
        <div style={{ backgroundColor: 'white', padding: '1rem', borderRadius: '1rem', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', display: 'flex', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '240px', position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search size={20} color="#94a3b8" style={{ position: 'absolute', left: '1rem' }} />
            <input 
              type="text" 
              placeholder="Buscar por expediente, título o fecha..." 
              style={{ width: '100%', padding: '0.75rem 1rem 0.75rem 3rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0', fontSize: '0.875rem', outline: 'none', color: '#0f172a', backgroundColor: '#ffffff', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' }}
            />
          </div>
          <button style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.5rem', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.5rem', color: '#475569', fontWeight: 600, cursor: 'pointer' }}>
            <Filter size={18} /> Filtros
          </button>
          <button style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.5rem', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.5rem', color: '#475569', fontWeight: 600, cursor: 'pointer' }}>
            <Calendar size={18} /> Fecha
          </button>
        </div>

        {/* Document Grid / Table */}
        <div style={{ backgroundColor: 'white', borderRadius: '1rem', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
          <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Nombre del Documento</th>
                <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tipo</th>
                <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Fecha de Creación</th>
                <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Estado</th>
                <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {documents?.map((doc, idx) => (
                <tr key={doc?.id} style={{ borderBottom: idx === (documents?.length || 0) - 1 ? 'none' : '1px solid #f1f5f9' }}>
                  <td style={{ padding: '1.25rem 1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <div style={{ width: '2.5rem', height: '2.5rem', borderRadius: '0.5rem', backgroundColor: 'rgba(0,0,102,0.05)', color: '#000066', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Folder size={20} />
                      </div>
                      <div>
                        <p style={{ margin: '0 0 0.25rem', fontWeight: 700, color: '#0f172a', fontSize: '0.875rem' }}>{doc?.name}</p>
                        <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>{doc?.size}</p>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '1.25rem 1.5rem', color: '#475569', fontSize: '0.875rem', fontWeight: 500 }}>{doc?.type}</td>
                  <td style={{ padding: '1.25rem 1.5rem', color: '#475569', fontSize: '0.875rem', fontWeight: 500 }}>{doc?.date}</td>
                  <td style={{ padding: '1.25rem 1.5rem' }}>
                    <span style={{ padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 700, backgroundColor: doc?.status === 'Completado' ? '#dcfce7' : '#fef08a', color: doc?.status === 'Completado' ? '#15803d' : '#854d0e' }}>
                      {doc?.status}
                    </span>
                  </td>
                  <td style={{ padding: '1.25rem 1.5rem', textAlign: 'right' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem' }}>
                      <button style={{ padding: '0.5rem', color: '#000066', borderRadius: '0.5rem', backgroundColor: 'transparent', border: 'none', cursor: 'pointer' }}>
                        <Download size={18} />
                      </button>
                      <button style={{ padding: '0.5rem', color: '#64748b', borderRadius: '0.5rem', backgroundColor: 'transparent', border: 'none', cursor: 'pointer' }}>
                        <MoreVertical size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
};
