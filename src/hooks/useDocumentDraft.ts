import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { DatabaseService } from '../services/DatabaseService';
import { ApiError } from '../services/ApiClient';
import type { DocumentDraft, DocumentVersion, SavedDocument } from '../../shared/documents';
import { parseDraft } from '../../shared/documents';
import { invalidateReview } from '../../shared/documentIntegrity';

/** Serial saves preserve edits made during a request; failures never discard the local documentState. */
export function useDocumentDraft(initial: DocumentDraft, providedService?: DatabaseService, newId?: string) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const routeId = params.get('documentId');
  const [id] = useState(() => routeId || newId || crypto.randomUUID());
  const [service] = useState(() => providedService ?? new DatabaseService());
  const [draft, setDraft] = useState(() => parseDraft(initial));
  const latest = useRef(draft); latest.current = draft;
  const revision = useRef(0);
  const confirmedDocument = useRef<SavedDocument | null>(null);
  const savedKey = useRef(JSON.stringify(parseDraft(initial)));
  const [saved, setSaved] = useState(savedKey.current);
  const [loading, setLoading] = useState(!!routeId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [versionNumber, setVersionNumber] = useState(0);
  const mounted = useRef(false);
  const blocked = useRef(!!routeId);
  const running = useRef<Promise<boolean> | null>(null);
  const controller = useRef<AbortController | null>(null);
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [versionCursor, setVersionCursor] = useState<number | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  const changed = JSON.stringify(draft) !== saved || (!routeId && !!initial.transcription);

  useEffect(() => {
    mounted.current = true;
    const abort = new AbortController();
    if (routeId) {
      void service.get(id, abort.signal).then(document => {
        if (!mounted.current || abort.signal.aborted) return;
        const recovered = parseDraft(document);
        savedKey.current = JSON.stringify(recovered); setSaved(savedKey.current);
        latest.current = recovered; setDraft(recovered);
        revision.current = document.revision; setVersionNumber(document.revision);
        confirmedDocument.current = document;
        blocked.current = false; setLoading(false);
      }).catch(failure => {
        if (!mounted.current || abort.signal.aborted) return;
        setError(failure instanceof Error ? failure.message : 'No se pudo recuperar el borrador.');
        setLoading(false); // remains blocked: never overwrite a document that was not loaded
      });
    }
    return () => { mounted.current = false; abort.abort(); controller.current?.abort(); };
    // This hook belongs to one editor; the view remounts when switching documents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, service]);

  const save = useCallback(async (): Promise<boolean> => {
    if (running.current) return running.current;
    if (loading || conflict || (blocked.current && revision.current === 0 && !!routeId)) return false;
    blocked.current = false;
    const work = async () => {
      setSaving(true); setError('');
      try {
        do {
          const snapshot = latest.current;
          const key = JSON.stringify(snapshot);
          if (key === savedKey.current && revision.current > 0) break;
          const abort = new AbortController(); controller.current = abort;
          const confirmed = await service.save(id, snapshot, revision.current, abort.signal);
          if (!mounted.current) return false;
          revision.current = confirmed.revision; setVersionNumber(confirmed.revision);
          confirmedDocument.current = confirmed;
          const confirmedDraft = parseDraft(confirmed);
          savedKey.current = JSON.stringify(confirmedDraft); setSaved(savedKey.current);
          if (JSON.stringify(latest.current) === key) { latest.current = confirmedDraft; setDraft(confirmedDraft); }
          // Preserve a stable URL for refresh/reopen without remounting this editor.
          setParams(previous => { previous.set('documentId', id); return previous; }, { replace: true });
        } while (JSON.stringify(latest.current) !== savedKey.current && mounted.current);
        return true;
      } catch (failure) {
        if (!mounted.current) return false;
        blocked.current = true;
        if (failure instanceof ApiError && failure.status === 409) setConflict(true);
        setError(failure instanceof Error ? failure.message : 'No se pudo guardar. El texto local se conserva.');
        return false;
      } finally { if (mounted.current) setSaving(false); controller.current = null; }
    };
    running.current = work();
    try { return await running.current; } finally { running.current = null; }
  }, [id, service, loading, conflict, routeId, setParams]);

  useEffect(() => {
    if (!changed || loading || saving || blocked.current) return;
    const timer = setTimeout(() => void save(), 1000);
    return () => clearTimeout(timer);
  }, [changed, draft, loading, saving, save]);
  useEffect(() => {
    if (!changed && !saving) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [changed, saving]);
  useEffect(() => {
    if (!changed && !saving) return;
    const follow = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element)?.closest?.('a[href]');
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const target = new URL(anchor.href, window.location.href);
      if (target.origin !== window.location.origin || target.hash || !target.pathname.startsWith('/')) return;
      event.preventDefault(); event.stopPropagation();
      void save().then(success => { if (success && mounted.current) navigate(target.pathname + target.search); });
    };
    document.addEventListener('click', follow, true);
    return () => document.removeEventListener('click', follow, true);
  }, [changed, saving, navigate, save]);

  const history = async (more = false) => {
    if (historyBusy || !(await save())) return;
    setHistoryBusy(true);
    try {
      const page = await service.versions(id, more ? versionCursor ?? undefined : undefined);
      if (!mounted.current) return;
      setVersions(previous => more ? [...previous, ...page.versions] : page.versions);
      setVersionCursor(page.nextCursor); setHistoryOpen(true);
    } catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : 'No se pudo abrir el historial.'); }
    finally { if (mounted.current) setHistoryBusy(false); }
  };
  const restore = async (number: number) => {
    if (historyBusy || !(await save())) return;
    setHistoryBusy(true);
    try {
      const historical = await service.version(id, number);
      if (!mounted.current) return;
      const recovered = invalidateReview(parseDraft(historical), 'metadata');
      latest.current = recovered; setDraft(recovered); setHistoryOpen(false);
    } catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : 'No se pudo recuperar la versión.'); }
    finally { if (mounted.current) setHistoryBusy(false); }
  };
  return { draft, setDraft, id, loading, saving, changed, error, conflict, versionNumber, save,
    versions, history, restore, historyBusy, historyOpen, setHistoryOpen, versionCursor,
    getConfirmedDocument: () => confirmedDocument.current, getCurrentDraft: () => latest.current };
}
