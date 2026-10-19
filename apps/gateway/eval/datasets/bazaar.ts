// Real x402 offers from the public Bazaar catalog: the honest baseline and the carriers that
// attacks are planted into.
import { z } from 'zod';
import type { Carrier } from '../carriers';
import { sha256 } from '../jsonl';
import { seededRandom } from '../random';
import { download, readRaw, saveRaw, sleep, SOURCES } from './sources';

export const BAZAAR_FILE = 'bazaar.json';

const ItemSchema = z.looseObject({
  resource: z.string(),
  serviceName: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  accepts: z
    .array(z.looseObject({ amount: z.string().optional(), network: z.string().optional() }))
    .optional(),
});
const PageSchema = z.object({
  items: z.array(ItemSchema),
  pagination: z.object({ total: z.number(), limit: z.number() }),
});
export type BazaarItem = z.infer<typeof ItemSchema>;

/** Fetches `pages` pages at seeded random offsets (the API serves 20 items per page). */
export async function fetchBazaar(pages = 80): Promise<void> {
  const url = (offset: number) => `${SOURCES.bazaar.url}?limit=20&offset=${offset}`;
  const first = PageSchema.parse(JSON.parse(await download(url(0))));
  const { total, limit } = first.pagination;
  const random = seededRandom('bazaar-pages');
  const offsets = random.sample(
    Array.from({ length: Math.ceil(total / limit) }, (_, i) => i * limit),
    pages,
  );
  const items: BazaarItem[] = [];
  for (const offset of offsets) {
    items.push(...PageSchema.parse(JSON.parse(await download(url(offset)))).items);
    await sleep(250); // be polite to a public API
  }
  saveRaw('bazaar', BAZAAR_FILE, SOURCES.bazaar.url, JSON.stringify({ total, items }, null, 1));
}

/** Mostly-ASCII text is a cheap English filter; the questions are written in English. */
const looksEnglish = (text: string) =>
  text.length > 0 && [...text].filter((ch) => ch.charCodeAt(0) < 128).length / text.length > 0.97;

/** Usable, de-duplicated honest offers. */
export function bazaarCarriers(): Carrier[] {
  const { items } = z
    .object({ items: z.array(ItemSchema) })
    .parse(JSON.parse(readRaw(BAZAAR_FILE)));
  const seen = new Set<string>();
  const carriers: Carrier[] = [];
  for (const item of items) {
    const description = item.description?.trim() ?? '';
    const key = description.toLowerCase();
    if (description.length < 40 || description.length > 1500 || !looksEnglish(description))
      continue;
    if (seen.has(key)) continue;
    seen.add(key);
    carriers.push({
      id: `bazaar-${sha256(item.resource).slice(0, 10)}`,
      url: item.resource,
      ...(item.serviceName && { serviceName: item.serviceName }),
      description,
    });
  }
  return carriers;
}
