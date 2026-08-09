// 「記録」画面で使う集計。他人との比較は一切しない。すべて自分比。

import type { Store, Word } from '../types';
import type { WordIndex, UnitInfo } from './words';
import { unitKey } from './words';
import { dateKey, diffDays, parseDateKey } from './storage';

export interface UnitProgress {
  info: UnitInfo;
  total: number;
  /** Stage3到達（緑） */
  mastered: number;
  /** Stage2（黄） */
  recall: number;
  /** Stage1で学習中（橙） */
  learning: number;
  /** 未着手（グレー） */
  untouched: number;
  /** 0〜1。塗りの濃さに使う */
  ratio: number;
}

/** 単元ごとの習熟度。並び順は words.json の登場順（教科書順）を保つ */
export function unitProgress(index: WordIndex, store: Store): UnitProgress[] {
  const buckets = new Map<string, UnitProgress>();
  for (const info of index.units) {
    buckets.set(info.key, {
      info,
      total: 0,
      mastered: 0,
      recall: 0,
      learning: 0,
      untouched: 0,
      ratio: 0,
    });
  }

  for (const w of index.all) {
    const bucket = buckets.get(unitKey(w.grade, w.unit));
    if (!bucket) continue;
    bucket.total += 1;
    const card = store.cards[w.id];
    if (!card || card.fsrs.reps === 0) bucket.untouched += 1;
    else if (card.stage === 3) bucket.mastered += 1;
    else if (card.stage === 2) bucket.recall += 1;
    else bucket.learning += 1;
  }

  const list = [...buckets.values()];
  for (const b of list) {
    // Stage3を1.0、Stage2を0.66、Stage1を0.33として平均する
    b.ratio =
      b.total === 0 ? 0 : (b.mastered * 1 + b.recall * 0.66 + b.learning * 0.33) / b.total;
  }
  return list;
}

export interface DailyPoint {
  date: string;
  label: string; // "8/8"
  answered: number;
  correct: number;
  newLearned: number;
}

/** 直近30日ぶんの学習量（学習していない日は0で埋める） */
export function last30Days(store: Store, now: Date = new Date()): DailyPoint[] {
  const map = new Map(store.history.map((h) => [h.date, h]));
  const points: DailyPoint[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    const key = dateKey(d);
    const h = map.get(key);
    points.push({
      date: key,
      label: `${d.getMonth() + 1}/${d.getDate()}`,
      answered: h?.answered ?? 0,
      correct: h?.correct ?? 0,
      newLearned: h?.newLearned ?? 0,
    });
  }
  return points;
}

export interface LeechEntry {
  word: Word;
  wrong: number;
  correct: number;
}

/** 苦手単語トップ20（間違いの多い順）。leech でなくても間違いが多ければ入れる */
export function toughWords(index: WordIndex, store: Store, limit = 20): LeechEntry[] {
  const entries: LeechEntry[] = [];
  for (const [id, card] of Object.entries(store.cards)) {
    if (card.wrong === 0) continue;
    const word = index.byId.get(id);
    if (!word) continue;
    entries.push({ word, wrong: card.wrong, correct: card.correct });
  }
  entries.sort((a, b) => b.wrong - a.wrong || a.correct - b.correct);
  return entries.slice(0, limit);
}

/** leech に隔離されている単語 */
export function leechWords(index: WordIndex, store: Store): Word[] {
  const words: Word[] = [];
  for (const [id, card] of Object.entries(store.cards)) {
    if (!card.leech) continue;
    const w = index.byId.get(id);
    if (w) words.push(w);
  }
  return words;
}

/** 覚えた語数の合計（Stage2以上に到達した語） */
export function learnedTotal(store: Store): number {
  return Object.values(store.cards).filter((c) => c.stage >= 2 || c.correct > 0).length;
}

/** 昨日の学習語数との差（「昨日より何語増えたか」の表示に使う） */
export function newLearnedDiff(store: Store, now: Date = new Date()): number {
  const today = dateKey(now);
  const yesterday = dateKey(new Date(now.getTime() - 86400000));
  const t = store.history.find((h) => h.date === today)?.newLearned ?? 0;
  const y = store.history.find((h) => h.date === yesterday)?.newLearned ?? 0;
  return t - y;
}

/** テスト実施日までの残り日数 */
export function daysUntil(dateStr: string, now: Date = new Date()): number {
  if (!dateStr) return 0;
  return diffDays(dateKey(now), dateKey(parseDateKey(dateStr)));
}
