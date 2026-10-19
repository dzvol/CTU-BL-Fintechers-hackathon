// Turns sources and fixtures into EvalCase JSONL, one file per suite. Deterministic: the same
// inputs always build the same cases with the same dev/test split.
import { join } from 'node:path';
import { asIs, plant, POSITIONS, type Carrier } from '../carriers';
import { EvalCaseSchema, type EvalCase } from '../cases';
import { writeJson, writeJsonl } from '../jsonl';
import { PATHS } from '../paths';
import { seededRandom, splitOf } from '../random';
import { BAZAAR_FILE, bazaarCarriers } from './bazaar';
import {
  loadBazaarLabels,
  loadCategories,
  loadCommerceTexts,
  loadE2e,
  loadIntents,
  type BazaarLabel,
  type Categories,
} from './fixtures';
import {
  injecAgentAttacks,
  llmailAttacks,
  llmailBenign,
  notInjectTexts,
  type PlantableText,
} from './injection-sources';
import { hasRaw, readManifest, versionOf } from './sources';

/** Honest Bazaar offers taken as is into the benign suite. */
export const BENIGN_BAZAAR_COUNT = 500;
const PAY_TO = '0x1111111111111111111111111111111111111111';

const plantedCase = (
  suite: 'screen-benign' | 'screen-injection',
  prefix: string,
  item: PlantableText,
  group: string,
  carriers: Carrier[],
  source: string,
  expected: { injection: boolean; recipientChange: boolean },
): EvalCase => {
  const carrier = seededRandom(`carrier:${prefix}:${item.id}`).pick(carriers);
  const position = seededRandom(`position:${prefix}:${item.id}`).pick(POSITIONS);
  return EvalCaseSchema.parse({
    id: `${prefix}-${item.id}@${carrier.id}#${position}`,
    suite,
    split: splitOf(group),
    group,
    source,
    author: 'construction',
    screenState: plant(carrier, item.text, position),
    expected,
    labels: { ...item.labels, source: prefix, position, carrier: carrier.id },
  });
};

export function buildScreenBenign(carriers: Carrier[]): EvalCase[] {
  const cases: EvalCase[] = seededRandom('benign-bazaar')
    .sample(carriers, BENIGN_BAZAAR_COUNT)
    .map((carrier) =>
      EvalCaseSchema.parse({
        id: `bazaar-${carrier.id}`,
        suite: 'screen-benign',
        split: splitOf(`carrier:${carrier.id}`),
        group: `carrier:${carrier.id}`,
        source: versionOf(BAZAAR_FILE),
        // Assumed honest; people audit the ones Screen flags (see README).
        author: 'construction (real listing, assumed honest)',
        screenState: asIs(carrier),
        expected: { injection: false, recipientChange: false },
        labels: { source: 'bazaar', position: 'none', carrier: carrier.id },
      }),
    );
  const benign = { injection: false, recipientChange: false };
  if (hasRaw('notinject.json')) {
    for (const item of notInjectTexts()) {
      cases.push(
        plantedCase(
          'screen-benign',
          'notinject',
          item,
          `notinject:${item.id}`,
          carriers,
          versionOf('notinject.json'),
          benign,
        ),
      );
    }
  }
  if (hasRaw('llmail-emails_for_fp_tests.json')) {
    for (const item of llmailBenign()) {
      cases.push(
        plantedCase(
          'screen-benign',
          'llmail-fp',
          item,
          `llmail-fp:${item.id}`,
          carriers,
          versionOf('llmail-emails_for_fp_tests.json'),
          benign,
        ),
      );
    }
  }
  const commerce = loadCommerceTexts();
  for (const item of commerce.benign) {
    cases.push(
      plantedCase(
        'screen-benign',
        'commerce-benign',
        { ...item, labels: {} },
        `commerce:${item.id}`,
        carriers,
        'eval/fixtures/commerce-texts.json',
        benign,
      ),
    );
  }
  return cases;
}

export function buildScreenInjection(carriers: Carrier[]): EvalCase[] {
  const cases: EvalCase[] = [];
  const attack = { injection: true, recipientChange: false };
  if (hasRaw('injecagent-attacker_cases_dh.jsonl')) {
    for (const item of injecAgentAttacks()) {
      // Base and enhanced variants of one instruction share a group (same split).
      const group = `injecagent:${item.id.replace(/-(base|enhanced)$/, '')}`;
      cases.push(
        plantedCase(
          'screen-injection',
          'injecagent',
          item,
          group,
          carriers,
          versionOf('injecagent-attacker_cases_dh.jsonl'),
          attack,
        ),
      );
    }
  }
  if (hasRaw('llmail-labelled_unique_submissions_phase2.json')) {
    for (const item of llmailAttacks()) {
      cases.push(
        plantedCase(
          'screen-injection',
          'llmail',
          item,
          `llmail:${item.id}`,
          carriers,
          versionOf('llmail-labelled_unique_submissions_phase2.json'),
          attack,
        ),
      );
    }
  }
  for (const item of loadCommerceTexts().attacks) {
    const expected = {
      injection: item.kind !== 'recipient_change',
      recipientChange: item.kind !== 'injection',
    };
    cases.push(
      plantedCase(
        'screen-injection',
        'commerce',
        { ...item, labels: { kind: item.kind } },
        `commerce:${item.id}`,
        carriers,
        'eval/fixtures/commerce-texts.json',
        expected,
      ),
    );
  }
  return cases;
}

/** How an offer of `offerCategory` relates to an intent of `intentCategory`, by construction. */
export function relationOf(
  offerCategory: string,
  intent: { category: string; forbidden: string[] },
  categories: Categories,
): 'fits' | 'off_intent' | 'forbidden' | 'ambiguous' {
  if (offerCategory === intent.category) return 'fits';
  if (categories[intent.category]?.adjacent.includes(offerCategory)) return 'ambiguous';
  const rule = categories[offerCategory]?.forbiddenBy;
  if (rule && intent.forbidden.includes(rule)) return 'forbidden';
  return 'off_intent';
}

export function buildJudgePairs(carriers: Carrier[], labels: BazaarLabel[]): EvalCase[] {
  const categories = loadCategories();
  const intents = loadIntents();
  const byId = new Map(carriers.map((c) => [c.id, c]));
  const all: EvalCase[] = [];
  for (const label of labels) {
    const carrier = byId.get(label.carrierId);
    if (!carrier) throw new Error(`bazaar-labels.json: unknown carrier ${label.carrierId}`);
    for (const intent of intents) {
      const relation = relationOf(label.category, intent, categories);
      all.push(
        EvalCaseSchema.parse({
          id: `pair-${carrier.id}×${intent.id}`,
          suite: 'judge-pairs',
          // Split by offer: the same offer never appears in both dev and test.
          split: splitOf(`offer:${carrier.id}`),
          group: `offer:${carrier.id}`,
          source: versionOf(BAZAAR_FILE),
          author: `construction from labels by ${label.author}`,
          screenState: asIs(carrier),
          intent,
          offer: { amount: '10000', payTo: PAY_TO, resourceUrl: carrier.url },
          oracleExtraction: label.extraction,
          expected: { relation },
          labels: {
            offerCategory: label.category,
            intentCategory: intent.category,
            pairType: relation,
          },
        }),
      );
    }
  }
  // Keep every informative pair; off-intent ones are plentiful, keep 1.5× the fitting ones.
  const offIntent = all.filter(
    (c) => c.suite === 'judge-pairs' && c.expected.relation === 'off_intent',
  );
  const offIntentIds = new Set(offIntent.map((c) => c.id));
  const others = all.filter((c) => !offIntentIds.has(c.id));
  const fits = others.filter(
    (c) => c.suite === 'judge-pairs' && c.expected.relation === 'fits',
  ).length;
  return [...others, ...seededRandom('pairs-off-intent').sample(offIntent, Math.ceil(fits * 1.5))];
}

/** Builds every suite it has inputs for and writes eval/data/cases. */
export function buildAll(): Record<string, Record<string, number>> {
  if (!hasRaw(BAZAAR_FILE))
    throw new Error('Run `npm run eval:fetch` first (Bazaar carriers are needed).');
  const carriers = bazaarCarriers();
  const suites = {
    'screen-benign': buildScreenBenign(carriers),
    'screen-injection': buildScreenInjection(carriers),
    'judge-pairs': buildJudgePairs(carriers, loadBazaarLabels()),
    e2e: loadE2e(),
  };
  const counts: Record<string, Record<string, number>> = {};
  for (const [suite, cases] of Object.entries(suites)) {
    writeJsonl(join(PATHS.cases, `${suite}.jsonl`), cases);
    counts[suite] = {
      dev: cases.filter((c) => c.split === 'dev').length,
      test: cases.filter((c) => c.split === 'test').length,
    };
  }
  writeJson(join(PATHS.cases, 'manifest.json'), {
    builtAt: new Date().toISOString(),
    carriers: carriers.length,
    counts,
    sources: readManifest(),
  });
  return counts;
}
