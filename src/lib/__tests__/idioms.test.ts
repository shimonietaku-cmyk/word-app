// 熟語モードの確認。
//
// 出題の中身は本物の idioms.json（243件）で全件まわして確かめる。
// ここが崩れると「答えが2つある問題」「空所が埋まらない例文」が
// そのまま子どもの画面に出てしまうので、作り物のデータでは足りない。

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { IdiomEntry, IdiomFormat, Word } from '../../types';
import { buildIndex } from '../words';
import {
  AUTO_ORDER,
  BLANK,
  answeredInIdiomRound,
  blankCount,
  buildIdiomIndex,
  defaultIdiomOptions,
  entriesFor,
  fillBlanks,
  formatFor,
  idiomWrongOnlyRound,
  makeIdiomQuestion,
  nextIdiomRound,
  recordIdiomAnswer,
  slotPlanFor,
  speakable,
  startIdioms,
  summarizeIdioms,
} from '../idioms';
import { emptyStat } from '../drill';
import { seededRng } from '../random';

const dataDir = resolve(__dirname, '../../../public/data');
const words = JSON.parse(readFileSync(resolve(dataDir, 'words.json'), 'utf-8')) as Word[];
const entries = JSON.parse(readFileSync(resolve(dataDir, 'idioms.json'), 'utf-8')) as IdiomEntry[];

const wordIndex = buildIndex(words);
const index = buildIdiomIndex(entries, wordIndex);

const FORMATS: IdiomFormat[] = ['meaning', 'cloze', 'slot', 'reverse'];

describe('idioms.json そのもの', () => {
  it('words.json の phrase 全件に例文がある', () => {
    const phrases = words.filter((w) => w.type === 'phrase');
    expect(entries).toHaveLength(phrases.length);
    expect(new Set(entries.map((e) => e.id))).toEqual(new Set(phrases.map((w) => w.id)));
  });

  it('見出しが words.json と一致している', () => {
    for (const e of entries) {
      expect(wordIndex.byId.get(e.id)?.en).toBe(e.en);
    }
  });

  it('例文の空所の数と、埋める語の数が合っている', () => {
    for (const e of entries) {
      expect(blankCount(e.q)).toBe(e.a.split('|').length);
      expect(blankCount(e.q)).toBeGreaterThan(0);
    }
  });

  it('空所を埋めると "___" が残らない', () => {
    for (const e of entries) {
      const filled = fillBlanks(e);
      expect(filled).not.toContain(BLANK);
      expect(filled.length).toBeGreaterThan(e.en.length);
    }
  });

  it('和訳が必ず付いている', () => {
    for (const e of entries) expect(e.ja.trim().length).toBeGreaterThan(0);
  });

  it('熟語と複合語に分類されている', () => {
    const kinds = new Set(entries.map((e) => e.kind));
    expect(kinds).toEqual(new Set(['idiom', 'compound']));
    // 「熟語だけ」に絞っても、1周まわすだけの量がある
    expect(entries.filter((e) => e.kind === 'idiom').length).toBeGreaterThan(150);
  });
});

describe('索引', () => {
  it('words.json にある熟語だけを取り込む', () => {
    expect(index.all).toHaveLength(entries.length);
    for (const e of index.all) expect(index.wordOf.get(e.id)).toBeTruthy();
  });

  it('words.json に無い熟語は落とす', () => {
    const withGhost = buildIdiomIndex(
      [...entries, { id: 'no-such-id', en: 'ghost', kind: 'idiom', q: `a ${BLANK}`, a: 'x', ja: '' }],
      wordIndex,
    );
    expect(withGhost.all).toHaveLength(entries.length);
  });

  it('既定の設定では複合語を出さない', () => {
    const list = entriesFor(index, defaultIdiomOptions());
    expect(list.every((e) => e.kind === 'idiom')).toBe(true);
    expect(list.length).toBeGreaterThan(150);
  });

  it('学年でしぼれる', () => {
    const g1 = entriesFor(index, { grades: [1], includeCompound: true, mode: 'auto' });
    const g2 = entriesFor(index, { grades: [2], includeCompound: true, mode: 'auto' });
    expect(g1.length + g2.length).toBe(entries.length);
    expect(g1.every((e) => index.wordOf.get(e.id)!.grade === 1)).toBe(true);
  });
});

describe('出題づくり（全件・全形式）', () => {
  it('どの形式でも、選択肢は4つで重複がなく、正解が必ず入っている', () => {
    const rng = seededRng(7);
    for (const entry of index.all) {
      for (const format of FORMATS) {
        const q = makeIdiomQuestion(entry, index, format, rng);
        expect(new Set(q.choices).size).toBe(q.choices.length);
        expect(q.choices).toContain(q.answer);
        expect(q.choices.length).toBe(4);
        expect(q.prompt.trim().length).toBeGreaterThan(0);
        expect(q.speech.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('選択肢の中に、正解と同じ意味のものが混ざらない', () => {
    // take a picture と take a photo のように訳が同じ熟語を並べると、
    // どちらを選んでも正しいのに片方だけ×になってしまう
    const rng = seededRng(11);
    for (const entry of index.all) {
      const answerJa = index.wordOf.get(entry.id)!.jaMain;
      const q = makeIdiomQuestion(entry, index, 'cloze', rng);
      for (const choice of q.choices) {
        if (choice === q.answer) continue;
        const other = index.all.find((e) => e.en === choice)!;
        const otherJa = index.wordOf.get(other.id)!.jaMain;
        expect(otherJa).not.toBe(answerJa);
        expect(answerJa.includes(otherJa)).toBe(false);
        expect(otherJa.includes(answerJa)).toBe(false);
      }
    }
  });

  it('例文の穴うめでは、問題文に空所が残り、答え合わせ用の文は埋まっている', () => {
    const rng = seededRng(3);
    for (const entry of index.all) {
      const q = makeIdiomQuestion(entry, index, 'cloze', rng);
      expect(q.prompt).toContain(BLANK);
      expect(q.filled).not.toContain(BLANK);
      expect(q.hint).toBe(entry.ja);
    }
  });

  it('語句の穴うめでは、答えを入れ替えても別の熟語にならない', () => {
    const rng = seededRng(5);
    let made = 0;
    for (const entry of index.all) {
      const plan = slotPlanFor(entry, index, rng);
      if (!plan) continue;
      made += 1;
      expect(plan.prompt).toContain(BLANK);
      expect(plan.distractors).toHaveLength(3);
      expect(plan.distractors).not.toContain(plan.answer);
      // 空所に誤選択肢を入れて、別の熟語そのものになっていないこと
      for (const d of plan.distractors) {
        const swapped = plan.prompt.replace(BLANK, d).toLowerCase().replace(/[〜.,]/g, '').trim();
        expect(index.headings.has(swapped.replace(/\s+/g, ' '))).toBe(false);
      }
    }
    // ほとんどの熟語で作れているはず（作れないのは "the U.K." のような見出しだけ）
    expect(made).toBeGreaterThan(index.all.length * 0.9);
  });

  it('語句の穴うめが作れない見出しは、例文の穴うめに落とす', () => {
    const odd: IdiomEntry = {
      id: index.all[0].id,
      en: 'a',
      kind: 'idiom',
      q: `I want ${BLANK}.`,
      a: 'a',
      ja: 'テスト',
    };
    const q = makeIdiomQuestion(odd, index, 'slot', seededRng(1));
    expect(q.format).toBe('cloze');
  });

  it('読み上げ用の文字列から 〜 や記号が消える', () => {
    expect(speakable('look for 〜')).toBe('look for');
    expect(speakable('stay at[in]')).toBe('stay at');
    expect(speakable('〜 year(s) old')).toBe('years old');
    expect(speakable('look forward to -ing')).toBe('look forward to');
  });
});

describe('おまかせの出題形式', () => {
  it('正解を重ねるほど難しくなる', () => {
    expect(formatFor({ ...emptyStat(), streak: 0 }, 'auto')).toBe('meaning');
    expect(formatFor({ ...emptyStat(), streak: 1 }, 'auto')).toBe('cloze');
    expect(formatFor({ ...emptyStat(), streak: 2 }, 'auto')).toBe('slot');
    expect(formatFor({ ...emptyStat(), streak: 9 }, 'auto')).toBe('reverse');
    expect(AUTO_ORDER).toHaveLength(4);
  });

  it('形式を指定したときはその形式のまま', () => {
    expect(formatFor({ ...emptyStat(), streak: 5 }, 'cloze')).toBe('cloze');
  });
});

describe('1周の回しかた', () => {
  it('1周で全部の熟語がちょうど1回ずつ出る', () => {
    const rng = seededRng(42);
    const state = startIdioms(index, defaultIdiomOptions(), null, rng);
    const list = entriesFor(index, defaultIdiomOptions());
    expect(state.queue).toHaveLength(list.length);
    expect(new Set(state.queue).size).toBe(list.length);
    expect(state.round).toBe(1);
  });

  it('答えるとキューから減り、進んだ数が増える', () => {
    const rng = seededRng(1);
    let state = startIdioms(index, defaultIdiomOptions(), null, rng);
    const total = state.roundTotal;
    state = recordIdiomAnswer(state, state.queue[0], true);
    expect(state.queue).toHaveLength(total - 1);
    expect(answeredInIdiomRound(state)).toBe(1);
    expect(state.stats[Object.keys(state.stats)[0]].streak).toBe(1);
  });

  it('2周目は、まちがえた熟語のほうが多く出る', () => {
    const rng = seededRng(9);
    let state = startIdioms(index, defaultIdiomOptions(), null, rng);
    const [wrongId, rightId] = state.queue;
    state = recordIdiomAnswer(state, wrongId, false);
    state = recordIdiomAnswer(state, rightId, true);
    const next = nextIdiomRound(index, state, rng);
    const count = (id: string) => next.queue.filter((q) => q === id).length;
    expect(count(wrongId)).toBeGreaterThan(count(rightId));
    expect(next.round).toBe(2);
  });

  it('まちがえた熟語だけの周は、周回数に数えない', () => {
    const rng = seededRng(4);
    let state = startIdioms(index, defaultIdiomOptions(), null, rng);
    const wrongId = state.queue[0];
    state = recordIdiomAnswer(state, wrongId, false);
    const only = idiomWrongOnlyRound(index, state, [wrongId], rng);
    expect(only.queue).toEqual([wrongId]);
    expect(only.wrongOnly).toBe(true);
    expect(only.round).toBe(state.round);

    const back = nextIdiomRound(index, only, rng);
    expect(back.round).toBe(state.round); // 特別な周のあとは番号が進まない
    expect(back.wrongOnly).toBe(false);
  });

  it('設定を変えなければ、途中経過をそのまま続けられる', () => {
    const rng = seededRng(2);
    const options = defaultIdiomOptions();
    let state = startIdioms(index, options, null, rng);
    state = recordIdiomAnswer(state, state.queue[0], true);
    const resumed = startIdioms(index, { ...options }, state, rng);
    expect(resumed).toBe(state);
  });

  it('設定を変えると出し直すが、成績は引き継ぐ', () => {
    const rng = seededRng(6);
    const options = defaultIdiomOptions();
    let state = startIdioms(index, options, null, rng);
    const answeredId = state.queue[0];
    state = recordIdiomAnswer(state, answeredId, true);

    const wider = startIdioms(index, { ...options, includeCompound: true }, state, rng);
    expect(wider.queue.length).toBe(entries.length);
    expect(wider.stats[answeredId].correct).toBe(1);
    expect(wider.round).toBe(1);
  });

  it('まとめの数が合っている', () => {
    const rng = seededRng(8);
    let state = startIdioms(index, defaultIdiomOptions(), null, rng);
    const [a, b] = state.queue;
    state = recordIdiomAnswer(state, a, true);
    state = recordIdiomAnswer(state, a, true); // 2回続けて正解＝仕上がり
    state = recordIdiomAnswer(state, b, false);

    const summary = summarizeIdioms(index, state);
    expect(summary.total).toBe(entriesFor(index, defaultIdiomOptions()).length);
    expect(summary.seen).toBe(2);
    expect(summary.solid).toBe(1);
    expect(summary.wrongNow).toBe(1);
    expect(summary.untouched).toBe(summary.total - 2);
  });

  it('熟語モードの状態が空でも、まとめが壊れない', () => {
    expect(summarizeIdioms(index, null).total).toBe(0);
  });
});

describe('速さ', () => {
  it('1周ぶんの出題を作っても一瞬で終わる', () => {
    const rng = seededRng(13);
    const state = startIdioms(index, defaultIdiomOptions(), null, rng);
    const start = performance.now();
    for (const id of state.queue) {
      const entry = index.byId.get(id)!;
      makeIdiomQuestion(entry, index, formatFor(emptyStat(), 'auto'), rng);
    }
    // 実機でも1問あたり16ms（画面の1コマ）を超えないことの目安
    expect(performance.now() - start).toBeLessThan(state.queue.length * 16);
  });
});
