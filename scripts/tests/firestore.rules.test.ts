import { after, before, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, deleteDoc, collection, query, where, getDocs, serverTimestamp } from 'firebase/firestore';

let env: RulesTestEnvironment;
before(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Run using the Firestore emulator, never production.');
  env = await initializeTestEnvironment({
    projectId: 'demo-lexia-security',
    firestore: { rules: await readFile('firestore.rules', 'utf8') },
  });
});
after(async () => { await env?.cleanup(); });

const caseData = (userId: string) => ({ userId, caseNumber: 'TEST-1', type: 'Penal', status: 'PROCESANDO', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });

test('owners can create/read/update/delete and query their cases', async () => {
  const db = env.authenticatedContext('owner').firestore();
  const ref = doc(db, 'cases/own');
  await assertSucceeds(setDoc(ref, caseData('owner')));
  await assertSucceeds(getDoc(ref));
  await assertSucceeds(updateDoc(ref, { status: 'COMPLETADO', updatedAt: serverTimestamp() }));
  await assertSucceeds(getDocs(query(collection(db, 'cases'), where('userId', '==', 'owner'))));
  await assertFails(getDocs(collection(db, 'cases')));
  await assertSucceeds(deleteDoc(ref));
});

test('anonymous, other users and administrators cannot read or change another user case', async () => {
  const owner = env.authenticatedContext('alice').firestore();
  await assertSucceeds(setDoc(doc(owner, 'cases/private'), caseData('alice')));
  for (const context of [env.unauthenticatedContext(), env.authenticatedContext('bob'), env.authenticatedContext('admin', { admin: true })]) {
    const db = context.firestore();
    const ref = doc(db, 'cases/private');
    await assertFails(getDoc(ref));
    await assertFails(updateDoc(ref, { caseNumber: 'CHANGED', updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(ref));
    await assertFails(setDoc(doc(db, 'cases/forged'), caseData('alice')));
  }
});

test('ownership and creation timestamp cannot change; schema blocks privilege fields', async () => {
  const db = env.authenticatedContext('alice').firestore();
  const ref = doc(db, 'cases/schema');
  await assertSucceeds(setDoc(ref, caseData('alice')));
  await assertFails(updateDoc(ref, { userId: 'bob', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(ref, { createdAt: new Date(0), updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(ref, { admin: true, updatedAt: serverTimestamp() }));
  await assertFails(setDoc(doc(db, 'cases/invalid'), { ...caseData('alice'), status: 'OTHER' }));
  await assertFails(setDoc(doc(db, 'cases/invalid'), { ...caseData('alice'), caseNumber: 123 }));
  await assertFails(setDoc(doc(db, 'Users/alice'), { admin: true }));
  await assertFails(setDoc(doc(db, 'cases/schema/Documents/nested'), { content: 'test' }));
});

test('documents, versions, upload reservations and transcript blocks remain inaccessible to direct clients, including admins', async () => {
  const paths = ['documents/backend-only', 'documents/backend-only/versions/1', 'transcriptionJobs/backend-only', 'transcriptionJobs/backend-only/segments/00000000', 'transcriptionRequests/backend-only',
    'transcriptionJobs/backend-only/wordArtifacts/private-word', 'transcriptionJobs/backend-only/wordArtifacts/private-word/blocks/0000'];
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    for (const path of paths) {
      await setDoc(doc(db, path), { uid: 'owner', content: 'Fuente sintética.' });
    }
  });
  for (const context of [env.authenticatedContext('owner'), env.authenticatedContext('admin', { admin: true }), env.unauthenticatedContext()]) {
    for (const path of paths) {
      const ref = doc(context.firestore(), path);
      await assertFails(getDoc(ref)); await assertFails(setDoc(ref, { uid: 'owner' })); await assertFails(deleteDoc(ref));
    }
  }
});
