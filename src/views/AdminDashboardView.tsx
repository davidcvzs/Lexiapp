import React from 'react';
import { 
  Wallet, 
  Users, 
  TrendingUp, 
  Activity, 
  Database,
  Search,
  MoreVertical,
  Download
} from 'lucide-react';

export const AdminDashboardView: React.FC = () => {
  return (
    <div style={{ backgroundColor: '#f8fafc', minHeight: '100vh', padding: '1.5rem', fontFamily: 'Inter, sans-serif' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.025em' }}>Panel de Administración e Ingresos</h1>
          <p style={{ color: '#64748b', fontSize: '0.875rem', margin: '0.25rem 0 0' }}>Vista general de finanzas y uso de la plataforma LegalFlow</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: 'white', border: '1px solid #e2e8f0', padding: '0.5rem 1rem', borderRadius: '0.5rem', color: '#0f172a', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer' }}>
            <Download size={16} /> Exportar Reporte
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        
        {/* MRR Card */}
        <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '1rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: '-1rem', right: '-1rem', width: '6rem', height: '6rem', backgroundColor: '#000066', opacity: 0.05, borderRadius: '50%' }}></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ color: '#475569', fontSize: '0.875rem', fontWeight: 600, margin: 0 }}>Ingresos Recurrentes (MRR)</h3>
            <div style={{ width: '2rem', height: '2rem', borderRadius: '0.5rem', backgroundColor: 'rgba(0,0,102,0.1)', color: '#000066', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Wallet size={16} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
            <span style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.025em' }}>$125,430</span>
            <span style={{ color: '#64748b', fontSize: '0.875rem', fontWeight: 600 }}>MXN</span>
          </div>
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', color: '#10b981', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <TrendingUp size={12} /> +12% vs mes anterior
          </p>
        </div>

        {/* Active Subscribers */}
        <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '1rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ color: '#475569', fontSize: '0.875rem', fontWeight: 600, margin: 0 }}>Suscriptores Activos</h3>
            <div style={{ width: '2rem', height: '2rem', borderRadius: '0.5rem', backgroundColor: 'rgba(197,160,89,0.1)', color: '#C5A059', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Users size={16} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
            <span style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.025em' }}>1,284</span>
          </div>
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', color: '#10b981', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <TrendingUp size={12} /> +45 esta semana
          </p>
        </div>

        {/* Transcriptions Processed */}
        <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '1rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ color: '#475569', fontSize: '0.875rem', fontWeight: 600, margin: 0 }}>Actas Generadas</h3>
            <div style={{ width: '2rem', height: '2rem', borderRadius: '0.5rem', backgroundColor: 'rgba(0,0,102,0.1)', color: '#000066', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Activity size={16} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
            <span style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.025em' }}>8,492</span>
          </div>
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>En los últimos 30 días</p>
        </div>

        {/* AI Tokens Consumed */}
        <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '1rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ color: '#475569', fontSize: '0.875rem', fontWeight: 600, margin: 0 }}>Consumo de Tokens IA</h3>
            <div style={{ width: '2rem', height: '2rem', borderRadius: '0.5rem', backgroundColor: 'rgba(197,160,89,0.1)', color: '#C5A059', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Database size={16} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
            <span style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.025em' }}>42.5M</span>
          </div>
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', color: '#f59e0b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <TrendingUp size={12} /> 85% de capacidad límite
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem', marginBottom: '2rem' }}>
        {/* Revenue Chart Stand-in */}
        <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '1rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Crecimiento de Suscripciones (30 días)</h3>
          </div>
          <div style={{ width: '100%', height: '200px', position: 'relative' }}>
             <svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 800 200" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M0 180 C100 160, 200 170, 300 120 C400 70, 500 90, 600 40 C700 -10, 750 30, 800 20 L800 200 L0 200 Z" fill="url(#grad_revenue)"/>
              <path d="M0 180 C100 160, 200 170, 300 120 C400 70, 500 90, 600 40 C700 -10, 750 30, 800 20" stroke="#000066" strokeWidth="4" strokeLinecap="round"/>
              <defs>
                <linearGradient id="grad_revenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#000066" stopOpacity="0.2"/>
                  <stop offset="100%" stopColor="#000066" stopOpacity="0"/>
                </linearGradient>
              </defs>
            </svg>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>
              <span>Semana 1</span>
              <span>Semana 2</span>
              <span>Semana 3</span>
              <span>Semana 4</span>
            </div>
          </div>
        </div>
      </div>

      {/* User Management Table */}
      <div style={{ backgroundColor: 'white', borderRadius: '1rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <div style={{ padding: '1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Gestión de Usuarios</h3>
          <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#f8fafc', padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0', width: '250px' }}>
            <Search size={16} color="#94a3b8" />
            <input 
              type="text" 
              placeholder="Buscar abogados..." 
              style={{ border: 'none', backgroundColor: 'transparent', outline: 'none', marginLeft: '0.5rem', fontSize: '0.875rem', width: '100%', color: '#0f172a' }}
            />
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Abogado / Firma</th>
                <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Plan</th>
                <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ingreso Mensual</th>
                <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Estado</th>
                <th style={{ padding: '1rem 1.5rem' }}></th>
              </tr>
            </thead>
            <tbody>
              {[
                { name: 'Lic. Juan Delgado', email: 'jdelgado@bufete.com', plan: 'Plan Premium', amount: '$2,499 MXN', status: 'Activo' },
                { name: 'Maria Robles', email: 'mrobles@lex.mx', plan: 'Plan Pro', amount: '$1,850 MXN', status: 'Activo' },
                { name: 'Arturo Sosa', email: 'asosa@firma.com', plan: 'Plan Basic', amount: '$950 MXN', status: 'Suspendido' }
              ].map((user, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '1rem 1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <div style={{ width: '2.5rem', height: '2.5rem', borderRadius: '50%', backgroundColor: 'rgba(0,0,102,0.1)', color: '#000066', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.875rem' }}>
                        {user.name.split(' ').map(n => n[0]).join('').substring(0,2)}
                      </div>
                      <div>
                        <p style={{ margin: '0 0 0.25rem', fontWeight: 700, color: '#0f172a', fontSize: '0.875rem' }}>{user.name}</p>
                        <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '1rem 1.5rem' }}>
                    <span style={{ backgroundColor: user.plan.includes('Premium') ? '#000066' : (user.plan.includes('Pro') ? '#C5A059' : '#f1f5f9'), color: user.plan.includes('Basic') ? '#475569' : 'white', padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 700 }}>
                      {user.plan}
                    </span>
                  </td>
                  <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem', color: '#0f172a', fontWeight: 600 }}>
                    {user.amount}
                  </td>
                  <td style={{ padding: '1rem 1.5rem' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.75rem', fontWeight: 600, color: user.status === 'Activo' ? '#10b981' : '#f43f5e' }}>
                      <span style={{ width: '0.5rem', height: '0.5rem', borderRadius: '50%', backgroundColor: user.status === 'Activo' ? '#10b981' : '#f43f5e' }}></span>
                      {user.status}
                    </span>
                  </td>
                  <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                    <button style={{ backgroundColor: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                      <MoreVertical size={18} />
                    </button>
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
