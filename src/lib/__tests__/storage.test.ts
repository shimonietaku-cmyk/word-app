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
    const merged = mergeWithDefaults({ version: 1, cards: {} }, initial);
    expect(merged.settings.sessionSize).toBe(10);
    expect(merged.settings.dailyNewLimit).toBe(20);
    expect(merged.streak.current).toBe(0);
    expect(merged.history).toEqual([]);
  });

  it('設定の一部だけ保存されていても、残りは初期値で埋まる', () => {
    const initial = createInitialStore(FIXED_NOW);
    const merged = mergeWithDefaults(
      { version: 1, settings: { sessionSize: 20 } as never },
      initial,
    );
    expect(merged.settings.sessionSize).toBe(20);
    expect(merged.settings.audio).toBe(true);
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
