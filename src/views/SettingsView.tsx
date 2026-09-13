import React, { useState } from 'react';
import { 
  User, 
  Lock, 
  CreditCard, 
  Bot, 
  LogOut, 
  Save, 
  Key,
  Shield,
  Smartphone,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const SettingsView: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'ai' | 'billing'>('profile');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    // Simulate save to Firestore / Local State
    setToastMessage('Configuración guardada exitosamente.');
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleLogout = () => {
    // AuthService.logout() equivalent
    localStorage.removeItem('auth_token');
    navigate('/login');
  };

  const tabStyle = (isActive: boolean) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.875rem 1.25rem',
    backgroundColor: isActive ? '#eef2ff' : 'transparent',
    color: isActive ? '#4338ca' : '#475569',
    border: isActive ? '1px solid #c7d2fe' : '1px solid transparent',
    borderRadius: '0.5rem',
    fontWeight: isActive ? 600 : 500,
    fontSize: '0.9375rem',
    cursor: 'pointer',
    textAlign: 'left' as const,
    transition: 'all 0.2s',
  });

  const inputStyle = {
    padding: '0.75rem 1rem',
    borderRadius: '0.5rem',
    border: '1px solid #cbd5e1',
    fontSize: '0.9375rem',
    color: '#0f172a',
    backgroundColor: '#ffffff',
    outline: 'none',
    fontWeight: 500,
    width: '100%',
    boxSizing: 'border-box' as const,
  };

  const labelStyle = {
    fontSize: '0.875rem',
    fontWeight: 500,
    color: '#334155',
    marginBottom: '0.5rem',
    display: 'block'
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', padding: '2rem 1.5rem', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ maxWidth: '80rem', margin: '0 auto' }}>
      
      {toastMessage && (
        <div style={{ position: 'fixed', top: '2rem', right: '2rem', backgroundColor: '#064e3b', color: '#ffffff', padding: '1rem 1.5rem', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', fontWeight: 700, zIndex: 100, boxShadow: '0 10px 15px -3px rgba(0,0,0,0.2)' }}>
          <CheckCircle2 size={20} />
          {toastMessage}
        </div>
      )}

      <div style={{ marginBottom: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 900, color: '#0f172a', margin: 0, letterSpacing: '-0.025em' }}>Configuración de Cuenta</h1>
          <p style={{ color: '#475569', fontSize: '1rem', marginTop: '0.5rem', fontWeight: 500 }}>Gestione su perfil personal, seguridad y preferencias del sistema judicial.</p>
        </div>
        <button 
          onClick={handleLogout}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.25rem', backgroundColor: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: '0.5rem', fontWeight: 700, cursor: 'pointer', transition: 'background-color 0.2s' }}>
          <LogOut size={18} /> Cerrar Sesión
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 3fr', gap: '2.5rem' }}>
        
        {/* Sidebar Tabs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <button style={tabStyle(activeTab === 'profile')} onClick={() => setActiveTab('profile')}>
            <User size={20} /> Información Personal
          </button>
          <button style={tabStyle(activeTab === 'security')} onClick={() => setActiveTab('security')}>
            <Lock size={20} /> Seguridad y Autenticación
          </button>
          <button style={tabStyle(activeTab === 'ai')} onClick={() => setActiveTab('ai')}>
            <Bot size={20} /> Preferencias de IA
          </button>
          <button style={tabStyle(activeTab === 'billing')} onClick={() => setActiveTab('billing')}>
            <CreditCard size={20} /> Suscripción y Facturación
          </button>
        </div>

        {/* Content Area */}
        <div style={{ backgroundColor: '#ffffff', padding: '2.5rem', borderRadius: '1rem', border: '1px solid #cbd5e1', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
          
          <form onSubmit={handleSave}>
            
            {/* SECTION 1: PROFILE */}
            {activeTab === 'profile' && (
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <User size={24} color="#000066" /> Información Personal
                </h2>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                  <div>
                    <label style={labelStyle}>Nombre Completo</label>
                    <input type="text" defaultValue="Dr. Alejandro Mendoza" style={inputStyle} required />
                  </div>
                  <div>
                    <label style={labelStyle}>Correo Electrónico (Institucional)</label>
                    <input type="email" defaultValue="dr.mendoza@pjenl.gob.mx" disabled style={{ ...inputStyle, backgroundColor: '#f1f5f9', color: '#475569', borderColor: '#e2e8f0', cursor: 'not-allowed' }} />
                    <p style={{ fontSize: '0.75rem', color: '#475569', marginTop: '0.5rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <AlertCircle size={12} /> Gestionado por TI
                    </p>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                  <div>
                    <label style={labelStyle}>Cédula Profesional</label>
                    <input type="text" defaultValue="9843102" style={inputStyle} required />
                  </div>
                  <div>
                    <label style={labelStyle}>Juzgado / Firma Legal</label>
                    <select style={inputStyle}>
                      <option>Juzgado Primero de Control (Monterrey)</option>
                      <option>Juzgado Civil</option>
                      <option>Firma Privada</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* SECTION 2: SECURITY */}
            {activeTab === 'security' && (
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Lock size={24} color="#000066" /> Seguridad y Autenticación
                </h2>
                
                <div style={{ padding: '1.5rem', border: '1px solid #cbd5e1', borderRadius: '0.75rem', marginBottom: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <div>
                      <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Key size={18} /> Cambiar Contraseña
                      </h3>
                      <p style={{ color: '#475569', fontSize: '0.875rem', margin: '0.25rem 0 0', fontWeight: 500 }}>Actualizada hace 3 meses</p>
                    </div>
                    <button type="button" style={{ padding: '0.5rem 1rem', backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '0.5rem', fontWeight: 700, color: '#0f172a', cursor: 'pointer' }}>Actualizar</button>
                  </div>
                </div>

                <div style={{ padding: '1.5rem', border: '1px solid #cbd5e1', borderRadius: '0.75rem', marginBottom: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Smartphone size={18} /> Autenticación en dos pasos (2FA)
                      </h3>
                      <p style={{ color: '#475569', fontSize: '0.875rem', margin: '0.25rem 0 0', fontWeight: 500 }}>Añade una capa extra de seguridad vinculando tu dispositivo móvil.</p>
                    </div>
                    <button type="button" style={{ padding: '0.5rem 1rem', backgroundColor: '#000066', border: 'none', borderRadius: '0.5rem', fontWeight: 700, color: '#ffffff', cursor: 'pointer' }}>Activar 2FA</button>
                  </div>
                </div>

                <div style={{ padding: '1.5rem', border: '1px solid #cbd5e1', borderRadius: '0.75rem' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Shield size={18} /> Sesiones Activas
                  </h3>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '1rem', borderBottom: '1px solid #e2e8f0' }}>
                    <div>
                      <p style={{ fontWeight: 700, color: '#0f172a', margin: 0, fontSize: '0.875rem' }}>Windows PC - Chrome (Actual)</p>
                      <p style={{ color: '#475569', fontSize: '0.75rem', margin: 0 }}>Monterrey, NL • IP: 192.168.1.1</p>
                    </div>
                    <span style={{ color: '#059669', fontSize: '0.75rem', fontWeight: 700 }}>Activo Ahora</span>
                  </div>
                </div>
              </div>
            )}

            {/* SECTION 3: AI PREFERENCES */}
            {activeTab === 'ai' && (
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Bot size={24} color="#000066" /> Preferencias de IA & Transcripción
                </h2>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }}>
                  <div>
                    <label style={labelStyle}>Modelo de IA por Defecto</label>
                    <select style={inputStyle}>
                      <option>LegalFlow Nexus (Recomendado para sentencias)</option>
                      <option>LegalFlow Lite (Rápido - Ideal para borradores)</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Formato Predeterminado de Exportación</label>
                    <select style={inputStyle}>
                      <option>Microsoft Word (.docx) - Plantilla PJENL Oficial</option>
                      <option>PDF (Lectura Segura)</option>
                      <option>Texto Plano (.txt)</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Idioma Principal de Transcripción</label>
                    <select style={inputStyle}>
                      <option>Español (México) - Diccionario Jurídico</option>
                      <option>Inglés</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* SECTION 4: BILLING */}
            {activeTab === 'billing' && (
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <CreditCard size={24} color="#000066" /> Suscripción y Facturación
                </h2>
                
                <div style={{ backgroundColor: '#f8fafc', padding: '1.5rem', border: '2px solid #000066', borderRadius: '0.75rem', marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#000066', fontWeight: 800 }}>Plan Actual</span>
                    <h3 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#0f172a', margin: '0.25rem 0' }}>Pro Anual</h3>
                    <p style={{ color: '#475569', fontSize: '0.875rem', margin: 0, fontWeight: 500 }}>Próxima renovación: 15 Dic 2026</p>
                  </div>
                  <button 
                    type="button"
                    onClick={() => navigate('/subscription')}
                    style={{ padding: '0.75rem 1.5rem', backgroundColor: '#000066', color: '#ffffff', border: 'none', borderRadius: '0.5rem', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(0,0,102,0.2)' }}>
                    Gestionar / Cambiar Plan
                  </button>
                </div>

                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', marginBottom: '1rem' }}>Facturas Recientes</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #cbd5e1' }}>
                      <th style={{ padding: '0.75rem', color: '#475569', fontSize: '0.875rem', fontWeight: 700 }}>Fecha</th>
                      <th style={{ padding: '0.75rem', color: '#475569', fontSize: '0.875rem', fontWeight: 700 }}>Monto</th>
                      <th style={{ padding: '0.75rem', color: '#475569', fontSize: '0.875rem', fontWeight: 700 }}>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '1rem 0.75rem', color: '#0f172a', fontWeight: 600, fontSize: '0.875rem' }}>15 Dic 2025</td>
                      <td style={{ padding: '1rem 0.75rem', color: '#0f172a', fontWeight: 600, fontSize: '0.875rem' }}>$1,200.00 MXN</td>
                      <td style={{ padding: '1rem 0.75rem' }}><span style={{ backgroundColor: '#dcfce7', color: '#15803d', padding: '0.25rem 0.5rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 700 }}>Pagado</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ marginTop: '2.5rem', paddingTop: '1.5rem', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end' }}>
              <button 
                type="submit"
                style={{ padding: '0.875rem 2rem', backgroundColor: '#000066', color: '#ffffff', border: 'none', borderRadius: '0.5rem', fontWeight: 800, fontSize: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: '0 4px 6px -1px rgba(0,0,102,0.2)' }}>
                <Save size={18} /> Guardar Cambios
              </button>
            </div>
            
          </form>
        </div>
      </div>
      </div>
    </div>
  );
};
