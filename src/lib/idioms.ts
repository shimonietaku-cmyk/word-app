// 熟語モード。
//
// 単語（word）ではなく熟語（phrase）だけを集めて、短時間で全部を回すための仕組み。
// 単語と熟語では「覚え方」が違うので、出題のしかたも分けている：
//
//   単語 … 綴りと意味の対応を覚える
//   熟語 … かたまりで意味が決まる。とくに前置詞（in / at / for …）を間違えやすく、
//          「文の中でどう使うか」まで見ないと、テストで書けない
//
// そこで4つの形式を用意し、同じ熟語を角度を変えて出す：
//   meaning … 熟語 → 意味（いちばん速い。まずここで顔を覚える）
//   cloze   … 例文の空所に入る熟語を選ぶ（使い方が身につく）
//   slot    … 熟語の一部（多くは前置詞）を選ぶ（テストで点になる部分）
//   reverse … 意味 → 熟語（いちばん難しい。書けるかどうかの手前）
//
// 出す順番は drill.ts と同じ「キュー」方式で、1周のあいだ同じ熟語は二度出ない。
// これで「全部の熟語を必ず1回は見る」が運まかせでなく保証される。

import type {
  DrillStat,
  IdiomEntry,
  IdiomFormat,
  IdiomOptions,
  IdiomQuestion,
  IdiomState,
  Word,
} from '../types';
import type { WordIndex } from './words';
import { unitKey } from './words';
import { buildQueue, emptyStat } from './drill';
import { shuffle } from './random';

/** 例文の空所を表す印。idioms.json の中でもこの文字列を使っている */
export const BLANK = '___';

/**
 * 前置詞・副詞など「熟語のうしろにくっついて意味を変える語」。
 * slot形式で優先的に空所にする（ここがテストで問われるところ）。
 */
const PARTICLES = new Set([
  'about', 'above', 'after', 'against', 'around', 'at', 'away', 'back', 'because', 'before',
  'by', 'down', 'for', 'from', 'in', 'into', 'like', 'of', 'off', 'on', 'out', 'over',
  'through', 'to', 'up', 'with', 'without',
]);

/** 空所にしても学習にならない語（冠詞や記号など） */
const NEVER_BLANK = new Set(['a', 'an', 'the', '〜', '-ing', "one's", 'and', 'or']);

/** 素直な英単語だけを空所の候補にする（[]() ? などを含む見出しは避ける） */
const PLAIN_WORD = /^[A-Za-z][A-Za-z'-]*$/;

export interface IdiomIndex {
  /** idioms.json の全件（教科書順） */
  all: IdiomEntry[];
  byId: Map<string, IdiomEntry>;
  /** 見出しの1語目 → 熟語（get up / get off / get to … をまとめて引くため） */
  byFirstWord: Map<string, IdiomEntry[]>;
  /** 学年 → 熟語 */
  byGrade: Map<number, IdiomEntry[]>;
  /** 単元（学年つき） → 熟語 */
  byUnit: Map<string, IdiomEntry[]>;
  /** 熟語ID → その熟語の Word（意味の表示に使う） */
  wordOf: Map<string, Word>;
  /** 見出しの集合。slot形式で「別の熟語になってしまう選択肢」を弾くのに使う */
  headings: Set<string>;
  /** slot形式の誤選択肢に使う前置詞の一覧 */
  particles: string[];
  /** 熟語の1語目の一覧（多くは動詞）。slot形式で動詞を選ばせるときに使う */
  firstWords: string[];
}

/** public/data/idioms.json を読み込む */
export async function loadIdioms(baseUrl: string): Promise<IdiomEntry[]> {
  const res = await fetch(`${baseUrl}data/idioms.json`);
  if (!res.ok) throw new Error(`熟語データを読み込めませんでした (${res.status})`);
  const data = (await res.json()) as IdiomEntry[];
  if (!Array.isArray(data)) throw new Error('熟語データの形式がちがいます');
  return data;
}

/**
 * 索引をつくる。
 * words.json に無い熟語（データを差し替えたときなど）はここで落とすので、
 * 以降の画面では「必ず Word がある」前提で書ける。
 */
export function buildIdiomIndex(entries: IdiomEntry[], words: WordIndex): IdiomIndex {
  const index: IdiomIndex = {
    all: [],
    byId: new Map(),
    byFirstWord: new Map(),
    byGrade: new Map(),
    byUnit: new Map(),
    wordOf: new Map(),
    headings: new Set(),
    particles: [],
    firstWords: [],
  };

  const particles = new Set<string>();
  const firstWords = new Set<string>();

  for (const e of entries) {
    const word = words.byId.get(e.id);
    if (!word) continue;

    index.all.push(e);
    index.byId.set(e.id, e);
    index.wordOf.set(e.id, word);
    index.headings.add(normalizeHeading(e.en));

    const head = tokens(e.en)[0];
    const first = head?.toLowerCase();
    if (first) {
      const list = index.byFirstWord.get(first);
      if (list) list.push(e);
      else index.byFirstWord.set(first, [e]);
      // 誤選択肢の材料は熟語からだけ集める。
      // 複合語（arm wrestling / curry and rice）の語が混ざると、
      // 明らかに文脈に合わないので消去法で解けてしまう
      if (e.kind === 'idiom' && isContentWord(head)) firstWords.add(head);
    }

    const byGrade = index.byGrade.get(word.grade);
    if (byGrade) byGrade.push(e);
    else index.byGrade.set(word.grade, [e]);

    const unit = unitKey(word.grade, word.unit);
    const byUnit = index.byUnit.get(unit);
    if (byUnit) byUnit.push(e);
    else index.byUnit.set(unit, [e]);

    for (const t of tokens(e.en)) {
      const low = t.toLowerCase();
      if (PARTICLES.has(low)) particles.add(low);
    }
  }

  index.particles = [...particles];
  index.firstWords = [...firstWords];
  return index;
}

export function defaultIdiomOptions(): IdiomOptions {
  // 最初は「熟語だけ・両学年・おまかせ」。まずは全部を一通り見るのが目的なので範囲は絞らない
  return { grades: [1, 2], includeCompound: false, mode: 'auto' };
}

/** 設定にあてはまる熟語を、教科書順のまま返す */
export function entriesFor(index: IdiomIndex, options: IdiomOptions): IdiomEntry[] {
  const grades = options.grades.length > 0 ? options.grades : [1, 2];
  return index.all.filter((e) => {
    const word = index.wordOf.get(e.id);
    if (!word || !grades.includes(word.grade)) return false;
    if (!options.includeCompound && e.kind === 'compound') return false;
    return true;
  });
}

// ───────────────────────────────────────────────
// 周回の管理（drill.ts と同じ考え方）
// ───────────────────────────────────────────────

/** 熟語モードを始める（または設定を変える）。前の成績は対象に残るぶんだけ引き継ぐ */
export function startIdioms(
  index: IdiomIndex,
  options: IdiomOptions,
  previous: IdiomState | null = null,
  rng: () => number = Math.random,
): IdiomState {
  const list = entriesFor(index, options);

  // 設定を変えていないなら、途中経過をそのまま残す
  if (previous && !previous.wrongOnly && previous.queue.length > 0 && sameOptions(previous.options, options)) {
    return previous;
  }

  const stats: Record<string, DrillStat> = {};
  for (const e of list) {
    const carried = previous?.stats[e.id];
    if (carried) stats[e.id] = carried;
  }

  const queue = buildQueue(list, stats, 1, rng);
  return { options, round: 1, queue, roundTotal: queue.length, stats, wrongOnly: false };
}

export function sameOptions(a: IdiomOptions, b: IdiomOptions): boolean {
  return (
    a.mode === b.mode &&
    a.includeCompound === b.includeCompound &&
    a.grades.length === b.grades.length &&
    a.grades.every((g) => b.grades.includes(g))
  );
}

export function idiomStatOf(state: IdiomState | null, id: string): DrillStat {
  return state?.stats[id] ?? emptyStat();
}

/** 1問ぶんの結果を反映する（元の状態は変更しない） */
export function recordIdiomAnswer(state: IdiomState, id: string, correct: boolean): IdiomState {
  const prev = state.stats[id] ?? emptyStat();
  const stat: DrillStat = {
    asked: prev.asked + 1,
    correct: prev.correct + (correct ? 1 : 0),
    wrong: prev.wrong + (correct ? 0 : 1),
    streak: correct ? prev.streak + 1 : 0,
    last: correct ? 'correct' : 'wrong',
  };

  const at = state.queue.indexOf(id);
  const queue = at >= 0 ? [...state.queue.slice(0, at), ...state.queue.slice(at + 1)] : state.queue;

  return { ...state, queue, stats: { ...state.stats, [id]: stat } };
}

export function answeredInIdiomRound(state: IdiomState): number {
  return Math.max(0, state.roundTotal - state.queue.length);
}

/** 次の周に入る。間違えた熟語ほど多く出る */
export function nextIdiomRound(
  index: IdiomIndex,
  state: IdiomState,
  rng: () => number = Math.random,
): IdiomState {
  const list = entriesFor(index, state.options);
  const round = state.wrongOnly ? state.round : state.round + 1;
  const queue = buildQueue(list, state.stats, round, rng);
  return { ...state, round, queue, roundTotal: queue.length, wrongOnly: false };
}

/** まちがえた熟語だけをもう一度出す周（周回数には数えない） */
export function idiomWrongOnlyRound(
  index: IdiomIndex,
  state: IdiomState,
  ids?: string[],
  rng: () => number = Math.random,
): IdiomState {
  const inScope = new Set(entriesFor(index, state.options).map((e) => e.id));
  const targets =
    ids && ids.length > 0
      ? ids.filter((id) => inScope.has(id))
      : [...inScope].filter((id) => state.stats[id]?.last === 'wrong');
  const queue = shuffle(targets, rng);
  return { ...state, queue, roundTotal: queue.length, wrongOnly: true };
}

export interface IdiomSummary {
  total: number;
  seen: number;
  untouched: number;
  correctNow: number;
  wrongNow: number;
  /** 2回以上続けて正解できている（仕上がった）熟語の数 */
  solid: number;
  accuracy: number;
}

export function summarizeIdioms(index: IdiomIndex, state: IdiomState | null): IdiomSummary {
  const empty: IdiomSummary = {
    total: 0,
    seen: 0,
    untouched: 0,
    correctNow: 0,
    wrongNow: 0,
    solid: 0,
    accuracy: 0,
  };
  if (!state) return empty;

  const list = entriesFor(index, state.options);
  let seen = 0;
  let correctNow = 0;
  let wrongNow = 0;
  let solid = 0;
  let asked = 0;
  let correct = 0;

  for (const e of list) {
    const s = state.stats[e.id];
    if (!s || s.asked === 0) continue;
    seen += 1;
    asked += s.asked;
    correct += s.correct;
    if (s.last === 'correct') correctNow += 1;
    else wrongNow += 1;
    if (s.streak >= 2) solid += 1;
  }

  return {
    total: list.length,
    seen,
    untouched: list.length - seen,
    correctNow,
    wrongNow,
    solid,
    accuracy: asked === 0 ? 0 : correct / asked,
  };
}

// ───────────────────────────────────────────────
// 出題づくり
// ───────────────────────────────────────────────

/** 「おまかせ」で使う出題形式の並び。正解を重ねるほど難しくなる */
export const AUTO_ORDER: IdiomFormat[] = ['meaning', 'cloze', 'slot', 'reverse'];

/** その熟語を今回どの形式で出すか決める */
export function formatFor(stat: DrillStat, mode: IdiomOptions['mode']): IdiomFormat {
  if (mode !== 'auto') return mode;
  return AUTO_ORDER[Math.min(stat.streak, AUTO_ORDER.length - 1)];
}

/** 1問ぶんを組み立てる。slot が作れない見出しは cloze に落とす */
export function makeIdiomQuestion(
  entry: IdiomEntry,
  index: IdiomIndex,
  format: IdiomFormat,
  rng: () => number = Math.random,
): IdiomQuestion {
  const word = index.wordOf.get(entry.id)!;
  const base = { entry, word };

  if (format === 'slot') {
    const plan = slotPlanFor(entry, index, rng);
    if (plan) {
      return {
        ...base,
        format: 'slot',
        prompt: plan.prompt,
        hint: word.jaMain,
        choices: shuffle([plan.answer, ...plan.distractors], rng),
        answer: plan.answer,
        filled: entry.en,
        speech: speakable(entry.en),
      };
    }
    format = 'cloze'; // 空所にできる語が無い見出し（"the U.K." など）
  }

  if (format === 'cloze') {
    const others = pickEntries(entry, index, 3, rng);
    return {
      ...base,
      format: 'cloze',
      prompt: entry.q,
      hint: entry.ja,
      choices: shuffle([entry.en, ...others.map((e) => e.en)], rng),
      answer: entry.en,
      filled: fillBlanks(entry),
      speech: speakable(fillBlanks(entry)),
    };
  }

  if (format === 'reverse') {
    const others = pickEntries(entry, index, 3, rng);
    return {
      ...base,
      format: 'reverse',
      prompt: word.jaMain,
      choices: shuffle([entry.en, ...others.map((e) => e.en)], rng),
      answer: entry.en,
      speech: speakable(entry.en),
    };
  }

  const others = pickEntries(entry, index, 3, rng);
  return {
    ...base,
    format: 'meaning',
    prompt: entry.en,
    choices: shuffle([word.jaMain, ...others.map((e) => index.wordOf.get(e.id)!.jaMain)], rng),
    answer: word.jaMain,
    speech: speakable(entry.en),
  };
}

/**
 * 誤選択肢に使う熟語を選ぶ。
 * いちばん紛らわしいのは「1語目が同じ熟語」（get up / get off / get to）なので、そこから取る。
 *
 * 見出しと意味の両方で重複を弾く。とくに意味が重なる熟語（take a picture と take a photo）は、
 * 例文の空所にどちらを入れても正しく読めてしまうため、誤選択肢にしてはいけない。
 */
function pickEntries(
  target: IdiomEntry,
  index: IdiomIndex,
  count: number,
  rng: () => number,
): IdiomEntry[] {
  const targetWord = index.wordOf.get(target.id)!;
  const chosen: IdiomEntry[] = [];
  const usedEn = new Set([normalizeHeading(target.en)]);
  const usedJa = new Set([targetWord.jaMain]);

  const accept = (e: IdiomEntry): boolean => {
    if (e.id === target.id) return false;
    const w = index.wordOf.get(e.id);
    if (!w) return false;
    if (usedEn.has(normalizeHeading(e.en))) return false;
    if (usedJa.has(w.jaMain)) return false;
    // 意味が包含関係にある熟語（「少し」と「ほんの少し」など）は、
    // どちらを入れても正しく読めてしまうので誤選択肢にしない
    if (overlaps(w.jaMain, targetWord.jaMain)) return false;
    usedEn.add(normalizeHeading(e.en));
    usedJa.add(w.jaMain);
    chosen.push(e);
    return true;
  };

  const addFrom = (candidates: IdiomEntry[] | undefined) => {
    if (!candidates) return;
    for (const e of shuffle(candidates, rng)) {
      if (chosen.length >= count) return;
      accept(e);
    }
  };

  // 1. 1語目が同じ（get up / get off / get to …）
  addFrom(index.byFirstWord.get(tokens(target.en)[0]?.toLowerCase() ?? ''));
  // 2. 同じ単元（同じころに習った熟語なので、テストでも並んで出る）
  if (chosen.length < count) {
    addFrom(index.byUnit.get(unitKey(targetWord.grade, targetWord.unit)));
  }
  // 3. 同じ学年
  if (chosen.length < count) addFrom(index.byGrade.get(targetWord.grade));
  // 4. それでも足りなければ全体から
  if (chosen.length < count) addFrom(index.all);

  return chosen;
}

interface SlotPlan {
  prompt: string;
  answer: string;
  distractors: string[];
}

/**
 * 見出しの一部を空所にする計画を立てる。
 *
 * どこを空所にするかで、問題の値打ちが決まる：
 *  ・前置詞があればそこ（be good ___ 〜）。テストで問われるのはほぼここ
 *  ・無ければ1語目の動詞（___ a picture）。take / have / make の使い分けになる
 *
 * 誤選択肢も、それぞれ「他の熟語で実際に使われている前置詞」「他の熟語の1語目」から取る。
 * 熟語全体から適当に語を拾うと brass や goldfish が並んでしまい、消去法で解けてしまう。
 */
export function slotPlanFor(
  entry: IdiomEntry,
  index: IdiomIndex,
  rng: () => number = Math.random,
): SlotPlan | null {
  const parts = tokens(entry.en);
  const candidates = parts
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => PLAIN_WORD.test(t) && !NEVER_BLANK.has(t.toLowerCase()));
  if (candidates.length === 0) return null;

  const particle = [...candidates].reverse().find(({ t }) => PARTICLES.has(t.toLowerCase()));
  const target = particle ?? candidates[0];

  const answer = target.t;
  const isParticle = PARTICLES.has(answer.toLowerCase());
  const prompt = parts.map((t, i) => (i === target.i ? BLANK : t)).join(' ');

  const inPrompt = new Set(parts.map((t) => t.toLowerCase()));
  const used = new Set([answer.toLowerCase()]);
  const distractors: string[] = [];

  const addFrom = (pool: string[]) => {
    for (const cand of shuffle(pool, rng)) {
      if (distractors.length >= 3) return;
      const low = cand.toLowerCase();
      if (used.has(low) || inPrompt.has(low)) continue;
      // 入れ替えると別の熟語そのものになってしまう語は使わない（take a picture / take a photo）
      const swapped = normalizeHeading(parts.map((t, i) => (i === target.i ? cand : t)).join(' '));
      if (index.headings.has(swapped)) continue;
      used.add(low);
      distractors.push(cand);
    }
  };

  if (isParticle) {
    addFrom(index.particles);
  } else {
    // 1語目が同じ熟語の中の語（take a bath → picture / rest）をいちばん先に使う
    addFrom(sameShapeWords(entry, index));
    // 次に、他の熟語の1語目（動詞が並ぶ）
    if (distractors.length < 3) addFrom(index.firstWords);
    // 最後の保険
    if (distractors.length < 3) addFrom(contentWords(index));
  }

  if (distractors.length < 3) return null;
  return { prompt, answer, distractors };
}

/** 1語目が同じ熟語から、内容語を集める（take a picture → bath / rest / break） */
function sameShapeWords(entry: IdiomEntry, index: IdiomIndex): string[] {
  const first = tokens(entry.en)[0]?.toLowerCase() ?? '';
  const out: string[] = [];
  for (const e of index.byFirstWord.get(first) ?? []) {
    if (e.id === entry.id) continue;
    for (const t of tokens(e.en)) {
      if (isContentWord(t)) out.push(t);
    }
  }
  return out;
}

/** 誤選択肢の最後の保険。熟語（複合語は除く）から内容語を集める */
function contentWords(index: IdiomIndex): string[] {
  const out: string[] = [];
  for (const e of index.all) {
    if (e.kind !== 'idiom') continue;
    for (const t of tokens(e.en)) {
      if (isContentWord(t)) out.push(t);
    }
  }
  return out;
}

function isContentWord(t: string): boolean {
  const low = t.toLowerCase();
  return PLAIN_WORD.test(t) && !NEVER_BLANK.has(low) && !PARTICLES.has(low);
}

/** 例文の空所を埋めた文を作る。空所が2つある熟語は "|" 区切りの答えを前から入れる */
export function fillBlanks(entry: IdiomEntry): string {
  const fills = entry.a.split('|');
  let i = 0;
  return entry.q.split(BLANK).reduce((acc, part, at) => {
    if (at === 0) return part;
    return acc + (fills[i++] ?? '') + part;
  }, '');
}

/** 空所の数（画面で空所を描き分けるのに使う） */
export function blankCount(text: string): number {
  return text.split(BLANK).length - 1;
}

/** 読み上げ用に、見出しから 〜 や記号を落とす */
export function speakable(text: string): string {
  return text
    .replace(/〜/g, ' ')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\(([^)]*)\)/g, '$1')
    .replace(/-ing/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(en: string): string[] {
  return en.split(/\s+/).filter(Boolean);
}

/** 見出しの表記ゆれを吸収して比べるための形 */
function normalizeHeading(en: string): string {
  return en.toLowerCase().replace(/[〜.,]/g, '').replace(/\s+/g, ' ').trim();
}

/** 一方がもう一方を含む意味かどうか（「少し」と「ほんの少し」など） */
function overlaps(a: string, b: string): boolean {
  if (a.length < 2 || b.length < 2) return false;
  return a.includes(b) || b.includes(a);
}
