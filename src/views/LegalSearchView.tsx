import React from 'react';
import { Search, Library, Scale, FileText, ArrowRight, BookOpen } from 'lucide-react';

export const LegalSearchView: React.FC = () => {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f5f5f8', fontFamily: 'Inter, sans-serif', padding: '2rem 1rem' }}>
      <div style={{ maxWidth: '64rem', margin: '0 auto', width: '100%' }}>
        
        {/* Header Section */}
        <div style={{ textAlign: 'center', marginBottom: '3rem', marginTop: '2rem' }}>
          <div style={{ width: '4rem', height: '4rem', margin: '0 auto 1.5rem', borderRadius: '1rem', backgroundColor: 'rgba(0,0,102,0.1)', color: '#000066', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Library size={32} />
          </div>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 800, color: '#0f172a', marginBottom: '1rem', letterSpacing: '-0.025em' }}>Biblioteca Legal y Jurisprudencia</h1>
          <p style={{ color: '#64748b', fontSize: '1.125rem', maxWidth: '32rem', margin: '0 auto' }}>Consulte de forma interactiva en las bases de datos de la SCJN y PJENL mediante Inteligencia Artificial.</p>
        </div>

        {/* Search Bar */}
        <div style={{ display: 'flex', gap: '0.5rem', backgroundColor: 'white', padding: '0.75rem', borderRadius: '1rem', boxShadow: '0 20px 25px -5px rgba(0,0,102,0.1)', border: '1px solid #e2e8f0', marginBottom: '3rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', paddingLeft: '1rem' }}>
            <Search size={24} color="#94a3b8" />
          </div>
          <input 
            type="text" 
            placeholder="Ingrese un número de tesis, registro, rama del derecho o concepto clave..." 
            style={{ flex: 1, border: 'none', backgroundColor: 'transparent', padding: '0 1rem', outline: 'none', fontSize: '1.125rem', color: '#0f172a' }}
          />
          <button style={{ backgroundColor: '#000066', color: '#C5A059', padding: '1rem 2rem', borderRadius: '0.5rem', fontWeight: 'bold', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', border: 'none', cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(0,0,102,0.2)' }}>
            Buscar Tesis
          </button>
        </div>

        {/* Suggestions/Filters */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
          <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '0.75rem', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
              <div style={{ padding: '0.75rem', borderRadius: '0.5rem', backgroundColor: 'rgba(197,160,89,0.1)', color: '#C5A059' }}><Scale size={20} /></div>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', color: '#0f172a', margin: 0 }}>Jurisprudencia SCJN</h3>
            </div>
            <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1rem', lineHeight: 1.5 }}>Explora resoluciones y precedentes obligatorios de la Suprema Corte de Justicia.</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#000066', fontSize: '0.875rem', fontWeight: 600 }}>
              Explorar <ArrowRight size={16} />
            </div>
          </div>

          <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '0.75rem', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
              <div style={{ padding: '0.75rem', borderRadius: '0.5rem', backgroundColor: 'rgba(0,0,102,0.1)', color: '#000066' }}><FileText size={20} /></div>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', color: '#0f172a', margin: 0 }}>Criterios PJENL</h3>
            </div>
            <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1rem', lineHeight: 1.5 }}>Consultas específicas de criterios y jurisprudencia local del Estado de Nuevo León.</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#000066', fontSize: '0.875rem', fontWeight: 600 }}>
              Consultar <ArrowRight size={16} />
            </div>
          </div>

          <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '0.75rem', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
              <div style={{ padding: '0.75rem', borderRadius: '0.5rem', backgroundColor: 'rgba(15,23,42,0.05)', color: '#475569' }}><BookOpen size={20} /></div>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', color: '#0f172a', margin: 0 }}>Doctrina Legal</h3>
            </div>
            <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1rem', lineHeight: 1.5 }}>Acceso a bibliografía y tratados referenciados frecuentemente en resoluciones.</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#000066', fontSize: '0.875rem', fontWeight: 600 }}>
              Revisar <ArrowRight size={16} />
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
