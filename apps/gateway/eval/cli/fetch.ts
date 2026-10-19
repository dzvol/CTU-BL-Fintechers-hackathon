// npm run eval:fetch [-- --only bazaar,injecagent,notinject,llmail] [--bazaar-pages 80]
// Downloads the sources into eval/data/raw and records their hashes.
import { fetchBazaar } from '../datasets/bazaar';
import { fetchInjecAgent, fetchLLMail, fetchNotInject } from '../datasets/injection-sources';
import { SOURCES, type SourceId } from '../datasets/sources';
import { parseArgs } from './args';

const args = parseArgs();
const only = (args.get('only')?.split(',') ?? Object.keys(SOURCES)) as SourceId[];
const steps: Record<SourceId, () => Promise<void>> = {
  bazaar: () => fetchBazaar(Number(args.get('bazaar-pages') ?? 80)),
  injecagent: fetchInjecAgent,
  notinject: fetchNotInject,
  llmail: fetchLLMail,
};

for (const id of only) {
  process.stdout.write(`${SOURCES[id].name} (${SOURCES[id].license}) … `);
  await steps[id]();
  console.log('ok');
}
