import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DatabaseService } from '../services/DatabaseService';
import { WordExportService } from '../services/WordExportService';
import type { DocumentSummary } from '../../shared/documents';
import { isApproved } from '../../shared/documentIntegrity';

export function DocumentsView({ service: provided }: { service?: DatabaseService }) {
  const buttonStyle = { padding: '0.5rem 0.75rem', border: '1px solid #cbd5e1', borderRadius: '0.5rem', color: '#000066', background: '#fff', fontWeight: 600 };
  const navigate = useNavigate();
  const [service] = useState(() => provided ?? new DatabaseService());
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('Todos');
  useEffect(() => {
    const abort = new AbortController();
    void service.list(undefined, abort.signal).then(page => {
      if (abort.signal.aborted) return;
      setDocuments(page.documents); setCursor(page.nextCursor); setBusy(false);
    }).catch(failure => { if (!abort.signal.aborted) { setError(failure instanceof Error ? failure.message : 'No se pudieron cargar los documentos.'); setBusy(false); } });
    return () => abort.abort();
  }, [service]);
  const more = async () => {
    setBusy(true); setError('');
    try {
      const page = await service.list(cursor ?? undefined);
      setDocuments(previous => cursor ? [...previous, ...page.documents] : page.documents); setCursor(page.nextCursor);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudieron cargar los documentos.'); }
    finally { setBusy(false); }
  };
  const remove = async (document: DocumentSummary) => {
    if (!window.confirm(`¿Eliminar «${document.title}», sus versiones y sus fuentes? Esta acción no se puede deshacer.`)) return;
    setBusy(true); setError('');
    try { await service.delete(document.id); setDocuments(previous => previous.filter(item => item.id !== document.id)); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudo eliminar el documento.'); }
    finally { setBusy(false); }
  };
  const download = async (id: string) => {
    setBusy(true); setError('');
    try {
      const document = await service.get(id);
      if (!isApproved(document)) throw new Error('Abre el borrador y completa su auditoría antes de exportarlo.');
      await new WordExportService().exportToWord(document, 'official');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudo exportar el documento.'); }
    finally { setBusy(false); }
  };
  const visible = documents.filter(document => (filter === 'Todos' || document.status === filter) &&
    `${document.title} ${document.caseNumber} ${document.caseType} ${new Date(document.updatedAt).toLocaleDateString('es-MX')}`.toLowerCase().includes(search.toLowerCase()));
  return <main style={{ minHeight: '100vh', padding: '2rem', background: '#f5f5f8', color: '#0f172a' }}>
    <h1>Mis Documentos</h1>
    <p>Abre un borrador para continuar su redacción, consultar sus versiones o revisar las ocultaciones de la versión pública.</p>
    <button style={{ ...buttonStyle, background: '#000066', color: 'white' }} onClick={() => navigate('/document-builder')}>Nuevo Documento</button>
    <div style={{ margin: '1rem 0', display: 'flex', gap: '1rem' }}>
      <input aria-label="Buscar documentos" placeholder="Buscar en los documentos cargados…" value={search} onChange={event => setSearch(event.target.value)} />
      <select aria-label="Filtrar por estado" value={filter} onChange={event => setFilter(event.target.value)}>
        <option>Todos</option><option>Borrador</option><option>Revisado</option>
      </select>
    </div>
    {error && <p role="alert" style={{ color: '#b91c1c' }}>{error} <button disabled={busy} onClick={() => void more()}>Reintentar</button></p>}
    {busy && <p role="status">Cargando…</p>}
    {!busy && !error && !visible.length && <p>{documents.length ? 'No hay coincidencias en los documentos cargados.' : 'Todavía no tienes documentos guardados.'}</p>}
    <div style={{ overflowX: 'auto', background: 'white', padding: '1rem', borderRadius: '0.75rem' }}>
      <table style={{ width: '100%', textAlign: 'left', borderSpacing: '0 1rem' }}>
        <thead><tr><th>Documento</th><th>Expediente</th><th>Materia</th><th>Actualizado</th><th>Estado</th><th>Acciones</th></tr></thead>
        <tbody>{visible.map(document => <tr key={document.id}>
          <td>{document.title || 'Documento sin título'} · v{document.revision}</td><td>{document.caseNumber || 'Sin número'}</td><td>{document.caseType}</td>
          <td>{new Date(document.updatedAt).toLocaleString('es-MX')}</td><td>{document.status}</td>
          <td><button style={buttonStyle} disabled={busy} onClick={() => navigate(`/document-builder?documentId=${encodeURIComponent(document.id)}`)}>Abrir</button>{' '}
            <button style={{ ...buttonStyle, opacity: document.status === 'Revisado' ? 1 : 0.45 }} disabled={busy || document.status !== 'Revisado'} onClick={() => void download(document.id)}>Descargar oficial</button>{' '}
            <button style={{ ...buttonStyle, color: '#b91c1c' }} disabled={busy} onClick={() => void remove(document)}>Eliminar</button></td>
        </tr>)}</tbody>
      </table>
    </div>
    {cursor && <button disabled={busy} onClick={() => void more()}>Cargar más documentos</button>}
  </main>;
}
