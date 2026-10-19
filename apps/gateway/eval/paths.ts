import { fileURLToPath } from 'node:url';

const at = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

/** Everything the evaluation reads and writes, relative to apps/gateway/eval. */
export const PATHS = {
  /** Committed, human-checked inputs. */
  fixtures: at('./fixtures/'),
  /** Downloaded sources (gitignored via data/). */
  raw: at('./data/raw/'),
  /** Built cases, one JSONL per suite (gitignored). */
  cases: at('./data/cases/'),
  /** Jev answers cache for development runs (gitignored). */
  cache: at('./data/cache/'),
  /** Development run results (gitignored). */
  devResults: at('./data/results/'),
  /** Final test runs, committed together with their Jev cache. */
  results: at('./results/'),
  /** Labeling worksheets for people (gitignored). */
  labeling: at('./data/labeling/'),
};
