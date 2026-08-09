import { describe, expect, it } from 'vitest';
import { buildChoices, generateDistractors } from '../distractors';
import { buildIndex } from '../words';
import { seededRng } from '../random';
import { makeWord } from './helpers';

describe('generateDistractors（誤選択肢の生成）', () => {
  it('必ず3つ返す', () => {
    const words = Array.from({ length: 20 }, (_, i) =>
      makeWord({ id: `x${i}`, en: `word${i}`, jaMain: `やく${i}` }),
    );
    const index = buildIndex(words);
    const result = generateDistractors(words[0], index, 3, seededRng(1));
    expect(result).toHaveLength(3);
  });

  it('正解そのものを選択肢に入れない', () => {
    const words = Array.from({ length: 10 }, (_, i) =>
      makeWord({ id: `y${i}`, en: `w${i}`, jaMain: `訳${i}` }),
    );
    const index = buildIndex(words);
    const target = words[3];
    const result = generateDistractors(target, index, 3, seededRng(2));
    expect(result.map((w) => w.id)).not.toContain(target.id);
  });

  it('正解と同じ日本語訳の語を選択肢に入れない（play のような重複対策）', () => {
    const words = [
      makeWord({ id: 'a', en: 'play', jaMain: '〜をする', pos: 'verb' }),
      makeWord({ id: 'b', en: 'play', jaMain: '〜をする', pos: 'verb' }), // 同じ訳の別エントリ
      makeWord({ id: 'c', en: 'run', jaMain: '走る', pos: 'verb' }),
      makeWord({ id: 'd', en: 'swim', jaMain: '泳ぐ', pos: 'verb' }),
      makeWord({ id: 'e', en: 'walk', jaMain: '歩く', pos: 'verb' }),
    ];
    const index = buildIndex(words);
    const result = generateDistractors(words[0], index, 3, seededRng(3));
    expect(result.map((w) => w.jaMain)).not.toContain('〜をする');
    expect(new Set(result.map((w) => w.jaMain)).size).toBe(3); // 選択肢どうしも重複しない
  });

  it('同じ単元・同じ品詞の語が最優先で選ばれる', () => {
    const sameUnitSamePos = Array.from({ length: 5 }, (_, i) =>
      makeWord({ id: `same${i}`, unit: 'Unit 3', pos: 'verb', jaMain: `動詞${i}`, en: `verb${i}` }),
    );
    const others = Array.from({ length: 30 }, (_, i) =>
      makeWord({ id: `other${i}`, unit: 'Unit 9', pos: 'noun', jaMain: `名詞${i}`, en: `noun${i}` }),
    );
    const index = buildIndex([...sameUnitSamePos, ...others]);
    const result = generateDistractors(sameUnitSamePos[0], index, 3, seededRng(4));
    for (const w of result) {
      expect(w.unit).toBe('Unit 3');
      expect(w.pos).toBe('verb');
    }
  });

  it('同じ単元に候補が足りないときは条件を緩めて必ず3つ埋める', () => {
    const words = [
      makeWord({ id: 'lonely', unit: 'Unit 8', pos: 'adverb', jaMain: 'とても', en: 'very' }),
      ...Array.from({ length: 6 }, (_, i) =>
        makeWord({ id: `n${i}`, unit: 'Unit 1', pos: 'noun', jaMain: `もの${i}`, en: `thing${i}` }),
      ),
    ];
    const index = buildIndex(words);
    const result = generateDistractors(words[0], index, 3, seededRng(5));
    expect(result).toHaveLength(3);
  });

  it('綴りが似ている語が候補に入る（though / thought / through）', () => {
    const target = makeWord({ id: 't1', en: 'though', jaMain: 'だけれども', pos: 'function', unit: 'Unit 5' });
    const similar = [
      makeWord({ id: 't2', en: 'thought', jaMain: '考え', pos: 'noun', unit: 'Unit 6' }),
      makeWord({ id: 't3', en: 'through', jaMain: '〜を通って', pos: 'function', unit: 'Unit 7' }),
    ];
    // 同じ単元・同じ品詞・同じ難易度の候補は用意しない
    const index = buildIndex([target, ...similar]);
    const result = generateDistractors(target, index, 2, seededRng(6));
    const ids = result.map((w) => w.id).sort();
    expect(ids).toEqual(['t2', 't3']);
  });

  it('候補が足りないときは3つ未満でも落ちない', () => {
    const words = [
      makeWord({ id: 'only1', jaMain: 'ひとつめ' }),
      makeWord({ id: 'only2', jaMain: 'ふたつめ' }),
    ];
    const index = buildIndex(words);
    const result = generateDistractors(words[0], index, 3, seededRng(8));
    expect(result.length).toBeLessThanOrEqual(3);
    expect(result.map((w) => w.jaMain)).not.toContain('ひとつめ');
  });
});

describe('buildChoices（4択の組み立て）', () => {
  it('正解を必ず含み、重複がない', () => {
    const words = Array.from({ length: 12 }, (_, i) =>
      makeWord({ id: `c${i}`, jaMain: `意味${i}`, en: `en${i}` }),
    );
    const index = buildIndex(words);
    const choices = buildChoices(words[2], index, seededRng(9));
    expect(choices).toContain(words[2].jaMain);
    expect(choices).toHaveLength(4);
    expect(new Set(choices).size).toBe(4);
  });

  it('並び順は毎回同じにならない（シャッフルされる）', () => {
    const words = Array.from({ length: 12 }, (_, i) =>
      makeWord({ id: `s${i}`, jaMain: `いみ${i}`, en: `w${i}` }),
    );
    const index = buildIndex(words);
    const patterns = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      patterns.add(buildChoices(words[0], index, seededRng(seed)).join(','));
    }
    expect(patterns.size).toBeGreaterThan(1);
  });

  it('乱数を固定すれば毎回同じ結果になる（テストの再現性）', () => {
    const words = Array.from({ length: 12 }, (_, i) => makeWord({ id: `r${i}`, jaMain: `w${i}` }));
    const index = buildIndex(words);
    const a = buildChoices(words[0], index, seededRng(42));
    const b = buildChoices(words[0], index, seededRng(42));
    expect(a).toEqual(b);
  });
});
