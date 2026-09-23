import React, { useState, useEffect } from 'react';
import { Search, Library, Scale, FileText, BookOpen, AlertCircle, Loader } from 'lucide-react';

type Category = 'SCJN' | 'PJENL' | 'DOCTRINA';

export const LegalSearchView: React.FC = () => {
  const [activeCategory, setActiveCategory] = useState<Category>('SCJN');
  const [searchQuery, setSearchQuery] = useState('');
  
  // SCJN specific states
  const [registroDigital, setRegistroDigital] = useState('');
  const [scjnResults, setScjnResults] = useState<any[]>([]);
  const [scjnTotal, setScjnTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [selectedTesis, setSelectedTesis] = useState<any | null>(null);

  // Catalogs
  const [catalogs, setCatalogs] = useState<{
    epocas: any[];
    anios: any[];
    instancias: any[];
    organos: any[];
    materias: any[];
    asuntos: any[];
    ponentes: any[];
    tipos: any[];
    formasIntegracion: any[];
  } | null>(null);
  
  // Selected Filters
  const [selectedEpoca, setSelectedEpoca] = useState('');
  const [selectedAnio, setSelectedAnio] = useState('');
  const [selectedInstancia, setSelectedInstancia] = useState('');
  const [selectedOrgano, setSelectedOrgano] = useState('');
  const [selectedMateria, setSelectedMateria] = useState('');
  const [selectedAsunto, setSelectedAsunto] = useState('');
  const [selectedPonente, setSelectedPonente] = useState('');
  const [selectedTipo, setSelectedTipo] = useState('');
  const [selectedFormaIntegracion, setSelectedFormaIntegracion] = useState('');

  // PJENL and DOCTRINA integrations are not yet implemented.
  // We will directly show the "coming soon" messages in the render logic for these categories.

  const loadCatalogs = async () => {
    try {
      const res = await fetch('/api/scjn/catalogs');
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      const text = await res.text();
      if (text.trim().startsWith('<')) {
        throw new Error("El servidor devolvió HTML (posiblemente falta el backend en producción).");
      }
      const data = text ? JSON.parse(text) : {};
      setCatalogs(data);
      
    } catch (err: any) {
      console.error('Error cargando catálogos:', err);
    }
  };

  useEffect(() => {
    loadCatalogs();
  }, []);

  const clearFilters = () => {
    setSearchQuery('');
    setRegistroDigital('');
    setSelectedEpoca('');
    setSelectedAnio('');
    setSelectedInstancia('');
    setSelectedOrgano('');
    setSelectedMateria('');
    setSelectedAsunto('');
    setSelectedPonente('');
    setSelectedTipo('');
    setSelectedFormaIntegracion('');
    setTimeout(() => handleSearch(1), 0);
  };

  const handleSearch = async (overridePage?: number) => {
    if (activeCategory !== 'SCJN') return;
    
    setIsLoading(true);
    setError(null);
    const currentPage = overridePage || 1;
    setPage(currentPage);

    try {
      const params = new URLSearchParams();
      if (searchQuery) params.append('q', searchQuery);
      if (registroDigital) params.append('registro', registroDigital);
      
      // Add filters
      if (selectedEpoca) params.append('epoca', selectedEpoca);
      if (selectedAnio) params.append('anio', selectedAnio);
      if (selectedInstancia) params.append('instancia', selectedInstancia);
      if (selectedOrgano) params.append('organo', selectedOrgano);
      if (selectedMateria) params.append('materia', selectedMateria);
      if (selectedAsunto) params.append('asunto', selectedAsunto);
      if (selectedPonente) params.append('ponente', selectedPonente);
      if (selectedTipo) params.append('tipo', selectedTipo);
      if (selectedFormaIntegracion) params.append('formaIntegracion', selectedFormaIntegracion);

      params.append('page', currentPage.toString());
      params.append('pageSize', '10');

      const res = await fetch(`/api/scjn/search?${params.toString()}`);
      
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      const text = await res.text();
      if (text.trim().startsWith('<')) {
        throw new Error("El servidor devolvió HTML. Asegúrese de que el backend esté ejecutándose.");
      }
      const data = text ? JSON.parse(text) : {};

      setScjnResults(data.data || []);
      setScjnTotal(data.total || 0);
    } catch (err: any) {
      setError(err.message || 'El servicio del Semanario Judicial de la Federación no está disponible temporalmente.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewDetail = async (registro: string) => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetch(`/api/scjn/tesis/${registro}`);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      const text = await res.text();
      if (text.trim().startsWith('<')) {
        throw new Error("El servidor devolvió HTML. Asegúrese de que el backend esté ejecutándose.");
      }
      const data = text ? JSON.parse(text) : {};
      setSelectedTesis(data);
    } catch (err: any) {
      setError(err.message || 'Error al obtener detalle de tesis');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (activeCategory === 'SCJN') {
      handleSearch(1);
    }
  }, [activeCategory]);



  const getTabStyle = (category: Category) => {
    const isActive = activeCategory === category;
    if (isActive) {
      return {
        backgroundColor: '#000066',
        color: 'white',
        padding: '1.5rem',
        borderRadius: '0.75rem',
        border: '1px solid #000066',
        boxShadow: '0 4px 6px -1px rgba(0,0,102,0.2)',
        cursor: 'pointer',
        transition: 'all 0.2s ease-in-out',
      };
    }
    return {
      backgroundColor: 'white',
      color: '#334155', // slate-700
      padding: '1.5rem',
      borderRadius: '0.75rem',
      border: '1px solid #e2e8f0', // slate-200
      boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
      cursor: 'pointer',
      transition: 'all 0.2s ease-in-out',
    };
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f5f5f8', fontFamily: 'Inter, sans-serif', padding: '2rem 1rem', position: 'relative' }}>
      <div style={{ maxWidth: '64rem', margin: '0 auto', width: '100%' }}>
        
        {/* Header Section */}
        <div style={{ textAlign: 'center', marginBottom: '3rem', marginTop: '2rem' }}>
          <div style={{ width: '4rem', height: '4rem', margin: '0 auto 1.5rem', borderRadius: '1rem', backgroundColor: 'rgba(0,0,102,0.1)', color: '#000066', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Library size={32} />
          </div>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 800, color: '#0f172a', marginBottom: '1rem', letterSpacing: '-0.025em' }}>Biblioteca Legal y Jurisprudencia</h1>
          <p style={{ color: '#64748b', fontSize: '1.125rem', maxWidth: '32rem', margin: '0 auto' }}>Consulte de forma interactiva en las bases de datos de la SCJN y PJENL mediante Inteligencia Artificial.</p>
        </div>

        {/* Filters/Tabs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
          
          <div style={getTabStyle('SCJN')} onClick={() => { setActiveCategory('SCJN'); setError(null); }} onMouseEnter={(e) => { if (activeCategory !== 'SCJN') e.currentTarget.style.backgroundColor = '#f1f5f9'; }} onMouseLeave={(e) => { if (activeCategory !== 'SCJN') e.currentTarget.style.backgroundColor = 'white'; }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
              <div style={{ padding: '0.75rem', borderRadius: '0.5rem', backgroundColor: activeCategory === 'SCJN' ? 'rgba(255,255,255,0.2)' : 'rgba(197,160,89,0.1)', color: activeCategory === 'SCJN' ? 'white' : '#C5A059' }}><Scale size={20} /></div>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', color: activeCategory === 'SCJN' ? 'white' : '#0f172a', margin: 0 }}>Jurisprudencia SCJN</h3>
            </div>
            <p style={{ color: activeCategory === 'SCJN' ? '#e2e8f0' : '#64748b', fontSize: '0.875rem', marginBottom: '1rem', lineHeight: 1.5 }}>Explora resoluciones y precedentes obligatorios de la Suprema Corte de Justicia.</p>
          </div>

          <div style={getTabStyle('PJENL')} onClick={() => setActiveCategory('PJENL')} onMouseEnter={(e) => { if (activeCategory !== 'PJENL') e.currentTarget.style.backgroundColor = '#f1f5f9'; }} onMouseLeave={(e) => { if (activeCategory !== 'PJENL') e.currentTarget.style.backgroundColor = 'white'; }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
              <div style={{ padding: '0.75rem', borderRadius: '0.5rem', backgroundColor: activeCategory === 'PJENL' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,102,0.1)', color: activeCategory === 'PJENL' ? 'white' : '#000066' }}><FileText size={20} /></div>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', color: activeCategory === 'PJENL' ? 'white' : '#0f172a', margin: 0 }}>Criterios PJENL</h3>
            </div>
            <p style={{ color: activeCategory === 'PJENL' ? '#e2e8f0' : '#64748b', fontSize: '0.875rem', marginBottom: '1rem', lineHeight: 1.5 }}>Consultas específicas de criterios y jurisprudencia local del Estado de Nuevo León.</p>
          </div>

          <div style={getTabStyle('DOCTRINA')} onClick={() => setActiveCategory('DOCTRINA')} onMouseEnter={(e) => { if (activeCategory !== 'DOCTRINA') e.currentTarget.style.backgroundColor = '#f1f5f9'; }} onMouseLeave={(e) => { if (activeCategory !== 'DOCTRINA') e.currentTarget.style.backgroundColor = 'white'; }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
              <div style={{ padding: '0.75rem', borderRadius: '0.5rem', backgroundColor: activeCategory === 'DOCTRINA' ? 'rgba(255,255,255,0.2)' : 'rgba(15,23,42,0.05)', color: activeCategory === 'DOCTRINA' ? 'white' : '#475569' }}><BookOpen size={20} /></div>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', color: activeCategory === 'DOCTRINA' ? 'white' : '#0f172a', margin: 0 }}>Doctrina Legal</h3>
            </div>
            <p style={{ color: activeCategory === 'DOCTRINA' ? '#e2e8f0' : '#64748b', fontSize: '0.875rem', marginBottom: '1rem', lineHeight: 1.5 }}>Acceso a bibliografía y tratados referenciados frecuentemente en resoluciones.</p>
          </div>

        </div>

        {/* Search Bar Area */}
        <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '1rem', boxShadow: '0 4px 6px -1px rgba(0,0,102,0.1)', border: '1px solid #e2e8f0', marginBottom: '3rem' }}>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ flex: 2, minWidth: '300px', display: 'flex', alignItems: 'center', backgroundColor: '#f8fafc', padding: '0.75rem 1rem', borderRadius: '0.5rem', border: '1px solid #cbd5e1' }}>
              <Search size={20} color="#64748b" style={{ marginRight: '0.5rem' }} />
              <input 
                type="text" 
                placeholder="Palabras / rubro..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch(1)}
                style={{ flex: 1, border: 'none', backgroundColor: 'transparent', outline: 'none', fontSize: '1rem', color: '#0f172a' }}
              />
            </div>
            {activeCategory === 'SCJN' && (
              <div style={{ flex: 1, minWidth: '150px', display: 'flex', alignItems: 'center', backgroundColor: '#f8fafc', padding: '0.75rem 1rem', borderRadius: '0.5rem', border: '1px solid #cbd5e1' }}>
                <input 
                  type="text" 
                  placeholder="Registro digital..." 
                  value={registroDigital}
                  onChange={(e) => setRegistroDigital(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch(1)}
                  style={{ flex: 1, border: 'none', backgroundColor: 'transparent', outline: 'none', fontSize: '1rem', color: '#0f172a' }}
                />
              </div>
            )}
            <button 
              onClick={() => handleSearch(1)}
              style={{ backgroundColor: '#000066', color: '#C5A059', padding: '0.75rem 2rem', borderRadius: '0.5rem', fontWeight: 'bold', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', border: 'none', cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(0,0,102,0.2)' }}
            >
              Buscar
            </button>
          </div>
          
          {activeCategory === 'SCJN' && (
            <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#0f172a' }}>Filtros Tesis</h3>
                  <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#64748b' }}>Filtros basados en el Repositorio de Datos Abiertos de la SCJN.</p>
                </div>
                <button 
                  onClick={clearFilters}
                  style={{ backgroundColor: 'transparent', color: '#000066', border: '1px solid #000066', padding: '0.5rem 1rem', borderRadius: '0.25rem', fontSize: '0.875rem', cursor: 'pointer' }}>
                  Limpiar filtros
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
                <select value={selectedEpoca} onChange={(e) => setSelectedEpoca(e.target.value)} style={{ padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', outline: 'none', color: '#0f172a' }} disabled={!catalogs?.epocas || catalogs.epocas.length === 0}>
                  <option value="">{(!catalogs?.epocas || catalogs.epocas.length === 0) ? 'Época — sin datos importados' : 'Todas las épocas'}</option>
                  {catalogs?.epocas?.map((item: any) => <option key={item.id} value={item.id}>{item.description}</option>)}
                </select>

                <select value={selectedAnio} onChange={(e) => setSelectedAnio(e.target.value)} style={{ padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', outline: 'none', color: '#0f172a' }} disabled={!catalogs?.anios || catalogs.anios.length === 0}>
                  <option value="">{(!catalogs?.anios || catalogs.anios.length === 0) ? 'Año — sin datos importados' : 'Todos los años'}</option>
                  {catalogs?.anios?.map((item: any) => <option key={item.id} value={item.id}>{item.description}</option>)}
                </select>

                <select value={selectedInstancia} onChange={(e) => setSelectedInstancia(e.target.value)} style={{ padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', outline: 'none', color: '#0f172a' }} disabled={!catalogs?.instancias || catalogs.instancias.length === 0}>
                  <option value="">{(!catalogs?.instancias || catalogs.instancias.length === 0) ? 'Instancia — sin datos importados' : 'Todas las instancias'}</option>
                  {catalogs?.instancias?.map((item: any) => <option key={item.id} value={item.id}>{item.description}</option>)}
                </select>

                <select value={selectedOrgano} onChange={(e) => setSelectedOrgano(e.target.value)} style={{ padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', outline: 'none', color: '#0f172a' }} disabled={!catalogs?.organos || catalogs.organos.length === 0}>
                  <option value="">{(!catalogs?.organos || catalogs.organos.length === 0) ? 'Órgano — sin datos importados' : 'Todos los órganos'}</option>
                  {catalogs?.organos?.map((item: any) => <option key={item.id} value={item.id}>{item.description}</option>)}
                </select>

                <select value={selectedMateria} onChange={(e) => setSelectedMateria(e.target.value)} style={{ padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', outline: 'none', color: '#0f172a' }} disabled={!catalogs?.materias || catalogs.materias.length === 0}>
                  <option value="">{(!catalogs?.materias || catalogs.materias.length === 0) ? 'Materia — sin datos importados' : 'Todas las materias'}</option>
                  {catalogs?.materias?.map((item: any) => <option key={item.id} value={item.id}>{item.description}</option>)}
                </select>

                <select value={selectedAsunto} onChange={(e) => setSelectedAsunto(e.target.value)} style={{ padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', outline: 'none', color: '#0f172a' }} disabled={!catalogs?.asuntos || catalogs.asuntos.length === 0}>
                  <option value="">{(!catalogs?.asuntos || catalogs.asuntos.length === 0) ? 'Asunto — sin datos importados' : 'Todos los asuntos'}</option>
                  {catalogs?.asuntos?.map((item: any) => <option key={item.id} value={item.id}>{item.description}</option>)}
                </select>

                <select value={selectedPonente} onChange={(e) => setSelectedPonente(e.target.value)} style={{ padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', outline: 'none', color: '#0f172a' }} disabled={!catalogs?.ponentes || catalogs.ponentes.length === 0}>
                  <option value="">{(!catalogs?.ponentes || catalogs.ponentes.length === 0) ? 'Ponente — sin datos importados' : 'Todos los ponentes'}</option>
                  {catalogs?.ponentes?.map((item: any) => <option key={item.id} value={item.id}>{item.description}</option>)}
                </select>

                <select value={selectedTipo} onChange={(e) => setSelectedTipo(e.target.value)} style={{ padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', outline: 'none', color: '#0f172a' }} disabled={!catalogs?.tipos || catalogs.tipos.length === 0}>
                  <option value="">{(!catalogs?.tipos || catalogs.tipos.length === 0) ? 'Tipo — sin datos importados' : 'Todos los tipos'}</option>
                  {catalogs?.tipos?.map((item: any) => <option key={item.id} value={item.id}>{item.description}</option>)}
                </select>

                <select value={selectedFormaIntegracion} onChange={(e) => setSelectedFormaIntegracion(e.target.value)} style={{ padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', outline: 'none', color: '#0f172a' }} disabled={!catalogs?.formasIntegracion || catalogs.formasIntegracion.length === 0}>
                  <option value="">{(!catalogs?.formasIntegracion || catalogs.formasIntegracion.length === 0) ? 'Forma de integración — sin datos importados' : 'Todas las formas de integración'}</option>
                  {catalogs?.formasIntegracion?.map((item: any) => <option key={item.id} value={item.id}>{item.description}</option>)}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Error Display */}
        {error && (
          <div style={{ backgroundColor: '#fee2e2', color: '#991b1b', padding: '1rem', borderRadius: '0.5rem', marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.5rem', border: '1px solid #f87171' }}>
            <AlertCircle size={20} />
            {error}
          </div>
        )}

        {/* Results Section */}
        <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '1rem', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#0f172a', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            Resultados
            <span style={{ fontSize: '0.875rem', fontWeight: 'normal', backgroundColor: '#f1f5f9', color: '#64748b', padding: '0.25rem 0.75rem', borderRadius: '1rem' }}>
              {activeCategory === 'SCJN' 
                ? `Mostrando ${scjnTotal} resultados de la Suprema Corte de Justicia de la Nación (SCJN)` 
                : activeCategory === 'PJENL' 
                  ? 'Mostrando criterios y precedentes del Poder Judicial del Estado de Nuevo León (PJENL)' 
                  : 'Mostrando doctrina jurídica, tratados internacionales y literatura académica'}
            </span>
            {isLoading && <Loader size={16} className="animate-spin" style={{ marginLeft: 'auto', animation: 'spin 1s linear infinite' }} />}
          </h2>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            
            {activeCategory === 'SCJN' ? (
              isLoading ? (
                <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#64748b' }}>
                  <p>Buscando en el Repositorio SCJN...</p>
                </div>
              ) : scjnResults.length > 0 ? (
                scjnResults.map(result => (
                  <div key={result.registroDigital || Math.random()} style={{ padding: '1.5rem', border: '1px solid #e2e8f0', borderRadius: '0.5rem', backgroundColor: '#f8fafc' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <h4 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#0f172a', margin: '0 0 0.5rem 0', flex: 1 }}>{result.rubro || 'Sin Rubro'}</h4>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#1e293b', backgroundColor: '#e2e8f0', padding: '0.25rem 0.5rem', borderRadius: '0.25rem' }}>Registro: {result.registroDigital}</span>
                      {result.tipo && <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#1e293b', backgroundColor: '#e2e8f0', padding: '0.25rem 0.5rem', borderRadius: '0.25rem' }}>{result.tipo}</span>}
                    </div>
                    {result.tesis && (
                      <p style={{ color: '#475569', fontSize: '0.95rem', margin: '0 0 1rem 0', lineHeight: 1.5 }}>
                        <strong>Tesis:</strong> {result.tesis}
                      </p>
                    )}
                    {result.localizacion && (
                      <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '0 0 1rem 0' }}>
                        Localización: {result.localizacion}
                      </p>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #e2e8f0' }}>
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic' }}>Fuente: SCJN / Semanario Judicial de la Federación (Local Index)</span>
                      <div style={{ display: 'flex', gap: '1rem' }}>
                        <button 
                          onClick={() => handleViewDetail(result.registroDigital)}
                          style={{ backgroundColor: '#f1f5f9', color: '#0f172a', padding: '0.5rem 1rem', borderRadius: '0.25rem', fontSize: '0.875rem', fontWeight: 500, border: '1px solid #cbd5e1', cursor: 'pointer' }}>
                          Ver criterio completo
                        </button>
                        <button 
                          style={{ backgroundColor: '#000066', color: 'white', padding: '0.5rem 1rem', borderRadius: '0.25rem', fontSize: '0.875rem', fontWeight: 500, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          Analizar con LexIA
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                !isLoading && (
                  <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#64748b' }}>
                    <p>No se encontraron resultados para su búsqueda en SCJN.</p>
                  </div>
                )
              )
            ) : (

              <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#64748b' }}>
                {activeCategory === 'PJENL' ? (
                  <div style={{ maxWidth: '400px', margin: '0 auto' }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🔧</div>
                    <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.5rem' }}>
                      Integración con PJENL en preparación
                    </h3>
                    <p style={{ fontSize: '0.875rem', color: '#64748b', lineHeight: 1.6 }}>
                      La conexión con los endpoints de Criterios Judiciales y Criterios Relevantes del Poder Judicial del Estado de Nuevo León está en desarrollo. Próximamente disponible.
                    </p>
                  </div>
                ) : activeCategory === 'DOCTRINA' ? (
                  <div style={{ maxWidth: '400px', margin: '0 auto' }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📚</div>
                    <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.5rem' }}>
                      Doctrina Legal — Próximamente
                    </h3>
                    <p style={{ fontSize: '0.875rem', color: '#64748b', lineHeight: 1.6 }}>
                      El módulo de bibliografía y tratados jurídicos está en preparación. Estará disponible en una próxima actualización.
                    </p>
                  </div>
                ) : (
                  <p>No se encontraron resultados para su búsqueda.</p>
                )}
              </div>
            )}

            {/* Pagination for SCJN */}
            {activeCategory === 'SCJN' && scjnTotal > 10 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '1rem' }}>
                <button 
                  disabled={page === 1}
                  onClick={() => handleSearch(page - 1)}
                  style={{ padding: '0.5rem 1rem', borderRadius: '0.25rem', border: '1px solid #cbd5e1', backgroundColor: page === 1 ? '#f1f5f9' : 'white', cursor: page === 1 ? 'not-allowed' : 'pointer' }}>
                  Anterior
                </button>
                <span style={{ alignSelf: 'center', color: '#475569' }}>Página {page}</span>
                <button 
                  disabled={page * 10 >= scjnTotal}
                  onClick={() => handleSearch(page + 1)}
                  style={{ padding: '0.5rem 1rem', borderRadius: '0.25rem', border: '1px solid #cbd5e1', backgroundColor: (page * 10 >= scjnTotal) ? '#f1f5f9' : 'white', cursor: (page * 10 >= scjnTotal) ? 'not-allowed' : 'pointer' }}>
                  Siguiente
                </button>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* Detail Modal */}
      {selectedTesis && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 50, padding: '2rem' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '0.75rem', maxWidth: '800px', width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: '2rem', position: 'relative' }}>
            <button 
              onClick={() => setSelectedTesis(null)}
              style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#64748b' }}>
              &times;
            </button>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#0f172a', marginBottom: '1rem' }}>{selectedTesis.rubro}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem', fontSize: '0.875rem', color: '#475569' }}>
              <div><strong>Registro:</strong> {selectedTesis.registroDigital}</div>
              <div><strong>Época:</strong> {selectedTesis.epoca}</div>
              <div><strong>Instancia:</strong> {selectedTesis.instancia}</div>
              <div><strong>Materia:</strong> {selectedTesis.materia}</div>
              {selectedTesis.ponente && <div><strong>Ponente:</strong> {selectedTesis.ponente}</div>}
              {selectedTesis.publicacion && <div style={{ gridColumn: '1 / -1' }}><strong>Fecha de Publicación:</strong> {selectedTesis.publicacion}</div>}
            </div>
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.5rem' }}>Texto</h3>
              <p style={{ whiteSpace: 'pre-wrap', color: '#334155', lineHeight: 1.6 }}>{selectedTesis.texto}</p>
            </div>
            {selectedTesis.precedentes && (
              <div style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.5rem' }}>Precedentes</h3>
                <p style={{ whiteSpace: 'pre-wrap', color: '#334155', lineHeight: 1.6 }}>{selectedTesis.precedentes}</p>
              </div>
            )}
            <div style={{ marginTop: '2rem', paddingTop: '1rem', borderTop: '1px solid #e2e8f0', color: '#94a3b8', fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>FUENTE OFICIAL: SCJN / Semanario Judicial de la Federación (Local Index Open Data)</span>
              {selectedTesis.officialUrl && (
                <a href={selectedTesis.officialUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#000066', textDecoration: 'none', fontWeight: 'bold' }}>
                  Ver Oficial
                </a>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
