"""Exports the Jev vs. Bedrock comparison as CSV for charts. Reads eval/snapshots (local).
Run from apps/gateway/eval:  python3 comparison/build.py"""
import csv, json, os

SNAP = 'snapshots'
OUT = 'comparison'
MANIPULATION = ['instruction_override', 'targets_approval', 'authority_claim']

SCREEN = [  # (label, model, prompt, set, snapshot)
    ('Jev 1.13', 'jev-1.13.0', '-', 'dev (901)', 'jev.baseline'),
    ('Qwen3 32B · v1', 'qwen.qwen3-32b-v1:0', 'v1', 'dev (901)', 'qwen32b.baseline'),
    ('Qwen3 32B · v2', 'qwen.qwen3-32b-v1:0', 'v2', 'dev (901)', 'qwen32b-v2.baseline'),
    ('Jev 1.13', 'jev-1.13.0', '-', 'common (497)', 'jev.baseline.common'),
    ('Claude Sonnet 4.5 · v2', 'claude-sonnet-4-5', 'v2', 'common (497)', 'sonnet45-v2.baseline.common'),
]
E2E = [
    ('Jev 1.13', 'jev-e2e.baseline'),
    ('Claude Sonnet 4.5 · v2', 'sonnet-e2e.baseline'),
]
# The .common snapshots copy the manifest of the full run; cost and latency come from the run.
COST_FROM = {'jev.baseline.common': 'jev.baseline', 'sonnet45-v2.baseline.common': 'sonnet45-v2.baseline'}

load = lambda name, f: json.load(open(os.path.join(SNAP, name, f)))
pct = lambda r: round(100 * r['rate'], 1) if r and r.get('n') else ''


def write(name, rows):
    with open(os.path.join(OUT, name), 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    print(f'{name}: {len(rows)} rows')


def roc(records):
    """ROC points of the manipulation score (max of the manipulation questions)."""
    scored = []
    for r in records:
        if r.get('error') or not r.get('screen') or r['suite'] not in ('screen-injection', 'screen-benign'):
            continue
        e = r['expected']
        if e.get('recipientChange') and not e.get('injection'):
            continue
        scored.append((max(r['screen'][q] for q in MANIPULATION), bool(e.get('injection'))))
    pos = sum(1 for _, p in scored if p)
    neg = len(scored) - pos
    points, tp, fp = [(0.0, 0.0)], 0, 0
    for t in sorted({s for s, _ in scored}, reverse=True):
        tp += sum(1 for s, p in scored if s == t and p)
        fp += sum(1 for s, p in scored if s == t and not p)
        points.append((fp / neg, tp / pos))
    return points


screen_rows, roc_rows = [], []
for label, model, prompt, subset, snap in SCREEN:
    s = load(snap, 'summary.json')['screen']
    j = load(COST_FROM.get(snap, snap), 'manifest.json')['jev']
    calls = j['calls'] or 1
    screen_rows.append({
        'model': label, 'model_id': model, 'prompt': prompt, 'case_set': subset,
        'attacks': s['attacks']['flagged']['n'], 'benign': s['benign']['flagged']['n'],
        'auroc': round(s['auroc'], 3),
        'tpr_at_1pct_fpr_%': round(100 * s['tprAt1PctFpr']['tpr'], 1),
        'attacks_flagged_%': pct(s['attacks']['flagged']),
        'attacks_blocked_%': pct(s['attacks']['blocked']),
        'attacks_passed': s['attacks']['flagged']['n'] - s['attacks']['flagged']['k'],
        'benign_flagged_%': pct(s['benign']['flagged']),
        'benign_blocked_%': pct(s['benign']['blocked']),
        'recipient_change_caught_%': pct(s['recipientChange']['caught']),
        'latency_p50_ms': j['latencyMsPerCall']['p50'], 'latency_p95_ms': j['latencyMsPerCall']['p95'],
        'usd_per_1000_calls': round(1000 * j['costUsd'] / calls, 3) if j.get('costUsd') is not None else '',
        'input_tokens_per_call': round(j['inputTokens'] / calls),
        'output_tokens_per_call': round(j.get('outputTokens', 0) / calls),
    })
    for fpr, tpr in roc(load(snap, 'records.json')):
        roc_rows.append({'model': label, 'case_set': subset, 'fpr': round(fpr, 4), 'tpr': round(tpr, 4)})

e2e_rows, layer_rows, cat_rows = [], [], []
for label, snap in E2E:
    e = load(snap, 'summary.json')['e2e']
    j = load(snap, 'manifest.json')['jev']
    full = e['configs']['full']
    e2e_rows.append({
        'model': label, 'cases': e['cases'],
        'correct_%': pct(full['correct']), 'harmful_paid_%': pct(full['unsafeAllow']),
        'harmful_paid': full['unsafeAllow']['k'], 'harmful': full['unsafeAllow']['n'],
        'honest_blocked_%': pct(full['falseBlock']), 'honest_review_%': pct(full['needlessReview']),
        'latency_p95_ms': j['latencyMsPerCall']['p95'],
        'usd_per_1000_calls': round(1000 * j['costUsd'] / (j['calls'] or 1), 3) if j.get('costUsd') is not None else '',
    })
    for layer in ('none', 'policy', 'policy+screen', 'full'):
        c = e['configs'].get(layer)
        if c:
            layer_rows.append({'model': label, 'layers': layer, 'correct_%': pct(c['correct']),
                               'harmful_paid_%': pct(c['unsafeAllow']), 'honest_blocked_%': pct(c['falseBlock']),
                               'honest_review_%': pct(c['needlessReview'])})
    for cat, r in full['byCategory'].items():
        cat_rows.append({'model': label, 'category': cat, 'correct': r['k'], 'cases': r['n'], 'correct_%': pct(r)})

write('screen.csv', screen_rows)
write('screen-roc.csv', roc_rows)
write('e2e.csv', e2e_rows)
write('e2e-layers.csv', layer_rows)
write('e2e-categories.csv', cat_rows)
