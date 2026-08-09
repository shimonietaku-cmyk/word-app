// 4択の「誤選択肢（まちがいの選択肢）」を作る。
//
// ここがこのアプリで最も大事な部分。
// でたらめな選択肢だと当てずっぽうで正解できてしまい、覚えたことにならない。
// 「同じ単元の同じ品詞」「綴りが似ている」など、わざと紛らわしいものを選ぶことで、
// 「なぜ他は違うのか」まで思い出すことになり、記憶に残りやすくなる。

import type { Word } from '../types';
import type { WordIndex } from './words';
import { unitKey } from './words';
import { editDistance } from './judge';
import { shuffle } from './random';

/** 選ぶ候補を集めていくための入れ物。日本語訳の重複をここで弾く */
class Picker {
  private readonly chosen: Word[] = [];
  private readonly usedJa = new Set<string>();

  constructor(
    private readonly target: Word,
    private readonly limit: number,
  ) {
    // 正解と同じ日本語訳の語は選択肢に入れない（play のように同じ訳の語が複数あるため）
    this.usedJa.add(target.jaMain);
  }

  get full(): boolean {
    return this.chosen.length >= this.limit;
  }

  get items(): Word[] {
    return this.chosen;
  }

  /** 候補リストから、条件に合うものを順に足していく */
  add(candidates: Word[] | undefined, rng: () => number): void {
    if (!candidates || this.full) return;
    for (const w of shuffle(candidates, rng)) {
      if (this.full) return;
      if (w.id === this.target.id) continue;
      if (this.usedJa.has(w.jaMain)) continue;
      this.usedJa.add(w.jaMain);
      this.chosen.push(w);
    }
  }
}

/**
 * 誤選択肢を3つ選ぶ。優先順位は上から順に：
 *  1. 同じ品詞かつ同じ単元（いちばん紛らわしい）
 *  2. 同じ品詞かつ同じ難易度
 *  3. 綴りが似ている（編集距離3以内、または先頭2文字が一致）
 *  4. 意味カテゴリが近い（jaMain の末尾1文字が一致）
 *  5. 足りなければ同じ学年からランダム、それでも足りなければ全体からランダム
 */
export function generateDistractors(
  target: Word,
  index: WordIndex,
  count = 3,
  rng: () => number = Math.random,
): Word[] {
  const picker = new Picker(target, count);

  // 1. 同じ品詞 × 同じ単元
  picker.add(index.byPosUnit.get(`${target.pos}|${unitKey(target.grade, target.unit)}`), rng);

  // 2. 同じ品詞 × 同じ難易度
  if (!picker.full) {
    picker.add(index.byPosLevel.get(`${target.pos}|${target.level}`), rng);
  }

  // 3. 綴りが似ている
  if (!picker.full) {
    picker.add(similarSpelling(target, index), rng);
  }

  // 4. 意味カテゴリが近い（「〜な」形容詞同士、「〜する」動詞同士 など）
  if (!picker.full) {
    const tail = target.jaMain.slice(-1);
    if (tail) picker.add(index.byJaTail.get(tail), rng);
  }

  // 5. 同じ学年からランダム
  if (!picker.full) {
    picker.add(index.byGrade.get(target.grade), rng);
  }

  // 6. 最後の保険：全体からランダム（極端に小さい範囲を選んだときのため）
  if (!picker.full) {
    picker.add(index.all, rng);
  }

  return picker.items;
}

/**
 * 綴りが似ている語を集める。
 * 全1,961語と編集距離を計算すると遅いので、
 * 「先頭2文字が同じ」「先頭1文字が同じかつ長さが近い」ものだけに絞ってから計算する。
 */
function similarSpelling(target: Word, index: WordIndex): Word[] {
  const en = target.en.toLowerCase();
  if (en.length < 2) return [];

  const result: Word[] = [];
  const seen = new Set<string>([target.id]);

  // 先頭2文字が一致する語（though / thought / through など）
  for (const w of index.byPrefix2.get(en.slice(0, 2)) ?? []) {
    if (seen.has(w.id)) continue;
    seen.add(w.id);
    result.push(w);
  }

  // 先頭1文字が同じで長さが近い語のうち、編集距離3以内のもの（quiet / quite など）
  for (const w of index.byFirstChar.get(en.slice(0, 1)) ?? []) {
    if (seen.has(w.id)) continue;
    const other = w.en.toLowerCase();
    if (Math.abs(other.length - en.length) > 3) continue;
    if (editDistance(en, other, 3) <= 3) {
      seen.add(w.id);
      result.push(w);
    }
  }

  return result;
}

/**
 * 4択の選択肢（日本語訳）を作る。正解を含めてシャッフル済み。
 * 選択肢が3つ集まらないほど候補が少ない場合でも、必ず正解は含まれる。
 */
export function buildChoices(
  target: Word,
  index: WordIndex,
  rng: () => number = Math.random,
): string[] {
  const distractors = generateDistractors(target, index, 3, rng);
  return shuffle([target.jaMain, ...distractors.map((w) => w.jaMain)], rng);
}
