import { DatabaseService } from '../../src/services/DatabaseService.js';
import { ApiClient } from '../../src/services/ApiClient.js';
import { RequestError } from '../../server/middleware/security.js';
import type { JobStore, StoredJob } from '../../server/persistence/WorkspaceRepository.js';
import type { TranscriptionJob } from '../../shared/transcription.js';

export const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

/** Isolate older workflow UI tests from credentials and persistence; real durability uses Emulator tests. */
export function fixtureDatabase() {
  return new DatabaseService(new ApiClient(async () => 'test', async (url, options) => {
    const { draft, revision } = JSON.parse(options!.body as string);
    const now = new Date().toISOString();
    return json({ document: { ...draft, id: String(url).split('/').at(-1), revision: revision + 1, createdAt: now, updatedAt: now } });
  }));
}

/** Only a test transport stub. Production has no in-memory repository. */
export class FixtureJobStore implements JobStore {
  async ensureAvailable() {}
  private jobs = new Map<string, { uid: string; job: StoredJob }>();
  async saveJob(uid: string, job: TranscriptionJob, fileName: string) {
    const stored = { ...job, fileName, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    this.jobs.set(job.job_id, { uid, job: stored }); return stored;
  }
  async getJob(uid: string, id: string) {
    const stored = this.jobs.get(id);
    if (!stored) throw new RequestError(404, 'No encontrado.');
    if (stored.uid !== uid) throw new RequestError(403, 'No autorizado.');
    return stored.job;
  }
  async updateJob(uid: string, job: TranscriptionJob) { const previous = await this.getJob(uid, job.job_id); return this.saveJob(uid, job, previous.fileName); }
  async listJobs(uid: string) { return { jobs: [...this.jobs.values()].filter(record => record.uid === uid).map(record => record.job), nextCursor: null }; }
  async deleteJob(uid: string, id: string) { await this.getJob(uid, id); this.jobs.delete(id); }
}
