import { describe, expect, it } from 'vitest';
import {
  createCardState,
  createInitialStore,
  dateKey,
  diffDays,
  exportStore,
  importStore,
  mergeWithDefaults,
  pruneCards,
  todayHistory,
} from '../storage';
import { FIXED_NOW, makeWord } from './helpers';

describe('日付の計算', () => {
  it('dateKey は端末のローカル日付を "YYYY-MM-DD" で返す', () => {
    expect(dateKey(FIXED_NOW)).toBe('2026-08-08');
  });

  it('diffDays は日数の差を返す', () => {
    expect(diffDays('2026-08-08', '2026-08-10')).toBe(2);
    expect(diffDays('2026-08-10', '2026-08-08')).toBe(-2);
    expect(diffDays('2026-08-31', '2026-09-01')).toBe(1);
  });
});

describe('壊れたデータからの復旧', () => {
  it('壊れたJSONを読み込もうとしたら null を返す', () => {
    expect(importStore('{壊れている')).toBeNull();
  });

  it('バージョンが違うデータは受け付けない', () => {
    expect(importStore(JSON.stringify({ version: 99 }))).toBeNull();
  });

  it('項目が足りないデータは初期値で補われる', () => {
    const initial = createInitialStore(FIXED_NOW);
    const merged = mergeWithDefaults({ version: 2, cards: {} }, initial);
    expect(merged.settings.sessionSize).toBe(10);
    expect(merged.streak.current).toBe(0);
    expect(merged.history).toEqual([]);
    expect(merged.drill).toEqual({ current: null, presets: [] });
  });

  it('設定の一部だけ保存されていても、残りは初期値で埋まる', () => {
    const initial = createInitialStore(FIXED_NOW);
    const merged = mergeWithDefaults(
      { version: 2, settings: { sessionSize: 20 } as never },
      initial,
    );
    expect(merged.settings.sessionSize).toBe(20);
    expect(merged.settings.audio).toBe(true);
  });
});

describe('古い保存データの移行（version 1 → 2）', () => {
  const v1 = {
    version: 1,
    cards: { 'g1-x-0001': { stage: 2, correct: 5, wrong: 1 } },
    streak: { current: 7, best: 9, lastStudyDate: '2026-08-07', freezes: 1, days: ['2026-08-07'] },
    settings: { dailyNewLimit: 20, sessionSize: 15, audio: false, darkMode: 'dark' },
    history: [{ date: '2026-08-07', answered: 30, correct: 25, newLearned: 10 }],
    testMode: { active: true, units: ['1|Unit 3'], testDate: '2026-08-20' },
  };

  it('これまでの学習記録が消えずに引き継がれる', () => {
    const restored = importStore(JSON.stringify(v1), FIXED_NOW);
    expect(restored).not.toBeNull();
    expect(restored!.cards['g1-x-0001']).toBeDefined();
    expect(restored!.streak.current).toBe(7);
    expect(restored!.streak.best).toBe(9);
    expect(restored!.history).toHaveLength(1);
    expect(restored!.settings.sessionSize).toBe(15);
    expect(restored!.settings.audio).toBe(false);
  });

  it('廃止した項目（1日の上限・旧テストモード）は取り除かれる', () => {
    const restored = importStore(JSON.stringify(v1), FIXED_NOW);
    expect(restored).not.toBeNull();
    expect('dailyNewLimit' in restored!.settings).toBe(false);
    expect('testMode' in restored!).toBe(false);
    expect(restored!.version).toBe(2);
  });

  it('新しく増えたドリルの項目は空で用意される', () => {
    const restored = importStore(JSON.stringify(v1), FIXED_NOW);
    expect(restored!.drill).toEqual({ current: null, presets: [] });
  });

  it('知らないバージョンは読み込まない', () => {
    expect(importStore(JSON.stringify({ version: 99 }))).toBeNull();
    expect(importStore(JSON.stringify({ version: 0 }))).toBeNull();
  });
});

describe('書き出しと読み込み', () => {
  it('書き出したものをそのまま読み込める', () => {
    const store = createInitialStore(FIXED_NOW);
    store.settings.sessionSize = 15;
    const restored = importStore(exportStore(store), FIXED_NOW);
    expect(restored?.settings.sessionSize).toBe(15);
  });
});

describe('その他', () => {
  it('todayHistory は記録が無ければ0件のものを返す', () => {
    const store = createInitialStore(FIXED_NOW);
    expect(todayHistory(store, '2026-08-08').answered).toBe(0);
  });

  it('pruneCards は単語データに無いカード記録を取り除く', () => {
    const store = createInitialStore(FIXED_NOW);
    store.cards = {
      keep: createCardState(FIXED_NOW),
      remove: createCardState(FIXED_NOW),
    };
    const words = [makeWord({ id: 'keep' })];
    const pruned = pruneCards(store, words);
    expect(Object.keys(pruned.cards)).toEqual(['keep']);
  });
});
