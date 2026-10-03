import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LegalSearchView } from '../../src/views/LegalSearchView.js';
afterEach(cleanup);

test('search remains explicit; clearing filters sends a fresh request without stale values', async () => {
  const original = globalThis.fetch;
  const searches: URLSearchParams[] = [];
  globalThis.fetch = async input => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname.endsWith('/search')) searches.push(url.searchParams);
    return new Response(JSON.stringify(url.pathname.endsWith('/search') ? { data: [], total: 0 } : {}), { headers: { 'Content-Type': 'application/json' } });
  };
  try {
    render(<LegalSearchView />);
    await waitFor(() => assert.equal(searches.length, 1));
    fireEvent.change(screen.getByPlaceholderText('Palabras / rubro...'), { target: { value: 'Texto sintético' } });
    fireEvent.change(screen.getByPlaceholderText('Registro digital...'), { target: { value: 'TEST-ONLY' } });
    assert.equal(searches.length, 1);
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    await waitFor(() => assert.equal(searches.length, 2));
    assert.equal(searches[1].get('registro'), 'TEST-ONLY');
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    await waitFor(() => assert.equal(searches.length, 3));
    assert.equal(searches[2].has('q'), false); assert.equal(searches[2].has('registro'), false);
    assert.equal((screen.getByPlaceholderText('Registro digital...') as HTMLInputElement).value, '');
  } finally { globalThis.fetch = original; }
});
