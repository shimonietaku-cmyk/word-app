import { describe, expect, it } from 'vitest';
import { displayStreak, grantFreezes, markStudied, MAX_FREEZES } from '../streak';
import { createInitialStore, dateKey } from '../storage';
import { FIXED_NOW } from './helpers';

function baseStreak(overrides: Partial<ReturnType<typeof createInitialStore>['streak']> = {}) {
  return { ...createInitialStore(FIXED_NOW).streak, ...overrides };
}

const day = (offset: number) => new Date(FIXED_NOW.getTime() + offset * 86400000);

describe('markStudied（学習した日の記録）', () => {
  it('初日は1日目', () => {
    const { streak } = markStudied(baseStreak(), FIXED_NOW);
    expect(streak.current).toBe(1);
    expect(streak.days).toEqual([dateKey(FIXED_NOW)]);
  });

  it('連続して学習すると増える', () => {
    let s = markStudied(baseStreak(), FIXED_NOW).streak;
    s = markStudied(s, day(1)).streak;
    s = markStudied(s, day(2)).streak;
    expect(s.current).toBe(3);
    expect(s.best).toBe(3);
  });

  it('同じ日に2回やっても二重に数えない', () => {
    let s = markStudied(baseStreak(), FIXED_NOW).streak;
    s = markStudied(s, FIXED_NOW).streak;
    expect(s.current).toBe(1);
    expect(s.days).toHaveLength(1);
  });

  it('1日抜けてもフリーズがあれば連続が続く', () => {
    let s = baseStreak({ current: 5, lastStudyDate: dateKey(FIXED_NOW), freezes: 1, days: [dateKey(FIXED_NOW)] });
    const update = markStudied(s, day(2)); // 1日空いた
    s = update.streak;
    expect(s.current).toBe(6);
    expect(s.freezes).toBe(0);
    expect(update.usedFreeze).toBe(1);
    expect(update.reset).toBe(false);
  });

  it('フリーズが尽きて2日空いたらリセットされる', () => {
    const s = baseStreak({
      current: 10,
      best: 10,
      lastStudyDate: dateKey(FIXED_NOW),
      freezes: 0,
      days: [dateKey(FIXED_NOW)],
    });
    const update = markStudied(s, day(3)); // 2日空いた
    expect(update.streak.current).toBe(1);
    expect(update.reset).toBe(true);
    expect(update.streak.best).toBe(10); // 自己ベストは残る
  });
});

describe('grantFreezes（週1回のフリーズ付与）', () => {
  it('7日たつと1個もらえる', () => {
    const s = baseStreak({ freezes: 0, lastFreezeGrantDate: dateKey(FIXED_NOW) });
    expect(grantFreezes(s, day(6)).freezes).toBe(0);
    expect(grantFreezes(s, day(7)).freezes).toBe(1);
  });

  it('上限は2個', () => {
    const s = baseStreak({ freezes: 1, lastFreezeGrantDate: dateKey(FIXED_NOW) });
    expect(grantFreezes(s, day(70)).freezes).toBe(MAX_FREEZES);
  });

  it('付与日が更新され、同じ週に何度も増えない', () => {
    const s = baseStreak({ freezes: 0, lastFreezeGrantDate: dateKey(FIXED_NOW) });
    const after = grantFreezes(s, day(8));
    expect(after.freezes).toBe(1);
    expect(grantFreezes(after, day(8)).freezes).toBe(1);
  });
});

describe('displayStreak（表示用の連続日数）', () => {
  it('学習していない日でも、フリーズで埋められる範囲なら継続表示', () => {
    const s = baseStreak({ current: 4, lastStudyDate: dateKey(FIXED_NOW), freezes: 1 });
    expect(displayStreak(s, day(2))).toBe(4);
  });

  it('埋められないほど空いたら0を表示（責める文言は出さずUIで「またここから」）', () => {
    const s = baseStreak({ current: 4, lastStudyDate: dateKey(FIXED_NOW), freezes: 0 });
    expect(displayStreak(s, day(3))).toBe(0);
  });
});
