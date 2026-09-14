import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Gavel, Eye, ArrowRight, ShieldCheck, Lock } from 'lucide-react';
import { AuthService } from '../services/AuthService';

const authService = new AuthService();

export const LoginView: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleGoogleLogin = async () => {
    const success = await authService.loginWithGoogle();
    if (success) {
      navigate('/dashboard');
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (email && password) {
      const success = await authService.loginWithEmail(email, password);
      if (success) {
        navigate('/dashboard');
      }
    } else {
      alert("Por favor ingrese correo y contraseña");
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', backgroundColor: '#f5f5f8', fontFamily: 'Inter, sans-serif' }}>
      
      {/* Left side: Branding & Premium Gradient */}
      <div style={{ flex: 1, background: 'linear-gradient(135deg, #000066 0%, #000033 100%)', padding: '4rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', color: 'white', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, right: 0, width: '100%', height: '100%', opacity: 0.1, backgroundImage: 'radial-gradient(circle, #C5A059 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', position: 'relative', zIndex: 10 }}>
          <div style={{ width: '3rem', height: '3rem', backgroundColor: '#C5A059', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Gavel size={24} color="#000066" />
          </div>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0, letterSpacing: '-0.025em' }}>LegalFlow</h1>
            <p style={{ fontSize: '0.625rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#C5A059', fontWeight: 700, margin: 0 }}>Premium Legal Tech</p>
          </div>
        </div>

        <div style={{ position: 'relative', zIndex: 10, maxWidth: '28rem' }}>
          <h2 style={{ fontSize: '3.5rem', fontWeight: 800, marginBottom: '1.5rem', lineHeight: 1.1, letterSpacing: '-0.025em' }}>Gestión Legal Inteligente.</h2>
          <p style={{ fontSize: '1.25rem', color: '#cbd5e1', lineHeight: 1.6, marginBottom: '2rem' }}>
            Acceda a su ecosistema digital de alta seguridad. Automatice actas y procese audiencias con IA avanzada.
          </p>
          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ShieldCheck size={20} color="#C5A059" />
              <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>SSL 256-bit AES</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Lock size={20} color="#C5A059" />
              <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>CJF Compliant</span>
            </div>
          </div>
        </div>

        <div style={{ position: 'relative', zIndex: 10, fontSize: '0.875rem', color: '#94a3b8' }}>
          © 2026 LegalFlow. Todos los derechos reservados.
        </div>
      </div>

      {/* Right side: Login Form */}
      <div style={{ flex: '0 0 560px', backgroundColor: 'white', padding: '4rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'relative', boxShadow: '-20px 0 25px -5px rgba(0,0,0,0.05)' }}>
        <div style={{ maxWidth: '360px', width: '100%', margin: '0 auto' }}>
          <h2 style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.5rem', letterSpacing: '-0.025em' }}>Iniciar Sesión</h2>
          <p style={{ color: '#64748b', fontSize: '1rem', marginBottom: '2.5rem', lineHeight: 1.5 }}>
            Ingrese sus credenciales judiciales para acceder al portal.
          </p>

          <button 
            onClick={handleGoogleLogin}
            style={{ width: '100%', height: '3.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '0.75rem', fontWeight: 600, color: '#334155', cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', marginBottom: '1.5rem', transition: 'all 0.2s' }}>
            <img alt="Google" style={{ width: '20px', height: '20px' }} src="https://lh3.googleusercontent.com/aida-public/AB6AXuDLd1_87qo7l5hDRWD2lHWIUDC8C-qIYdO6irGZKTOe7bGN0rcyorgAtDbNJNzbRK2ggOrtBVBhLu6-1bflYGhcKnKEJ_IkuUgTmjETBnueRee5vMQ40jHxCOdYf6dhlKejovWQu_mnVP43a95_sgUM3WbZFKTdMI7vaMFMqhCjmjA1l0_xGu1h282f45HDhMuJQluSpXzjToxD21R1_Ll1nfZ2b63cMZqH22x-5JKw_5GOEEDn37TGU4ZqINFqDGgdqr0uOui52Ntx" />
            Continuar con Google Workspace
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
            <div style={{ flex: 1, height: '1px', backgroundColor: '#e2e8f0' }}></div>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>O correo institucional</span>
            <div style={{ flex: 1, height: '1px', backgroundColor: '#e2e8f0' }}></div>
          </div>

          <form onSubmit={handleEmailLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.5rem' }}>Correo Electrónico</label>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="dr.mendoza@pjenl.gob.mx" 
                style={{ width: '100%', height: '3.5rem', padding: '0 1rem', borderRadius: '0.75rem', border: '1px solid #e2e8f0', fontSize: '1rem', outline: 'none', backgroundColor: '#f8fafc', color: '#0f172a' }}
              />
            </div>
            
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <label style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0f172a' }}>Contraseña Segura</label>
                <a href="#" style={{ fontSize: '0.75rem', fontWeight: 600, color: '#000066', textDecoration: 'none' }}>¿Olvidó su contraseña?</a>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', width: '100%', height: '3.5rem', backgroundColor: '#f8fafc', borderRadius: '0.75rem', border: '1px solid #e2e8f0' }}>
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••" 
                  style={{ flex: 1, height: '100%', border: 'none', background: 'transparent', padding: '0 1rem', fontSize: '1rem', outline: 'none', color: '#0f172a' }}
                />
                <button type="button" style={{ padding: '0 1rem', background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                  <Eye size={20} />
                </button>
              </div>
            </div>

            <button type="submit" style={{ width: '100%', height: '3.5rem', backgroundColor: '#000066', color: 'white', fontWeight: 700, fontSize: '1rem', borderRadius: '0.75rem', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginTop: '1rem', boxShadow: '0 4px 6px -1px rgba(0,0,102,0.2)', transition: 'all 0.2s' }}>
              Acceder al Portal <ArrowRight size={18} />
            </button>
          </form>

          <p style={{ textAlign: 'center', fontSize: '0.875rem', color: '#64748b', marginTop: '2rem' }}>
            ¿No tiene cuenta? <a href="#" style={{ color: '#000066', fontWeight: 700, textDecoration: 'none' }}>Solicitar Acceso Institucional</a>
          </p>
        </div>
      </div>

    </div>
  );
};
