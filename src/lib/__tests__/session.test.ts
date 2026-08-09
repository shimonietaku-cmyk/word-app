import { describe, expect, it } from 'vitest';
import { buildRetryQuestions, buildSession, wordsInScope } from '../session';
import { buildIndex, unitKey } from '../words';
import { createCardState } from '../storage';
import { reviewCard } from '../scheduler';
import { Rating } from 'ts-fsrs';
import { seededRng } from '../random';
import { FIXED_NOW, makeStore, makeWord } from './helpers';

/** 学習済み（復習期限が来ている）カードを作る */
function dueCard(daysAgo: number) {
  const past = new Date(FIXED_NOW.getTime() - daysAgo * 86400000);
  const card = createCardState(past);
  card.fsrs = reviewCard(card.fsrs, Rating.Good, past);
  // 期限を強制的に過去にする
  card.fsrs.due = new Date(FIXED_NOW.getTime() - 3600000).toISOString();
  return card;
}

function makeWords(count: number, unit = 'Unit 1', grade: 1 | 2 = 1) {
  return Array.from({ length: count }, (_, i) =>
    makeWord({ id: `${grade}-${unit}-${i}`, unit, grade, jaMain: `やく${grade}${unit}${i}`, en: `w${grade}${i}` }),
  );
}

describe('wordsInScope（範囲のしぼりこみ）', () => {
  it('学年で絞れる', () => {
    const index = buildIndex([...makeWords(5, 'Unit 1', 1), ...makeWords(5, 'Unit 1', 2)]);
    const store = makeStore({}, FIXED_NOW);
    store.settings.scope = { grades: [2], units: [] };
    expect(wordsInScope(index, store)).toHaveLength(5);
    expect(wordsInScope(index, store).every((w) => w.grade === 2)).toBe(true);
  });

  it('単元で絞れる', () => {
    const index = buildIndex([...makeWords(4, 'Unit 1'), ...makeWords(6, 'Unit 2')]);
    const store = makeStore({}, FIXED_NOW);
    store.settings.scope = { grades: [1, 2], units: [unitKey(1, 'Unit 2')] };
    expect(wordsInScope(index, store)).toHaveLength(6);
  });

  it('単元の並びは words.json の登場順を保つ（文字列ソートしない）', () => {
    const index = buildIndex([
      ...makeWords(1, "Let's Be Friends!"),
      ...makeWords(1, 'Unit 1'),
      ...makeWords(1, 'Unit 10'),
      ...makeWords(1, 'Unit 2'),
    ]);
    expect(index.units.map((u) => u.unit)).toEqual([
      "Let's Be Friends!",
      'Unit 1',
      'Unit 10',
      'Unit 2',
    ]);
  });
});

describe('buildSession（セッションの組み立て）', () => {
  it('指定した問題数ちょうどを返す', () => {
    const words = makeWords(50);
    const index = buildIndex(words);
    const store = makeStore({}, FIXED_NOW);
    const plan = buildSession(index, store, { now: FIXED_NOW, rng: seededRng(1) });
    expect(plan.questions).toHaveLength(10);
  });

  it('復習のカードが優先され、残りを新規で埋める', () => {
    const words = makeWords(50);
    const index = buildIndex(words);
    const store = makeStore({}, FIXED_NOW);
    for (let i = 0; i < 4; i++) store.cards[words[i].id] = dueCard(3);

    const plan = buildSession(index, store, { now: FIXED_NOW, rng: seededRng(2) });
    expect(plan.reviewCount).toBe(4);
    expect(plan.newCount).toBe(6);
  });

  it('復習だけで問題数に達する日は新規をゼロにする', () => {
    const words = makeWords(50);
    const index = buildIndex(words);
    const store = makeStore({}, FIXED_NOW);
    for (let i = 0; i < 15; i++) store.cards[words[i].id] = dueCard(3);

    const plan = buildSession(index, store, { now: FIXED_NOW, rng: seededRng(3) });
    expect(plan.newCount).toBe(0);
    expect(plan.reviewCount).toBe(10);
  });

  it('1日の新規上限に達したら新規を出さない', () => {
    const words = makeWords(50);
    const index = buildIndex(words);
    const store = makeStore({}, FIXED_NOW);
    store.history = [{ date: '2026-08-08', answered: 40, correct: 35, newLearned: 20 }];

    const plan = buildSession(index, store, { now: FIXED_NOW, rng: seededRng(4) });
    expect(plan.dailyLimitReached).toBe(true);
    expect(plan.newCount).toBe(0);
  });

  it('上限まで残りが少ないときは、その残り数だけ新規を出す', () => {
    const words = makeWords(50);
    const index = buildIndex(words);
    const store = makeStore({}, FIXED_NOW);
    store.history = [{ date: '2026-08-08', answered: 30, correct: 28, newLearned: 17 }];

    const plan = buildSession(index, store, { now: FIXED_NOW, rng: seededRng(5) });
    expect(plan.newCount).toBe(3); // 20 - 17
  });

  it('新規学習モードでは教科書の順番を保つ', () => {
    const words = makeWords(30);
    const index = buildIndex(words);
    const store = makeStore({}, FIXED_NOW);

    const plan = buildSession(index, store, { mode: 'new', now: FIXED_NOW, rng: seededRng(6) });
    const ids = plan.questions.map((q) => q.word.id);
    expect(ids).toEqual(words.slice(0, 10).map((w) => w.id));
  });

  it('通常モードでは出題順がシャッフルされる', () => {
    const words = makeWords(30);
    const index = buildIndex(words);
    const store = makeStore({}, FIXED_NOW);

    const orders = new Set<string>();
    for (let seed = 1; seed <= 10; seed++) {
      const plan = buildSession(index, store, { now: FIXED_NOW, rng: seededRng(seed) });
      orders.add(plan.questions.map((q) => q.word.id).join(','));
    }
    expect(orders.size).toBeGreaterThan(1);
  });

  it('苦手隔離（leech）の単語は通常セッションに出さない', () => {
    const words = makeWords(30);
    const index = buildIndex(words);
    const store = makeStore({}, FIXED_NOW);
    const leechCard = createCardState(FIXED_NOW);
    leechCard.leech = true;
    store.cards[words[0].id] = leechCard;

    const plan = buildSession(index, store, { now: FIXED_NOW, rng: seededRng(7) });
    expect(plan.questions.map((q) => q.word.id)).not.toContain(words[0].id);
  });

  it('苦手特訓モードでは leech の単語だけを出す', () => {
    const words = makeWords(30);
    const index = buildIndex(words);
    const store = makeStore({}, FIXED_NOW);
    for (let i = 0; i < 3; i++) {
      const c = createCardState(FIXED_NOW);
      c.leech = true;
      store.cards[words[i].id] = c;
    }

    const plan = buildSession(index, store, { mode: 'leech', now: FIXED_NOW, rng: seededRng(8) });
    expect(plan.questions).toHaveLength(3);
    for (const q of plan.questions) {
      expect(store.cards[q.word.id].leech).toBe(true);
    }
  });

  it('テストモードは復習期限を無視して範囲から出す', () => {
    const words = [...makeWords(20, 'Unit 3'), ...makeWords(20, 'Unit 4')];
    const index = buildIndex(words);
    const store = makeStore({}, FIXED_NOW);
    // すべて学習済み・期限は先（通常モードなら出題対象にならない状態）
    for (const w of words) {
      const c = createCardState(FIXED_NOW);
      c.fsrs = reviewCard(c.fsrs, Rating.Easy, FIXED_NOW);
      store.cards[w.id] = c;
    }
    store.testMode = { active: true, units: [unitKey(1, 'Unit 3')], testDate: '2026-08-20' };

    const plan = buildSession(index, store, { mode: 'test', now: FIXED_NOW, rng: seededRng(9) });
    expect(plan.questions).toHaveLength(10);
    for (const q of plan.questions) {
      expect(q.word.unit).toBe('Unit 3');
    }
  });

  it('Stage1の問題には4つの選択肢がつく', () => {
    const words = makeWords(30);
    const index = buildIndex(words);
    const store = makeStore({}, FIXED_NOW);

    const plan = buildSession(index, store, { now: FIXED_NOW, rng: seededRng(10) });
    for (const q of plan.questions) {
      expect(q.stage).toBe(1);
      expect(q.choices).toHaveLength(4);
      expect(q.choices).toContain(q.word.jaMain);
    }
  });

  it('範囲内に単語が無いときは空だと分かる', () => {
    const index = buildIndex(makeWords(5, 'Unit 1', 1));
    const store = makeStore({}, FIXED_NOW);
    store.settings.scope = { grades: [2], units: [] };
    const plan = buildSession(index, store, { now: FIXED_NOW, rng: seededRng(11) });
    expect(plan.empty).toBe(true);
  });
});

describe('buildRetryQuestions（満点で終わらせる再出題）', () => {
  it('間違えた単語だけを、再出題の印つきで返す', () => {
    const words = makeWords(10);
    const index = buildIndex(words);
    const store = makeStore({}, FIXED_NOW);

    const retries = buildRetryQuestions([words[1].id, words[4].id], index, store, FIXED_NOW, seededRng(12));
    expect(retries.map((q) => q.word.id)).toEqual([words[1].id, words[4].id]);
    expect(retries.every((q) => q.isRetry)).toBe(true);
  });

  it('存在しないIDは無視する', () => {
    const index = buildIndex(makeWords(5));
    const store = makeStore({}, FIXED_NOW);
    expect(buildRetryQuestions(['nope'], index, store, FIXED_NOW, seededRng(13))).toHaveLength(0);
  });
});
