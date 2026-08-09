import { describe, expect, it } from 'vitest';
import { Rating } from 'ts-fsrs';
import {
  fromStored,
  isDue,
  isNewCard,
  newStoredCard,
  ratingFor,
  reviewCard,
  thresholdsFor,
  toStored,
} from '../scheduler';
import { FIXED_NOW } from './helpers';

describe('ratingFor（評価の自動判定）', () => {
  it('不正解は必ず Again', () => {
    expect(ratingFor(false, 500, 1)).toBe(Rating.Again);
    expect(ratingFor(false, 20000, 3)).toBe(Rating.Again);
  });

  it('正解で2秒未満なら Easy', () => {
    expect(ratingFor(true, 1500, 1)).toBe(Rating.Easy);
  });

  it('正解で2〜6秒なら Good', () => {
    expect(ratingFor(true, 2000, 1)).toBe(Rating.Good);
    expect(ratingFor(true, 4000, 2)).toBe(Rating.Good);
    expect(ratingFor(true, 6000, 1)).toBe(Rating.Good);
  });

  it('正解で6秒超なら Hard（遅いが正解を Again に落とさない）', () => {
    expect(ratingFor(true, 6001, 1)).toBe(Rating.Hard);
    expect(ratingFor(true, 30000, 2)).toBe(Rating.Hard);
  });

  it('Stage3は打鍵時間を考えて閾値が緩む（5秒/15秒）', () => {
    expect(thresholdsFor(3)).toEqual({ fast: 5000, slow: 15000 });
    expect(ratingFor(true, 4000, 3)).toBe(Rating.Easy); // Stage1なら Good になる速さ
    expect(ratingFor(true, 10000, 3)).toBe(Rating.Good); // Stage1なら Hard になる速さ
    expect(ratingFor(true, 16000, 3)).toBe(Rating.Hard);
  });
});

describe('カードの保存形式の変換', () => {
  it('文字列 ⇔ Date を往復しても値が変わらない', () => {
    const stored = newStoredCard(FIXED_NOW);
    const roundTrip = toStored(fromStored(stored));
    expect(roundTrip).toEqual(stored);
  });

  it('新規カードは未学習として判定される', () => {
    expect(isNewCard(newStoredCard(FIXED_NOW))).toBe(true);
  });
});

describe('reviewCard（次の復習日の計算）', () => {
  it('正解すると次回の復習日が先に延びる', () => {
    const card = newStoredCard(FIXED_NOW);
    const after = reviewCard(card, Rating.Good, FIXED_NOW);
    expect(new Date(after.due).getTime()).toBeGreaterThan(FIXED_NOW.getTime());
    expect(after.reps).toBe(1);
  });

  it('Easy は Good より復習日が先になる', () => {
    const card = newStoredCard(FIXED_NOW);
    const good = reviewCard(card, Rating.Good, FIXED_NOW);
    const easy = reviewCard(card, Rating.Easy, FIXED_NOW);
    expect(new Date(easy.due).getTime()).toBeGreaterThanOrEqual(new Date(good.due).getTime());
  });

  it('Again はすぐ復習に戻ってくる（同じ日のうち）', () => {
    const card = newStoredCard(FIXED_NOW);
    const again = reviewCard(card, Rating.Again, FIXED_NOW);
    const hoursLater = (new Date(again.due).getTime() - FIXED_NOW.getTime()) / 3600000;
    expect(hoursLater).toBeLessThan(24);
  });

  it('復習の多さ設定を変えても計算が壊れない', () => {
    const card = newStoredCard(FIXED_NOW);
    for (const retention of [0.85, 0.9, 0.95]) {
      const after = reviewCard(card, Rating.Good, FIXED_NOW, retention);
      expect(Number.isFinite(new Date(after.due).getTime())).toBe(true);
    }
  });

  it('期限が来たカードは isDue が true になる', () => {
    const card = newStoredCard(FIXED_NOW);
    const after = reviewCard(card, Rating.Good, FIXED_NOW);
    const muchLater = new Date(FIXED_NOW.getTime() + 400 * 86400000);
    expect(isDue(after, FIXED_NOW)).toBe(false);
    expect(isDue(after, muchLater)).toBe(true);
  });
});
