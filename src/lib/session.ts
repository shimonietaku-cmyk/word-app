// 毎日モードの1回ぶん（10問・30秒〜1分）に出す問題を組み立てる。
//
// 手順：
//  1. 選択中の範囲に入っていて、苦手隔離(leech)されていないカードを対象にする
//  2. 復習の期限が来ているカードを優先して取る
//  3. 残りを新規カードで埋める
//  4. 出題順はシャッフル（いろいろ混ぜたほうが定着する＝インターリービング）
//     ただし「新規学習モード」のときだけは教科書の順番を保つ
//
// テスト範囲を集中的に回すドリルは、別の仕組み（drill.ts）で組み立てる。

import type { CardState, Question, Stage, Store, Word } from '../types';
import type { WordIndex } from './words';
import { unitKey } from './words';
import { buildChoices } from './distractors';
import { isDue, isNewCard } from './scheduler';
import { produceModeFor } from './stage';
import { createCardState } from './storage';
import { shuffle } from './random';

export type SessionMode = 'mixed' | 'new' | 'leech';

export interface BuildSessionOptions {
  mode?: SessionMode;
  /** 問題数。省略時は設定の sessionSize */
  size?: number;
  now?: Date;
  rng?: () => number;
}

export interface SessionPlan {
  questions: Question[];
  /** 内訳（画面表示と統計用） */
  reviewCount: number;
  newCount: number;
  /** 範囲内に出せるカードが1枚も無い場合 true */
  empty: boolean;
}

/** 範囲（scope）に含まれる単語を、words.json の登場順のまま返す */
export function wordsInScope(index: WordIndex, store: Store): Word[] {
  const { grades, units } = store.settings.scope;
  const unitSet = new Set(units);
  return index.all.filter((w) => {
    if (!grades.includes(w.grade)) return false;
    if (unitSet.size > 0 && !unitSet.has(unitKey(w.grade, w.unit))) return false;
    return true;
  });
}

/** カード状態を取り出す（無ければ新規カードを作って返す。保存はしない） */
export function cardOf(store: Store, id: string, now: Date): CardState {
  return store.cards[id] ?? createCardState(now);
}

/**
 * セッションを組み立てる。
 * この関数は状態を書き換えない（純粋な計算）ので、テストで結果を確かめられる。
 */
export function buildSession(
  index: WordIndex,
  store: Store,
  options: BuildSessionOptions = {},
): SessionPlan {
  const now = options.now ?? new Date();
  const rng = options.rng ?? Math.random;
  const mode = options.mode ?? 'mixed';
  const size = options.size ?? store.settings.sessionSize;

  // --- 対象の単語を決める ---
  let pool: Word[];
  if (mode === 'leech') {
    pool = wordsInScope(index, store).filter((w) => store.cards[w.id]?.leech);
  } else {
    pool = wordsInScope(index, store).filter((w) => !store.cards[w.id]?.leech);
  }

  if (pool.length === 0) {
    return { questions: [], reviewCount: 0, newCount: 0, empty: true };
  }

  let picked: { word: Word; isNew: boolean }[] = [];

  if (mode === 'new') {
    // 新規学習モード：教科書順のまま、まだ出していない単語を前から取る
    picked = pool
      .filter((w) => isNewWord(store, w))
      .slice(0, size)
      .map((word) => ({ word, isNew: true }));
  } else if (mode === 'leech') {
    picked = shuffle(pool, rng)
      .slice(0, size)
      .map((word) => ({ word, isNew: false }));
  } else {
    // 通常モード：復習を優先し、残りを新規で埋める
    const due = pool
      .filter((w) => {
        const card = store.cards[w.id];
        return card && !isNewCard(card.fsrs) && isDue(card.fsrs, now);
      })
      .sort((a, b) => dueTime(store, a) - dueTime(store, b));

    picked = due.slice(0, size).map((word) => ({ word, isNew: false }));

    const remaining = size - picked.length;
    if (remaining > 0) {
      const fresh = pool.filter((w) => isNewWord(store, w)).slice(0, remaining);
      picked.push(...fresh.map((word) => ({ word, isNew: true })));
    }

    // それでも足りなければ、期限前の復習カードを前倒しで足す（セッションが薄くならないように）
    if (picked.length < size) {
      const pickedIds = new Set(picked.map((p) => p.word.id));
      const early = pool
        .filter((w) => !pickedIds.has(w.id) && store.cards[w.id] && !isNewCard(store.cards[w.id].fsrs))
        .sort((a, b) => dueTime(store, a) - dueTime(store, b))
        .slice(0, size - picked.length);
      picked.push(...early.map((word) => ({ word, isNew: false })));
    }
  }

  // --- 出題順 ---
  const ordered = mode === 'new' ? picked : shuffle(picked, rng);

  const questions = ordered.map(({ word, isNew }) => ({
    ...makeQuestion(word, cardOf(store, word.id, now), index, rng, false),
    isNew,
  }));

  return {
    questions,
    reviewCount: ordered.filter((p) => !p.isNew).length,
    newCount: ordered.filter((p) => p.isNew).length,
    empty: questions.length === 0,
  };
}

/** 1問ぶんのデータを作る（Stageに応じて選択肢や入力方式を決める） */
export function makeQuestion(
  word: Word,
  card: CardState,
  index: WordIndex,
  rng: () => number = Math.random,
  isRetry = false,
): Question {
  const stage: Stage = card.stage;
  const q: Question = { word, stage, isNew: false, isRetry };
  if (stage === 1) {
    q.choices = buildChoices(word, index, rng);
  } else if (stage === 3) {
    q.produceMode = produceModeFor(card);
  }
  return q;
}

/**
 * 満点で終わらせるための再出題。
 * セッション中に間違えた単語を、そのセッションの最後にもう一度出す。
 * この分は FSRS の評価にも統計にも使わない（実力を過大評価しないため）。
 */
export function buildRetryQuestions(
  wordIds: string[],
  index: WordIndex,
  store: Store,
  now: Date = new Date(),
  rng: () => number = Math.random,
): Question[] {
  return wordIds
    .map((id) => index.byId.get(id))
    .filter((w): w is Word => Boolean(w))
    .map((w) => makeQuestion(w, cardOf(store, w.id, now), index, rng, true));
}

function isNewWord(store: Store, word: Word): boolean {
  const card = store.cards[word.id];
  return !card || isNewCard(card.fsrs);
}

function dueTime(store: Store, word: Word): number {
  const card = store.cards[word.id];
  return card ? new Date(card.fsrs.due).getTime() : Infinity;
}

/** 今日出せる復習カードの残り枚数（ホームの表示に使う） */
export function dueCount(index: WordIndex, store: Store, now: Date = new Date()): number {
  return wordsInScope(index, store).filter((w) => {
    const card = store.cards[w.id];
    return card && !card.leech && !isNewCard(card.fsrs) && isDue(card.fsrs, now);
  }).length;
}
