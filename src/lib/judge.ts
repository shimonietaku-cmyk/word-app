// 綴りの採点。
// 教材データには "look for 〜" や "[be] going to" のような表記が混ざるため、
// 比べる前に「正規化（表記のゆれをそろえること）」をしてから比較する。

import { shuffle } from './random';

/**
 * 比較用に文字列をそろえる。
 * 1. 小文字化
 * 2. 〜 / ~ と [ ] ( ) を中身ごと除去
 * 3. . , ! ? ' ’ を除去
 * 4. 連続する空白を1つにして前後を除去
 */
export function normalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/[[［]([^\]］]*)[\]］]/g, ' ') // [ ... ] を中身ごと除去
    .replace(/[(（]([^)）]*)[)）]/g, ' ') // ( ... ) を中身ごと除去
    .replace(/[~〜]/g, ' ')
    .replace(/[.,!?'’‘"“”]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 編集距離（レーベンシュタイン距離）。
 * 「何文字直せば同じになるか」の数。beautiful と beatiful は 1。
 * limit を超えることが分かった時点で打ち切って速く返す。
 */
export function editDistance(a: string, b: string, limit = Infinity): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > limit) return limit + 1; // これ以上は縮まらないので打ち切り
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }
  return prev[b.length];
}

export type JudgeResult = 'correct' | 'close' | 'wrong';

export interface JudgeOutcome {
  result: JudgeResult;
  /** 正規化後の正解（「おしい」のときに正しい綴りを見せるために使う） */
  normalizedAnswer: string;
  normalizedInput: string;
  distance: number;
}

/**
 * 入力を採点する。
 * - 完全一致 → correct
 * - 編集距離1以内 → close（「おしい！」。正解にはしない）
 * - それ以外 → wrong
 */
export function judge(input: string, answer: string): JudgeOutcome {
  const normalizedInput = normalize(input);
  const normalizedAnswer = normalize(answer);

  if (normalizedInput.length === 0) {
    return { result: 'wrong', normalizedAnswer, normalizedInput, distance: normalizedAnswer.length };
  }
  if (normalizedInput === normalizedAnswer) {
    return { result: 'correct', normalizedAnswer, normalizedInput, distance: 0 };
  }
  const distance = editDistance(normalizedInput, normalizedAnswer, 2);
  if (distance <= 1) {
    return { result: 'close', normalizedAnswer, normalizedInput, distance };
  }
  return { result: 'wrong', normalizedAnswer, normalizedInput, distance };
}

/**
 * Stage3の並べ替え用に、正解を「並べるパーツ」に分解する。
 * - 1語（スペースなし）→ 1文字ずつ
 * - 連語（スペースあり）→ 単語のかたまりごと
 *   （"look for 〜" を1文字ずつ並べるとタップ回数が多すぎて負担が大きいため）
 */
export function splitForArrange(answer: string): { pieces: string[]; mode: 'char' | 'word' } {
  const n = normalize(answer);
  if (n.includes(' ')) {
    return { pieces: n.split(' ').filter(Boolean), mode: 'word' };
  }
  return { pieces: n.split(''), mode: 'char' };
}

/** 並べ替えパネルに混ぜるダミー（おとり）を2つ作る */
export function makeArrangePieces(
  answer: string,
  rng: () => number = Math.random,
): { pieces: string[]; mode: 'char' | 'word'; answerPieces: string[] } {
  const { pieces: answerPieces, mode } = splitForArrange(answer);
  const dummies: string[] = [];

  if (mode === 'char') {
    // 正解に含まれない英字から2つ選ぶ
    const used = new Set(answerPieces);
    const alphabet = 'abcdefghijklmnopqrstuvwxyz'.split('').filter((c) => !used.has(c));
    for (let i = 0; i < 2 && alphabet.length > 0; i++) {
      const idx = Math.floor(rng() * alphabet.length);
      dummies.push(alphabet.splice(idx, 1)[0]);
    }
  } else {
    // 連語のときは、よく使う短い語をダミーにする
    const common = ['the', 'a', 'to', 'of', 'in', 'on', 'at', 'is', 'it', 'up'];
    const used = new Set(answerPieces);
    const pool = common.filter((c) => !used.has(c));
    for (let i = 0; i < 2 && pool.length > 0; i++) {
      const idx = Math.floor(rng() * pool.length);
      dummies.push(pool.splice(idx, 1)[0]);
    }
  }

  const pieces = shuffle([...answerPieces, ...dummies], rng);
  return { pieces, mode, answerPieces };
}
