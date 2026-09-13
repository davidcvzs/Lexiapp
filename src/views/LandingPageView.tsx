import React from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Gavel, 
  CheckCircle, 
  Users, 
  Brain, 
  FileText, 
  Scale, 
  Check, 
  ShieldCheck 
} from 'lucide-react';

export const LandingPageView: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f5f8', fontFamily: 'Inter, sans-serif' }}>
      {/* Top Navigation */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 50, display: 'flex', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(12px)', padding: '1rem 1.5rem', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ color: '#000066', display: 'flex', alignItems: 'center' }}>
            <Gavel size={32} />
          </div>
          <h2 style={{ color: '#000066', fontSize: '1.25rem', fontWeight: 800, margin: 0, letterSpacing: '-0.025em' }}>LegalFlow</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <a href="#features" style={{ color: '#475569', fontWeight: 500, fontSize: '0.875rem', textDecoration: 'none' }}>Características</a>
          <a href="#solutions" style={{ color: '#475569', fontWeight: 500, fontSize: '0.875rem', textDecoration: 'none' }}>Soluciones</a>
          <a href="#pricing" style={{ color: '#475569', fontWeight: 500, fontSize: '0.875rem', textDecoration: 'none' }}>Precios</a>
          <button 
            onClick={() => navigate('/login')}
            style={{ backgroundColor: '#000066', color: 'white', padding: '0.5rem 1.25rem', borderRadius: '0.5rem', fontWeight: 700, fontSize: '0.875rem', border: 'none', cursor: 'pointer', transition: 'opacity 0.2s' }}>
            Iniciar Sesión
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <header style={{ padding: '3rem 1.5rem', backgroundColor: 'white', overflow: 'hidden' }}>
        <div style={{ maxWidth: '80rem', margin: '0 auto', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '3rem' }}>
          <div style={{ flex: '1 1 500px', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem 0.75rem', borderRadius: '9999px', backgroundColor: 'rgba(0,0,102,0.1)', color: '#000066', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', width: 'fit-content' }}>
                <ShieldCheck size={14} /> IA de Confianza para el PJENL
              </span>
              <h1 style={{ color: '#0f172a', fontSize: '3.5rem', fontWeight: 900, lineHeight: 1.1, margin: 0, letterSpacing: '-0.025em' }}>
                LegalFlow: <span style={{ color: '#000066' }}>Transcriptor</span> y Redactor Jurídico de Elite
              </h1>
              <p style={{ color: '#475569', fontSize: '1.25rem', lineHeight: 1.6, margin: 0 }}>
                Optimice su práctica legal con IA especializada en formatos oficiales. Diseñado específicamente para Proyectistas y Litigantes que exigen precisión absoluta.
              </p>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
              <button 
                onClick={() => navigate('/login')}
                style={{ backgroundColor: '#000066', color: 'white', height: '3.5rem', padding: '0 2rem', borderRadius: '0.75rem', fontWeight: 800, fontSize: '1.125rem', border: 'none', cursor: 'pointer', boxShadow: '0 10px 15px -3px rgba(0,0,102,0.2)' }}>
                Comenzar ahora
              </button>
              <button style={{ backgroundColor: 'transparent', border: '2px solid rgba(0,0,102,0.2)', color: '#000066', height: '3.5rem', padding: '0 2rem', borderRadius: '0.75rem', fontWeight: 800, fontSize: '1.125rem', cursor: 'pointer' }}>
                Ver Demo
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.875rem', color: '#64748b', fontWeight: 500 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><CheckCircle size={16} color="#C5A059" /> Sin tarjeta de crédito</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><CheckCircle size={16} color="#C5A059" /> Formatos PJENL 2026</span>
            </div>
          </div>
          
          <div style={{ flex: '1 1 400px', width: '100%', maxWidth: '600px' }}>
            <div style={{ position: 'relative', borderRadius: '1rem', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', border: '1px solid #e2e8f0', aspectRatio: '4/3', backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuC0baaMNZRPtPVkdVrrTdhmTCwX35RNJGnSEGYNhjnmvuAxD3r1Eg4ag6gMjZcjJxnX2qt21UFlkS-JTaWfNdWlKAQDsaOT1cJ2VnkHt_6tbdaS52M-sl1Lg4TFDnpk4FzSWpHkLjZGYNCocRFE2ihoiz_Yp--LgjR5I-NAem1cNR3qotPjLw1k6ugFP52gpCCZXg-wjC7lp4HKZLDKSkfsasM7WiUwjCch7HAcvuPJFU1yWajrz1SOWK4idxSRuo5V-dOXJ2pcxCbd")', backgroundSize: 'cover', backgroundPosition: 'center' }}>
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,102,0.4), transparent)' }}></div>
            </div>
          </div>
        </div>
      </header>

      {/* Features Section */}
      <section id="features" style={{ padding: '5rem 1.5rem', backgroundColor: '#f8fafc' }}>
        <div style={{ maxWidth: '80rem', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', maxWidth: '48rem', margin: '0 auto 4rem' }}>
            <h2 style={{ color: '#0f172a', fontSize: '2.5rem', fontWeight: 800, marginBottom: '1rem', letterSpacing: '-0.025em' }}>Herramientas de Alta Precisión</h2>
            <p style={{ color: '#475569', fontSize: '1.125rem' }}>Tecnología avanzada desarrollada exclusivamente para los desafíos del derecho mexicano moderno.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
            
            <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '1rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
              <div style={{ width: '3rem', height: '3rem', backgroundColor: 'rgba(0,0,102,0.05)', borderRadius: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000066', marginBottom: '1.5rem' }}>
                <Users size={24} color="#C5A059" />
              </div>
              <h3 style={{ color: '#0f172a', fontSize: '1.25rem', fontWeight: 800, marginBottom: '0.75rem' }}>Diarización Avanzada</h3>
              <p style={{ color: '#475569', fontSize: '0.875rem', lineHeight: 1.6, margin: 0 }}>Identificación precisa de cada interviniente en grabaciones de audiencias judiciales con etiquetado automático.</p>
            </div>

            <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '1rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
              <div style={{ width: '3rem', height: '3rem', backgroundColor: 'rgba(0,0,102,0.05)', borderRadius: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000066', marginBottom: '1.5rem' }}>
                <Brain size={24} color="#C5A059" />
              </div>
              <h3 style={{ color: '#0f172a', fontSize: '1.25rem', fontWeight: 800, marginBottom: '0.75rem' }}>IA Jurídica Especializada</h3>
              <p style={{ color: '#475569', fontSize: '0.875rem', lineHeight: 1.6, margin: 0 }}>Modelos de lenguaje entrenados específicamente con jurisprudencia y terminología técnica del sistema jurídico mexicano.</p>
            </div>

            <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '1rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
              <div style={{ width: '3rem', height: '3rem', backgroundColor: 'rgba(0,0,102,0.05)', borderRadius: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000066', marginBottom: '1.5rem' }}>
                <FileText size={24} color="#C5A059" />
              </div>
              <h3 style={{ color: '#0f172a', fontSize: '1.25rem', fontWeight: 800, marginBottom: '0.75rem' }}>Formatos Oficiales PJENL</h3>
              <p style={{ color: '#475569', fontSize: '0.875rem', lineHeight: 1.6, margin: 0 }}>Exporte sus transcripciones y borradores directamente a los estándares requeridos por el Poder Judicial de Nuevo León.</p>
            </div>

          </div>
        </div>
      </section>

      {/* Solutions Section */}
      <section id="solutions" style={{ padding: '5rem 1.5rem', backgroundColor: 'white' }}>
        <div style={{ maxWidth: '80rem', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '3rem' }}>
          
          <div style={{ backgroundColor: '#000066', borderRadius: '1.5rem', padding: '2.5rem', color: 'white', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '400px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                <Scale size={32} color="#C5A059" />
                <h3 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>Para Proyectistas</h3>
              </div>
              <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '1.125rem', lineHeight: 1.6, marginBottom: '2rem' }}>Optimice la redacción de sus sentencias. Nuestra IA asiste en la estructuración de resolutivos con una coherencia doctrinal impecable.</p>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 2rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Check size={16} color="#C5A059" /> Síntesis de hechos automatizada</li>
                <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Check size={16} color="#C5A059" /> Citas jurisprudenciales dinámicas</li>
                <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Check size={16} color="#C5A059" /> Formato de sentencia oficial</li>
              </ul>
            </div>
            <button style={{ backgroundColor: 'white', color: '#000066', padding: '0.75rem 1.5rem', borderRadius: '0.5rem', fontWeight: 800, border: 'none', width: 'fit-content', cursor: 'pointer' }}>
              Ver herramientas de juzgado
            </button>
          </div>

          <div style={{ backgroundColor: 'white', border: '2px solid #000066', borderRadius: '1.5rem', padding: '2.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '400px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                <Gavel size={32} color="#000066" />
                <h3 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Para Litigantes</h3>
              </div>
              <p style={{ color: '#475569', fontSize: '1.125rem', lineHeight: 1.6, marginBottom: '2rem' }}>Elabore demandas y recursos de amparo en una fracción del tiempo habitual, sin comprometer la calidad técnica.</p>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 2rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#475569' }}><Check size={16} color="#000066" /> Redacción asistida de agravios</li>
                <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#475569' }}><Check size={16} color="#000066" /> Transcripción rápida de probanzas</li>
                <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#475569' }}><Check size={16} color="#000066" /> Estructura estándar de amparos</li>
              </ul>
            </div>
            <button style={{ backgroundColor: '#000066', color: 'white', padding: '0.75rem 1.5rem', borderRadius: '0.5rem', fontWeight: 800, border: 'none', width: 'fit-content', cursor: 'pointer' }}>
              Explorar herramientas de litigio
            </button>
          </div>

        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" style={{ padding: '5rem 1.5rem', backgroundColor: '#f8fafc' }}>
        <div style={{ maxWidth: '64rem', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
            <h2 style={{ color: '#0f172a', fontSize: '2.5rem', fontWeight: 800, marginBottom: '1rem', letterSpacing: '-0.025em' }}>Planes diseñados para usted</h2>
            <p style={{ color: '#475569', fontSize: '1.125rem' }}>Escalabilidad total desde un solo uso hasta suscripciones profesionales.</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
            {/* Free Tier */}
            <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '1.5rem', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div style={{ marginBottom: '2rem' }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.5rem' }}>Prueba Gratuita</h3>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.25rem' }}>
                  <span style={{ fontSize: '2.5rem', fontWeight: 900, color: '#0f172a' }}>$0</span>
                  <span style={{ color: '#64748b', fontWeight: 500 }}>MXN</span>
                </div>
                <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: '0.5rem' }}>Pruebe el poder de la IA sin costo.</p>
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 2rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <li style={{ display: 'flex', gap: '0.75rem', color: '#475569', fontSize: '0.875rem' }}><Check size={18} color="#000066" /> 1 uso único completo</li>
                <li style={{ display: 'flex', gap: '0.75rem', color: '#475569', fontSize: '0.875rem' }}><Check size={18} color="#000066" /> Diarización básica</li>
                <li style={{ display: 'flex', gap: '0.75rem', color: '#475569', fontSize: '0.875rem' }}><Check size={18} color="#000066" /> Exportación a Word</li>
              </ul>
              <button onClick={() => navigate('/login')} style={{ width: '100%', padding: '1rem', border: '2px solid #e2e8f0', borderRadius: '0.75rem', backgroundColor: 'transparent', color: '#475569', fontWeight: 800, cursor: 'pointer' }}>
                Probar Gratis
              </button>
            </div>

            {/* Pro Tier */}
            <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '1.5rem', border: '2px solid #000066', boxShadow: '0 20px 25px -5px rgba(0,0,102,0.1)', display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
              <div style={{ position: 'absolute', top: 0, right: 0, backgroundColor: '#000066', color: 'white', fontSize: '0.625rem', fontWeight: 900, padding: '0.25rem 1rem', textTransform: 'uppercase', letterSpacing: '0.1em', borderRadius: '0 0 0 1rem', marginTop: '1rem' }}>
                Recomendado
              </div>
              <div style={{ marginBottom: '2rem' }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.5rem' }}>Plan Pro</h3>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.25rem' }}>
                  <span style={{ fontSize: '2.5rem', fontWeight: 900, color: '#000066' }}>$60</span>
                  <span style={{ color: '#64748b', fontWeight: 500 }}>MXN/mes</span>
                </div>
                <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: '0.5rem' }}>Acceso total para el profesional activo.</p>
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 2rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <li style={{ display: 'flex', gap: '0.75rem', color: '#0f172a', fontSize: '0.875rem', fontWeight: 500 }}><CheckCircle size={18} color="#C5A059" /> Transcripciones ilimitadas</li>
                <li style={{ display: 'flex', gap: '0.75rem', color: '#0f172a', fontSize: '0.875rem', fontWeight: 500 }}><CheckCircle size={18} color="#C5A059" /> Redactor de demandas/sentencias</li>
                <li style={{ display: 'flex', gap: '0.75rem', color: '#0f172a', fontSize: '0.875rem', fontWeight: 500 }}><CheckCircle size={18} color="#C5A059" /> IA Personalizada para PJENL</li>
                <li style={{ display: 'flex', gap: '0.75rem', color: '#0f172a', fontSize: '0.875rem', fontWeight: 500 }}><CheckCircle size={18} color="#C5A059" /> Soporte prioritario 24/7</li>
              </ul>
              <button onClick={() => navigate('/login')} style={{ width: '100%', padding: '1rem', border: 'none', borderRadius: '0.75rem', backgroundColor: '#000066', color: 'white', fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(0,0,102,0.2)' }}>
                Suscribirme ahora
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section style={{ padding: '5rem 1.5rem', backgroundColor: '#000066', color: 'white', textAlign: 'center' }}>
        <div style={{ maxWidth: '48rem', margin: '0 auto' }}>
          <h2 style={{ fontSize: '2.5rem', fontWeight: 900, marginBottom: '1.5rem', letterSpacing: '-0.025em' }}>Transforme su flujo de trabajo legal hoy</h2>
          <p style={{ fontSize: '1.125rem', color: 'rgba(255,255,255,0.8)', marginBottom: '2.5rem' }}>Únase a los cientos de profesionales que ya han reducido sus tiempos de redacción en un 60%.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '1rem' }}>
            <button 
              onClick={() => navigate('/login')}
              style={{ padding: '1rem 3rem', backgroundColor: 'white', color: '#000066', fontSize: '1.125rem', fontWeight: 800, borderRadius: '1rem', border: 'none', cursor: 'pointer' }}>
              Comenzar ahora
            </button>
          </div>
        </div>
      </section>

    </div>
  );
};
