import dotenv from 'dotenv';
import { readFile } from 'node:fs/promises';
import { getApp } from 'firebase-admin/app';
import { adminAuth } from '../server/services/firebaseAdmin.js';

dotenv.config({ path: '.env.local', quiet: true });
try {
  adminAuth();
  const app = getApp();
  const project = app.options.projectId!;
  const { access_token } = await app.options.credential!.getAccessToken();
  const get = async (url: string) => {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${access_token}` }, signal: AbortSignal.timeout(15_000) });
    return { status: response.status, data: response.ok ? await response.json() : null };
  };
  const results = await Promise.all([
    get(`https://firebaserules.googleapis.com/v1/projects/${project}/releases/cloud.firestore`),
    ...['documents', 'transcriptionJobs'].map(collection => get(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/collectionGroups/${collection}/indexes`)),
  ]);
  const release = results[0];
  if (release.data?.rulesetName) {
    const rules = await get(`https://firebaserules.googleapis.com/v1/${release.data.rulesetName}`);
    const content: string = rules.data?.source?.files?.find((file: { name: string }) => file.name.endsWith('.rules'))?.content ?? '';
    const local = await readFile('firestore.rules', 'utf8');
    const normalize = (value: string) => value.replace(/\r\n/g, '\n').trim();
    console.log(JSON.stringify({ rulesHttp: rules.status, rulesMatchLocal: normalize(content) === normalize(local),
      defaultDenyAll: /allow\s+read,\s*write:\s*if\s+false\s*;/.test(content) && !/match\s+\/cases/.test(content),
      timeLimitedTestMode: /request\.time\s*<\s*timestamp\.date/.test(content), rulesSourceCharacters: content.length }));
    if (process.argv.includes('--show-rules')) console.log(content);
  } else console.log(JSON.stringify({ rulesReleaseHttp: release.status }));
  results.slice(1).forEach((result, index) => console.log(JSON.stringify({ collection: ['documents', 'transcriptionJobs'][index], http: result.status,
    indexes: result.data?.indexes?.filter((item: { name: string }) => item.name.split('/collectionGroups/')[1]?.split('/')[0] === ['documents', 'transcriptionJobs'][index])
      .map((item: { state: string; fields: unknown }) => ({ state: item.state, fields: item.fields })) ?? [] })));
  const configuration = JSON.parse(await readFile('firestore.indexes.json', 'utf8')) as { fieldOverrides: { collectionGroup: string; fieldPath: string }[] };
  const fields = configuration.fieldOverrides.filter(field => ['originalTranscription', 'generationLog', 'workflow', 'segments', 'upload', 'metadata', '_recoveryState', 'format', 'data', 'wordFormat'].includes(field.fieldPath));
  const exclusions = await Promise.all(fields.map(field => get(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/collectionGroups/${field.collectionGroup}/fields/${encodeURIComponent(field.fieldPath)}`)));
  exclusions.forEach((result, index) => {
    // The REST protobuf omits false flags and empty arrays. Empty field configs have no index state.
    const config = result.data?.indexConfig;
    const excluded = result.status === 200 && !!config && config.usesAncestorConfig !== true && config.reverting !== true && (config.indexes ?? []).length === 0;
    console.log(JSON.stringify({ collectionGroup: fields[index].collectionGroup, fieldPath: fields[index].fieldPath, http: result.status,
      excluded, usesAncestorConfig: config?.usesAncestorConfig ?? false, indexes: config?.indexes ?? [] }));
    if (!excluded) process.exitCode = 1;
  });
} catch { console.log('No se pudo verificar la configuración remota. No se realizaron escrituras.'); process.exitCode = 1; }
