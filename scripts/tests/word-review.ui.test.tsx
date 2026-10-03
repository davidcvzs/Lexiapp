import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DocumentWordReview } from '../../src/components/documents/DocumentWordReview.js';
import { parseDraft } from '../../shared/documents.js';
import type { DocumentDraft } from '../../shared/documents.js';
import { publicFingerprint, reviewFingerprint } from '../../shared/documentIntegrity.js';

afterEach(cleanup);
async function setup(content: string) {
  let current = parseDraft({ title: 'Prueba Word', caseNumber: 'TEST', caseType: 'Prueba', documentType: 'Acta', summary: '',
    transcription: 'Fuente de trabajo', originalTranscription: 'Fuente original', content, completedPhases: [],
    audit: { names: true, congruence: true, pii: true }, reviewHash: null,
    publicVersion: { redactions: [], reviewed: true, reviewHash: null }, wordFormat: { profile: 'judicial', marks: [] } });
  current.reviewHash = await reviewFingerprint(current);
  current.publicVersion!.reviewHash = await publicFingerprint(current);
  const errors: string[] = [];
  function Host() {
    const [draft, update] = useState<DocumentDraft>(current);
    return <DocumentWordReview draft={draft} update={next => { current = next; update(next); }} onError={message => errors.push(message)} />;
  }
  render(<Host />);
  fireEvent.click(screen.getByText('Formato y marcado rojo del Word oficial'));
  return { draft: () => current, errors };
}

test('official interval selection preserves exact CRLF offsets and invalidates both reviewed exports', async () => {
  const content = 'Texto inicial.\r\nMaría Pérez declaró.';
  const state = await setup(content);
  fireEvent.change(screen.getByLabelText('Texto exacto para marcado oficial'), { target: { value: 'María Pérez' } });
  fireEvent.click(screen.getByRole('checkbox', { name: /Marcar Nombres completos o parciales/ }));
  const marked = state.draft();
  assert.equal(marked.content, content);
  assert.deepEqual(marked.wordFormat!.marks, [{ start: content.indexOf('María Pérez'), end: content.indexOf('María Pérez') + 11, category: 'name' }]);
  assert.equal(marked.reviewHash, null);
  assert.equal(marked.publicVersion!.reviewed, false);
  assert.ok(Object.values(marked.audit).every(value => value === false));
  assert.deepEqual(marked.publicVersion!.redactions, []);
  assert.equal(marked.originalTranscription, 'Fuente original');
  assert.deepEqual(state.errors, []);
});

test('explicit age edits change only the draft and preserve original source and review gates', async () => {
  const state = await setup('Tenía dieciséis años de edad. Trabajó tres años.');
  fireEvent.click(screen.getByRole('button', { name: /Aplicar edad en/ }));
  assert.equal(state.draft().content, 'Tenía 16 años de edad. Trabajó tres años.');
  assert.equal(state.draft().originalTranscription, 'Fuente original');
  assert.equal(state.draft().transcription, 'Fuente de trabajo');
  assert.equal(state.draft().reviewHash, null);
  assert.equal(state.draft().publicVersion!.reviewed, false);
  assert.equal(screen.queryByRole('button', { name: /Aplicar edad en/ }), null);
});

test('changing profile or supplied court invalidates approval without inventing or editing legal content', async () => {
  const state = await setup('Texto aprobado de prueba.');
  fireEvent.change(screen.getByLabelText('Formato Word del borrador'), { target: { value: 'judicialDouble' } });
  fireEvent.change(screen.getByLabelText('Juzgado para Word'), { target: { value: 'Juzgado de prueba aportado' } });
  assert.equal(state.draft().wordFormat!.profile, 'judicialDouble');
  assert.equal(state.draft().wordFormat!.court, 'Juzgado de prueba aportado');
  assert.equal(state.draft().content, 'Texto aprobado de prueba.');
  assert.equal(state.draft().reviewHash, null);
  assert.equal(state.draft().publicVersion!.reviewed, false);
});
