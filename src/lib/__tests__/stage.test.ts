import { describe, expect, it } from 'vitest';
import { applyAnswer, produceModeFor, releaseLeech } from '../stage';
import { FIXED_NOW, makeCard } from './helpers';

const correctFast = { correct: true, elapsedMs: 1000, stage: 1 as const };

describe('Stage1（4択）の昇格', () => {
  it('2回連続で正解すると Stage2 に上がる', () => {
    let card = makeCard({ stage: 1 }, FIXED_NOW);
    card = applyAnswer(card, correctFast, FIXED_NOW);
    expect(card.stage).toBe(1);
    card = applyAnswer(card, correctFast, FIXED_NOW);
    expect(card.stage).toBe(2);
  });

  it('間に不正解が入ると連続がリセットされる', () => {
    let card = makeCard({ stage: 1 }, FIXED_NOW);
    card = applyAnswer(card, correctFast, FIXED_NOW);
    card = applyAnswer(card, { correct: false, elapsedMs: 3000, stage: 1 }, FIXED_NOW);
    card = applyAnswer(card, correctFast, FIXED_NOW);
    expect(card.stage).toBe(1);
  });
});

describe('Stage2（想起）の昇格', () => {
  it('2秒以内の正解が2回で Stage3 に上がる', () => {
    let card = makeCard({ stage: 2 }, FIXED_NOW);
    card = applyAnswer(card, { correct: true, elapsedMs: 1200, stage: 2 }, FIXED_NOW);
    expect(card.stage).toBe(2);
    expect(card.fastCorrect).toBe(2 - 1);
    card = applyAnswer(card, { correct: true, elapsedMs: 1900, stage: 2 }, FIXED_NOW);
    expect(card.stage).toBe(3);
  });

  it('遅い正解は fastCorrect に数えない（Stage2のまま）', () => {
    let card = makeCard({ stage: 2 }, FIXED_NOW);
    card = applyAnswer(card, { correct: true, elapsedMs: 5000, stage: 2 }, FIXED_NOW);
    card = applyAnswer(card, { correct: true, elapsedMs: 5000, stage: 2 }, FIXED_NOW);
    expect(card.stage).toBe(2);
    expect(card.fastCorrect).toBe(0);
  });
});

describe('降格', () => {
  it('不正解が2回続くと1つ下の Stage に戻る', () => {
    let card = makeCard({ stage: 3 }, FIXED_NOW);
    card = applyAnswer(card, { correct: false, elapsedMs: 4000, stage: 3 }, FIXED_NOW);
    expect(card.stage).toBe(3);
    card = applyAnswer(card, { correct: false, elapsedMs: 4000, stage: 3 }, FIXED_NOW);
    expect(card.stage).toBe(2);
  });

  it('Stage1 より下には落ちない', () => {
    let card = makeCard({ stage: 1 }, FIXED_NOW);
    for (let i = 0; i < 6; i++) {
      card = applyAnswer(card, { correct: false, elapsedMs: 3000, stage: 1 }, FIXED_NOW);
    }
    expect(card.stage).toBe(1);
  });
});

describe('難単語（leech）の隔離', () => {
  it('連続3回まちがい かつ 通算8回まちがいで隔離される', () => {
    let card = makeCard({ stage: 1, wrong: 6, consecutiveWrong: 0 }, FIXED_NOW);
    card = applyAnswer(card, { correct: false, elapsedMs: 3000, stage: 1 }, FIXED_NOW); // wrong 7
    card = applyAnswer(card, { correct: false, elapsedMs: 3000, stage: 1 }, FIXED_NOW); // wrong 8（ここで降格しconsecutiveがリセット）
    card = applyAnswer(card, { correct: false, elapsedMs: 3000, stage: 1 }, FIXED_NOW);
    card = applyAnswer(card, { correct: false, elapsedMs: 3000, stage: 1 }, FIXED_NOW);
    card = applyAnswer(card, { correct: false, elapsedMs: 3000, stage: 1 }, FIXED_NOW);
    expect(card.wrong).toBeGreaterThanOrEqual(8);
    expect(card.leech).toBe(true);
  });

  it('まちがいが少ないうちは隔離しない', () => {
    let card = makeCard({ stage: 1 }, FIXED_NOW);
    for (let i = 0; i < 3; i++) {
      card = applyAnswer(card, { correct: false, elapsedMs: 3000, stage: 1 }, FIXED_NOW);
    }
    expect(card.leech).toBe(false);
  });

  it('苦手特訓で隔離を解除すると Stage1 に戻る', () => {
    const card = makeCard({ stage: 3, leech: true, consecutiveWrong: 5 }, FIXED_NOW);
    const released = releaseLeech(card);
    expect(released.leech).toBe(false);
    expect(released.stage).toBe(1);
  });
});

describe('Stage3の出題形式', () => {
  it('最初は並べ替え', () => {
    expect(produceModeFor(makeCard({ stage: 3, arrangeSuccess: 0 }, FIXED_NOW))).toBe('arrange');
  });

  it('並べ替えに2回成功したらキーボード入力になる', () => {
    expect(produceModeFor(makeCard({ stage: 3, arrangeSuccess: 2 }, FIXED_NOW))).toBe('type');
  });

  it('並べ替えの成功回数が積み上がる', () => {
    let card = makeCard({ stage: 3 }, FIXED_NOW);
    card = applyAnswer(card, { correct: true, elapsedMs: 8000, stage: 3, arranged: true }, FIXED_NOW);
    expect(card.arrangeSuccess).toBe(1);
  });
});
