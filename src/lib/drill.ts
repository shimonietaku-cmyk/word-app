// テスト対策ドリル。
//
// 毎日モード（FSRS＝忘れかけた頃に出す方式）とは別の仕組み。
// 目的が「学校のテストで点を取ること」なので、考え方をこう変えている：
//
//   毎日モード … 長期記憶のために、間隔を空けて少しずつ
//   ドリル     … テスト範囲を決めて、範囲内を確実に1周ずつ回す
//
// 中核は「キュー（順番待ちの列）」。範囲内の全単語をキューに入れ、
// 使い切るまで補充しない。これにより「1周終わるまで同じ単語は出ない」が
// 運まかせではなく、仕組みとして保証される。

import type { DrillRange, DrillStat, DrillState, Word } from '../types';
import type { WordIndex } from './words';
import { shuffle } from './random';

/** 学年ごとの単語数（範囲入力の上限に使う） */
export function wordCountOf(index: WordIndex, grade: number): number {
  return index.byGrade.get(grade)?.length ?? 0;
}

/** 範囲を、その学年に実在する番号の中に収める */
export function clampRange(index: WordIndex, range: DrillRange): DrillRange {
  const max = wordCountOf(index, range.grade);
  if (max === 0) return { ...range, from: 1, to: 1 };
  const from = Math.min(Math.max(1, Math.round(range.from)), max);
  const to = Math.min(Math.max(from, Math.round(range.to)), max);
  return { grade: range.grade, from, to };
}

/** 範囲に入る単語を、番号順（＝教科書順）で返す */
export function wordsInRange(index: WordIndex, range: DrillRange): Word[] {
  const all = index.byGrade.get(range.grade) ?? [];
  const { from, to } = clampRange(index, range);
  return all.slice(from - 1, to);
}

/** 範囲の語数 */
export function rangeSize(range: DrillRange): number {
  return Math.max(0, range.to - range.from + 1);
}

/** まだ一度も出していない状態の成績 */
export function emptyStat(): DrillStat {
  return { asked: 0, correct: 0, wrong: 0, streak: 0, last: null };
}

export function statOf(state: DrillState | null, wordId: string): DrillStat {
  return state?.stats[wordId] ?? emptyStat();
}

/**
 * その単語を、この周に何回出すか。
 * 1周目は全員1回。2周目以降は、間違えた単語ほど多く出す。
 */
export function copiesFor(stat: DrillStat, round: number): number {
  if (round <= 1) return 1;
  if (stat.asked === 0) return 1; // まだ出していない（範囲を広げた直後など）
  if (stat.streak >= 2) return 1; // 続けて正解できているので通常どおり
  if (stat.last === 'wrong') return 3; // 直前に間違えた → 重点的に
  if (stat.wrong > 0) return 2; // 過去に間違えたことがある
  return 1;
}

/**
 * 出題順を作る。
 *
 * 同じ単語を複数回出すとき（2周目以降）、連続して出ると答えを覚えているだけで
 * 正解できてしまう。そこで周を「区画」に分け、同じ単語の2回目・3回目が
 * 別の区画に入るように配ってから、区画ごとにシャッフルする。
 *
 * id さえあれば使えるので、テスト対策ドリルと熟語モードの両方から呼んでいる。
 */
export function buildQueue(
  words: { id: string }[],
  stats: Record<string, DrillStat>,
  round: number,
  rng: () => number = Math.random,
): string[] {
  const plan = words.map((w) => ({
    id: w.id,
    copies: copiesFor(stats[w.id] ?? emptyStat(), round),
  }));

  const buckets = Math.max(1, ...plan.map((p) => p.copies));
  const lanes: string[][] = Array.from({ length: buckets }, () => []);

  for (const { id, copies } of plan) {
    // copies 個を、buckets 個の区画にできるだけ均等に散らす
    const step = buckets / copies;
    const offset = rng() * step;
    for (let i = 0; i < copies; i++) {
      const lane = Math.floor(offset + i * step) % buckets;
      lanes[lane].push(id);
    }
  }

  return lanes.flatMap((lane) => shuffle(lane, rng));
}

/** 範囲を決めて（または変えて）ドリルを始める。過去の成績は範囲内のぶんだけ引き継ぐ */
export function startDrill(
  index: WordIndex,
  range: DrillRange,
  previous: DrillState | null = null,
  rng: () => number = Math.random,
): DrillState {
  const clamped = clampRange(index, range);
  const words = wordsInRange(index, clamped);

  // 同じ範囲を選び直しただけなら、途中経過をそのまま残す
  const sameRange =
    previous &&
    previous.range.grade === clamped.grade &&
    previous.range.from === clamped.from &&
    previous.range.to === clamped.to;
  if (sameRange && previous && !previous.wrongOnly && previous.queue.length > 0) {
    return previous;
  }

  // 範囲を変えた場合は、範囲内に残る単語の成績だけ引き継ぐ
  const stats: Record<string, DrillStat> = {};
  for (const w of words) {
    const carried = previous?.stats[w.id];
    if (carried) stats[w.id] = carried;
  }

  const queue = buildQueue(words, stats, 1, rng);
  return {
    range: clamped,
    round: 1,
    queue,
    roundTotal: queue.length,
    stats,
    wrongOnly: false,
  };
}

/** 1問ぶんの結果を反映する（元の状態は変更しない） */
export function recordDrillAnswer(
  state: DrillState,
  wordId: string,
  correct: boolean,
): DrillState {
  const prev = state.stats[wordId] ?? emptyStat();
  const stat: DrillStat = {
    asked: prev.asked + 1,
    correct: prev.correct + (correct ? 1 : 0),
    wrong: prev.wrong + (correct ? 0 : 1),
    streak: correct ? prev.streak + 1 : 0,
    last: correct ? 'correct' : 'wrong',
  };

  // キューの先頭からこの単語を1つ取り除く
  const at = state.queue.indexOf(wordId);
  const queue = at >= 0 ? [...state.queue.slice(0, at), ...state.queue.slice(at + 1)] : state.queue;

  return { ...state, queue, stats: { ...state.stats, [wordId]: stat } };
}

/** この周を出し終えたか */
export function isRoundComplete(state: DrillState): boolean {
  return state.queue.length === 0;
}

/** この周で何問終わったか（進捗バーの分子） */
export function answeredInRound(state: DrillState): number {
  return Math.max(0, state.roundTotal - state.queue.length);
}

/** 次の周に入る。間違えた単語の出題回数が増える */
export function nextRound(
  index: WordIndex,
  state: DrillState,
  rng: () => number = Math.random,
): DrillState {
  const words = wordsInRange(index, state.range);
  // 「まちがいだけ」の周は周回数に数えないので、通常の周に戻すときは番号を進めない
  const round = state.wrongOnly ? state.round : state.round + 1;
  const queue = buildQueue(words, state.stats, round, rng);
  return { ...state, round, queue, roundTotal: queue.length, wrongOnly: false };
}

/**
 * まちがえた単語だけを、もう一度出す周を作る。
 *
 * wordIds には「その周でまちがえた単語」を呼び出し側から渡す。
 * 渡さない場合は「最後の解答がまちがいだった単語」を対象にする。
 * ※ 一度まちがえたあと同じ周で正解した単語は後者に含まれないため、
 *   画面のボタンに出す語数と実際の出題数がズレないよう、必ず前者を渡すこと。
 */
export function wrongOnlyRound(
  index: WordIndex,
  state: DrillState,
  wordIds?: string[],
  rng: () => number = Math.random,
): DrillState {
  const inRange = new Set(wordsInRange(index, state.range).map((w) => w.id));
  const targets =
    wordIds && wordIds.length > 0
      ? wordIds.filter((id) => inRange.has(id))
      : [...inRange].filter((id) => state.stats[id]?.last === 'wrong');

  const queue = shuffle(targets, rng);
  return { ...state, queue, roundTotal: queue.length, wrongOnly: true };
}

export interface DrillSummary {
  total: number;
  /** 一度でも出題した語数 */
  seen: number;
  untouched: number;
  correctNow: number;
  wrongNow: number;
  /** 2回以上続けて正解できている語数（仕上がった語） */
  solid: number;
  /** 出題した中での正答率（0〜1）。未出題のみなら 0 */
  accuracy: number;
}

/** 範囲全体の仕上がり具合をまとめる */
export function summarize(index: WordIndex, state: DrillState | null): DrillSummary {
  const empty: DrillSummary = {
    total: 0,
    seen: 0,
    untouched: 0,
    correctNow: 0,
    wrongNow: 0,
    solid: 0,
    accuracy: 0,
  };
  if (!state) return empty;

  const words = wordsInRange(index, state.range);
  let seen = 0;
  let correctNow = 0;
  let wrongNow = 0;
  let solid = 0;
  let asked = 0;
  let correct = 0;

  for (const w of words) {
    const s = state.stats[w.id];
    if (!s || s.asked === 0) continue;
    seen += 1;
    asked += s.asked;
    correct += s.correct;
    if (s.last === 'correct') correctNow += 1;
    else wrongNow += 1;
    if (s.streak >= 2) solid += 1;
  }

  return {
    total: words.length,
    seen,
    untouched: words.length - seen,
    correctNow,
    wrongNow,
    solid,
    accuracy: asked === 0 ? 0 : correct / asked,
  };
}

/** 範囲を「1年 23〜50番」のように表示する */
export function rangeLabel(range: DrillRange): string {
  return `${range.grade}年 ${range.from}〜${range.to}番`;
}

/** プリセットの名前を自動で作る（保存時の初期値） */
export function defaultPresetName(index: WordIndex, range: DrillRange): string {
  const words = wordsInRange(index, range);
  const unit = words[0]?.unit ?? '';
  return unit ? `${unit}（${range.from}〜${range.to}）` : rangeLabel(range);
}
