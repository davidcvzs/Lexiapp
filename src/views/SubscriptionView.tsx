import React from 'react';
import { Check, Star, Zap } from 'lucide-react';

export const SubscriptionView: React.FC = () => {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f5f8', fontFamily: 'Inter, sans-serif', padding: '3rem 1rem' }}>
      <div style={{ maxWidth: '72rem', margin: '0 auto' }}>
        
        <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', backgroundColor: 'rgba(197,160,89,0.1)', color: '#C5A059', padding: '0.5rem 1rem', borderRadius: '9999px', fontWeight: 700, fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1.5rem' }}>
            <Zap size={18} /> Potencia tu práctica legal
          </div>
          <h1 style={{ fontSize: '3.5rem', fontWeight: 800, color: '#0f172a', marginBottom: '1rem', letterSpacing: '-0.025em' }}>Elige tu Plan Premium</h1>
          <p style={{ color: '#475569', fontSize: '1.25rem', maxWidth: '36rem', margin: '0 auto', lineHeight: 1.6 }}>Optimiza la gestión judicial con transcripciones instantáneas y generación de actas respaldadas por IA.</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem', alignItems: 'center' }}>
          
          {/* Monthly Plan */}
          <div style={{ backgroundColor: 'white', padding: '3rem 2rem', borderRadius: '1.5rem', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
            <h3 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.5rem' }}>Mensual</h3>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.25rem', marginBottom: '2rem' }}>
              <span style={{ fontSize: '3rem', fontWeight: 800, color: '#0f172a' }}>$65</span>
              <span style={{ fontSize: '1rem', fontWeight: 600, color: '#64748b' }}>MXN / mes</span>
            </div>
            
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 2.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                <Check size={24} color="#059669" style={{ flexShrink: 0 }} />
                <span style={{ fontSize: '1rem', color: '#334155', fontWeight: 500 }}>Transcripciones ilimitadas de audio/video</span>
              </li>
              <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                <Check size={24} color="#059669" style={{ flexShrink: 0 }} />
                <span style={{ fontSize: '1rem', color: '#334155', fontWeight: 500 }}>Redacción guiada con Inteligencia Artificial</span>
              </li>
            </ul>
            
            <button style={{ width: '100%', padding: '1rem', borderRadius: '0.75rem', backgroundColor: '#f1f5f9', color: '#0f172a', fontWeight: 800, fontSize: '1rem', border: '1px solid #e2e8f0', cursor: 'pointer', transition: 'all 0.2s' }}>
              Elegir Mensual
            </button>
          </div>

          {/* Yearly Plan */}
          <div style={{ position: 'relative', backgroundColor: '#000066', padding: '3.5rem 2rem 3rem', borderRadius: '1.5rem', border: '1px solid #000066', boxShadow: '0 25px 50px -12px rgba(0,0,102,0.4)' }}>
            <div style={{ position: 'absolute', top: '-1rem', left: '50%', transform: 'translateX(-50%)', backgroundColor: '#C5A059', color: '#000066', padding: '0.5rem 1.5rem', borderRadius: '9999px', fontWeight: 800, fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: '0 4px 6px -1px rgba(197,160,89,0.4)' }}>
              <Star size={16} fill="#000066" /> Mejor Valor
            </div>
            
            <h3 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'white', marginBottom: '0.5rem' }}>Anual Pro</h3>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.25rem', marginBottom: '2rem' }}>
              <span style={{ fontSize: '3.5rem', fontWeight: 800, color: 'white' }}>$1,200</span>
              <span style={{ fontSize: '1rem', fontWeight: 600, color: '#94a3b8' }}>MXN / año</span>
            </div>
            
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 2.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                <Check size={24} color="#C5A059" style={{ flexShrink: 0 }} />
                <span style={{ fontSize: '1rem', color: '#f1f5f9', fontWeight: 500 }}>Todo lo del plan mensual</span>
              </li>
              <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                <Check size={24} color="#C5A059" style={{ flexShrink: 0 }} />
                <span style={{ fontSize: '1rem', color: 'white', fontWeight: 800 }}>Acceso prioritario a nuevas funciones</span>
              </li>
              <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                <Check size={24} color="#C5A059" style={{ flexShrink: 0 }} />
                <span style={{ fontSize: '1rem', color: '#f1f5f9', fontWeight: 500 }}>Un solo pago anual sin preocupaciones</span>
              </li>
            </ul>
            
            <button style={{ width: '100%', padding: '1.25rem 1rem', borderRadius: '0.75rem', backgroundColor: '#C5A059', color: '#000066', fontWeight: 800, fontSize: '1.125rem', border: 'none', cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(197,160,89,0.3)' }}>
              Suscribirse - Plan Anual
            </button>
            <p style={{ textAlign: 'center', fontSize: '0.75rem', color: '#94a3b8', marginTop: '1rem', fontWeight: 500 }}>
              * Pago único anual recurrente
            </p>
          </div>

        </div>
      </div>
    </div>
  );
};
