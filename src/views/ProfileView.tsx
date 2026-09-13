import React from 'react';
import { User, LogOut, Settings, ShieldCheck, CreditCard } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const ProfileView: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div style={{ padding: '3rem 1rem', maxWidth: '100%', minHeight: '100vh', backgroundColor: '#f8fafc', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ maxWidth: '640px', margin: '0 auto', backgroundColor: '#ffffff', padding: '3rem 2rem', borderRadius: '1rem', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)', textAlign: 'center' }}>
        
        <div style={{ width: '120px', height: '120px', backgroundColor: 'rgba(0,0,102,0.05)', color: '#000066', borderRadius: '50%', margin: '0 auto 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '4px solid #f1f5f9' }}>
          <User size={64} />
        </div>
        
        <h2 style={{ fontSize: '2rem', fontWeight: 800, margin: '0 0 0.5rem', color: '#0f172a' }}>Dr. Mendoza</h2>
        <p style={{ color: '#475569', fontSize: '1rem', fontWeight: 500, margin: '0 0 2rem' }}>dr.mendoza@pjenl.gob.mx</p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '2.5rem' }}>
          <div style={{ backgroundColor: '#ffffff', padding: '1rem', borderRadius: '0.75rem', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <ShieldCheck size={24} color="#059669" style={{ marginBottom: '0.5rem' }} />
            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', fontWeight: 700 }}>Rol Legal</span>
            <span style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>Magistrado</span>
          </div>
          <div style={{ backgroundColor: '#ffffff', padding: '1rem', borderRadius: '0.75rem', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <CreditCard size={24} color="#000066" style={{ marginBottom: '0.5rem' }} />
            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', fontWeight: 700 }}>Plan Actual</span>
            <span style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>Pro Anual</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
          <button 
            onClick={() => navigate('/settings')}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', width: '100%', padding: '1rem', backgroundColor: '#000066', color: '#ffffff', border: 'none', borderRadius: '0.75rem', fontWeight: 700, fontSize: '1rem', cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(0,0,102,0.2)' }}>
            <Settings size={20} /> Configurar Cuenta
          </button>
          <button 
            onClick={() => navigate('/login')}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', width: '100%', padding: '1rem', backgroundColor: '#ffffff', color: '#b91c1c', border: '1px solid #fca5a5', borderRadius: '0.75rem', fontWeight: 700, fontSize: '1rem', cursor: 'pointer' }}>
            <LogOut size={20} /> Cerrar Sesión
          </button>
        </div>
      </div>
    </div>
  );
};
