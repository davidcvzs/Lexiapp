import { ISCJNRepository } from './types.js';
import { SQLiteSCJNRepository } from './SQLiteSCJNRepository.js';
import { PostgresSCJNRepository } from './PostgresSCJNRepository.js';

let repositoryInstance: ISCJNRepository | null = null;

export function createSCJNRepository(): ISCJNRepository {
  if (repositoryInstance) {
    return repositoryInstance;
  }

  const driver = process.env.SCJN_DB_DRIVER || 'sqlite';

  if (driver === 'postgres') {
    repositoryInstance = new PostgresSCJNRepository();
  } else {
    repositoryInstance = new SQLiteSCJNRepository();
  }

  return repositoryInstance;
}

export * from './types.js';
