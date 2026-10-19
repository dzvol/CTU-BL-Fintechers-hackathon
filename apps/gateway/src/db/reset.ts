// Deletes the local SQLite database; the gateway recreates it with all migrations on next start.
// Usage: npm run db:reset (stop the gateway first, it keeps the old file open).
import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEFAULT_DATABASE_PATH } from '../config';

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to reset the database with NODE_ENV=production');
  process.exit(1);
}

const path = resolve(process.env.DATABASE_PATH || DEFAULT_DATABASE_PATH);

if (!existsSync(path)) {
  console.log(`Nothing to reset: ${path} does not exist`);
} else {
  for (const suffix of ['', '-wal', '-shm']) rmSync(path + suffix, { force: true });
  console.log(`Deleted ${path}`);
}
