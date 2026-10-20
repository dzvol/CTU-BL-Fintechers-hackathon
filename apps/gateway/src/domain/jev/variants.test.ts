import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS } from '../decision/decide';
import { JUDGE_QUESTIONS } from './judge-questions';
import type { Questions } from './questions';
import { SCREEN_QUESTIONS } from './screen-questions';
import { DEFAULT_VARIANT, JEV_VARIANTS, QUESTIONS_V1 } from './variants';

/** Every question of `base` is asked with the same type and the same option keys. */
function answersAtLeast(set: Questions, base: Questions) {
  for (const [key, question] of Object.entries(base)) {
    const mine = set[key];
    expect(mine?.type, key).toBe(question.type);
    if (question.type === 'choice' && mine?.type === 'choice') {
      expect(Object.keys(mine.criteria).sort(), key).toEqual(Object.keys(question.criteria).sort());
    }
  }
}

describe('Jev variants', () => {
  it('runs production unchanged by default', () => {
    expect(DEFAULT_VARIANT).toBe('baseline');
    expect(JEV_VARIANTS.baseline.questions).toBe(QUESTIONS_V1);
    expect(JEV_VARIANTS.baseline.thresholds).toBe(DEFAULT_THRESHOLDS);
  });

  it.each(Object.entries(JEV_VARIANTS))(
    '%s asks everything the decision table reads',
    (id, variant) => {
      expect(variant.id).toBe(id);
      answersAtLeast(variant.questions.screen, SCREEN_QUESTIONS);
      answersAtLeast(variant.questions.judge, JUDGE_QUESTIONS);
    },
  );

  it('strict asks the user sooner and balanced later than baseline', () => {
    const { strict, balanced, baseline } = JEV_VARIANTS;
    expect(strict.thresholds.yes).toBeLessThan(baseline.thresholds.yes);
    expect(strict.thresholds.support.upTo10Cents).toBeGreaterThan(
      baseline.thresholds.support.upTo10Cents,
    );
    expect(balanced.thresholds.support.upTo10Cents).toBeLessThan(
      baseline.thresholds.support.upTo10Cents,
    );
    expect(balanced.thresholds.injection).toBeLessThan(baseline.thresholds.injection);
  });

  it('changes only questions in questions-v2, plus the rule its new question needs', () => {
    const { rules, ...thresholds } = JEV_VARIANTS['questions-v2'].thresholds;
    expect(thresholds).toEqual(DEFAULT_THRESHOLDS);
    expect(rules).toEqual({ topicMismatch: 'block' });
  });

  it('keeps the settings of questions-v2 in questions-v3, so only the questions differ', () => {
    expect(JEV_VARIANTS['questions-v3'].thresholds).toEqual(
      JEV_VARIANTS['questions-v2'].thresholds,
    );
  });

  it('adds only the asset rule to questions-v3 in v3-assets', () => {
    const v3 = JEV_VARIANTS['questions-v3'];
    const assets = JEV_VARIANTS['v3-assets'];
    expect(assets.questions).toBe(v3.questions);
    expect(assets.thresholds).toEqual({
      ...v3.thresholds,
      rules: { ...v3.thresholds.rules, assetPurchase: 'review' },
    });
  });
});
