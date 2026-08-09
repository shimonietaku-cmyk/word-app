// 本物の words.json（1,961語）を使った確認。
// 作り物のデータでは気づけない問題（速度、単元順、選択肢の質）をここで見る。

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Word } from '../../types';
import { buildIndex, unitKey } from '../words';
import { buildChoices, generateDistractors } from '../distractors';
import { buildSession } from '../session';
import { seededRng } from '../random';
import { FIXED_NOW, makeStore } from './helpers';

const words = JSON.parse(
  readFileSync(resolve(__dirname, '../../../public/data/words.json'), 'utf-8'),
) as Word[];
const index = buildIndex(words);

describe('words.json そのもの', () => {
  it('1,961語ある', () => {
    expect(words).toHaveLength(1961);
  });

  it('1年1,115語・2年846語', () => {
    expect(words.filter((w) => w.grade === 1)).toHaveLength(1115);
    expect(words.filter((w) => w.grade === 2)).toHaveLength(846);
  });

  it('IDが重複していない', () => {
    expect(new Set(words.map((w) => w.id)).size).toBe(words.length);
  });

  it('単元一覧は教科書順（＝JSONの登場順）になっている', () => {
    // 文字列で並べ替えると "Unit 10" が "Unit 2" より前に来てしまう。そうなっていないことを確認
    const unitNames = index.units.map((u) => u.unit);
    expect(unitNames[0]).toBe("Let's Be Friends!");
    const sorted = [...unitNames].sort();
    expect(unitNames).not.toEqual(sorted);
  });

  it('すべての語に代表訳(jaMain)がある', () => {
    expect(words.filter((w) => !w.jaMain || w.jaMain.trim() === '')).toHaveLength(0);
  });
});

describe('誤選択肢の質（全1,961語で確認）', () => {
  it('すべての語で3つの選択肢が作れる', () => {
    const failures: string[] = [];
    for (const w of words) {
      const d = generateDistractors(w, index, 3, seededRng(w.en.length + 1));
      if (d.length !== 3) failures.push(w.id);
    }
    expect(failures).toEqual([]);
  });

  it('正解と同じ訳が選択肢に混ざらない（全語チェック）', () => {
    const failures: string[] = [];
    for (const w of words) {
      const choices = buildChoices(w, index, seededRng(w.id.length + 3));
      if (new Set(choices).size !== choices.length) failures.push(`${w.id}:重複`);
      if (!choices.includes(w.jaMain)) failures.push(`${w.id}:正解なし`);
    }
    expect(failures).toEqual([]);
  });

  it('同じ単元の語が優先されている（全体の半分以上）', () => {
    let sameUnit = 0;
    let total = 0;
    for (const w of words) {
      const d = generateDistractors(w, index, 3, seededRng(7));
      for (const x of d) {
        total += 1;
        if (unitKey(x.grade, x.unit) === unitKey(w.grade, w.unit)) sameUnit += 1;
      }
    }
    expect(sameUnit / total).toBeGreaterThan(0.5);
  });
});

describe('速度（タップに16ms以内で反応するため）', () => {
  it('索引づくりは200ms以内', () => {
    const start = performance.now();
    buildIndex(words);
    expect(performance.now() - start).toBeLessThan(200);
  });

  it('4択の生成は1問あたり2ms以内', () => {
    const sample = words.filter((_, i) => i % 7 === 0); // 約280語
    const start = performance.now();
    for (const w of sample) buildChoices(w, index, seededRng(11));
    const perQuestion = (performance.now() - start) / sample.length;
    expect(perQuestion).toBeLessThan(2);
  });

  it('セッションの組み立ては16ms以内', () => {
    const store = makeStore({}, FIXED_NOW);
    const start = performance.now();
    buildSession(index, store, { now: FIXED_NOW, rng: seededRng(13) });
    expect(performance.now() - start).toBeLessThan(16);
  });
});

describe('実データでのセッション', () => {
  it('初回は1年の先頭から新規10問が出る（新規学習モード）', () => {
    const store = makeStore({}, FIXED_NOW);
    store.settings.scope = { grades: [1], units: [] };
    const plan = buildSession(index, store, { mode: 'new', now: FIXED_NOW, rng: seededRng(14) });
    expect(plan.questions).toHaveLength(10);
    expect(plan.questions[0].word.unit).toBe("Let's Be Friends!");
    expect(plan.newCount).toBe(10);
  });

  it('単元を1つだけ選んでも4択が成立する', () => {
    const store = makeStore({}, FIXED_NOW);
    const small = [...index.units].sort((a, b) => a.count - b.count)[0];
    store.settings.scope = { grades: [1, 2], units: [small.key] };
    const plan = buildSession(index, store, { now: FIXED_NOW, rng: seededRng(15) });
    for (const q of plan.questions) {
      expect(q.choices).toHaveLength(4);
      expect(new Set(q.choices).size).toBe(4);
    }
  });
});
