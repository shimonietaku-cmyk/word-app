// アプリ全体で使う型（データの形）の定義。
// TypeScript の「型」は、値の形をあらかじめ決めておく仕組み。
// 形が違うものを入れると、実行前にエディタとビルドが教えてくれる。

import type { Card as FSRSCard } from 'ts-fsrs';

export type { FSRSCard };

/** 単語の種類 */
export type WordType = 'word' | 'phrase' | 'expression' | 'form';

/** 品詞（日本語訳から自動判定したもの。完璧ではない） */
export type Pos =
  | 'noun'
  | 'verb'
  | 'adjective'
  | 'adverb'
  | 'function'
  | 'number'
  | 'phrase'
  | 'expression'
  | 'form';

/** words.json の1件ぶん */
export interface Word {
  id: string; // "g2-unit-1-0013"
  grade: 1 | 2;
  unit: string; // "Unit 1" / "Daily Life Scene 1" など
  part: number | null;
  section: 'unit' | 'dls' | 'grammar' | 'read' | 'sounds' | 'world' | 'ycdi';
  en: string; // "look for 〜" のように 〜 [] () を含みうる
  ja: string[]; // 訳の配列
  jaMain: string; // 4択の選択肢に使う代表訳
  type: WordType;
  pos: Pos;
  level: 1 | 2 | 3;
  note: string;
  srcPage: string;
}

/** 出題の段階。1:受容(4択) 2:想起(スワイプ) 3:産出(並べ替え/入力) */
export type Stage = 1 | 2 | 3;

/**
 * 1単語ぶんの学習状態。
 * fsrs の日付は localStorage に入れる都合で ISO文字列（"2026-08-08T..."）として持つ。
 */
export interface StoredFSRSCard {
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  state: number; // 0:New 1:Learning 2:Review 3:Relearning
  last_review?: string;
}

export interface CardState {
  stage: Stage;
  fsrs: StoredFSRSCard;
  correct: number;
  wrong: number;
  consecutiveWrong: number;
  /** 連続正解数（Stage1→2の昇格判定に使う） */
  consecutiveCorrect: number;
  fastCorrect: number; // 2秒以内に正解した回数（stage昇格の判定に使う）
  /** Stage3の並べ替えに成功した回数（2回でキーボード入力に切り替わる） */
  arrangeSuccess: number;
  lastSeen: string; // ISO文字列
  leech: boolean;
}

export interface StreakState {
  current: number;
  best: number;
  lastStudyDate: string; // "2026-08-08" 形式
  freezes: number;
  days: string[]; // 学習した日の一覧（"2026-08-08"）
  /** 最後にフリーズを付与した日（週1回付与の判定に使う） */
  lastFreezeGrantDate: string;
}

export interface Settings {
  sessionSize: number; // 10 / 15 / 20（毎日モードの1回の問題数）
  scope: { grades: number[]; units: string[] };
  audio: boolean;
  darkMode: 'auto' | 'light' | 'dark';
  /** 復習の多さ 0.85 / 0.90 / 0.95 */
  requestRetention: number;
}

export interface HistoryEntry {
  date: string; // "2026-08-08"
  answered: number;
  correct: number;
  newLearned: number;
}

// ───────────────────────────────────────────────
// テスト対策ドリル
//
// 毎日モード（FSRSで忘れかけた頃に出す方式）とは別の仕組み。
// テスト範囲を単語番号で指定し、範囲内を1周ずつ確実に回す。
// ───────────────────────────────────────────────

/**
 * 出題範囲。番号は「学年ごとの通し番号」で、1年は1〜1115、2年は1〜846。
 * words.json の並び順（＝教科書順）の何番目か、を表す。
 */
export interface DrillRange {
  grade: 1 | 2;
  /** 開始番号（1始まり・この番号を含む） */
  from: number;
  /** 終了番号（この番号を含む） */
  to: number;
}

/** よく使う範囲の保存（例：「Unit 5 テスト」1〜50） */
export interface DrillPreset {
  id: string;
  name: string;
  range: DrillRange;
}

/** ドリルでの1単語ぶんの成績（FSRSとは別に、範囲内の進み具合を見るために持つ） */
export interface DrillStat {
  asked: number;
  correct: number;
  wrong: number;
  /** 連続正解数 */
  streak: number;
  /** 直近の結果。未出題は null */
  last: 'correct' | 'wrong' | null;
}

export interface DrillState {
  range: DrillRange;
  /** 何周目か（1始まり） */
  round: number;
  /** この周の残りキュー（単語ID。先頭から出す） */
  queue: string[];
  /** この周のはじめのキュー長（進捗表示の分母） */
  roundTotal: number;
  /** 範囲内の単語ごとの成績 */
  stats: Record<string, DrillStat>;
  /** 「まちがえた単語だけ」の特別な周かどうか（周回数に数えない） */
  wrongOnly: boolean;
}

export interface DrillStore {
  /** 進行中のドリル。範囲未設定なら null */
  current: DrillState | null;
  presets: DrillPreset[];
}

// ───────────────────────────────────────────────
// 熟語モード
//
// 熟語（look for 〜 / get up など）だけを集めて、短い例文の穴あきや
// 前置詞の選択で高速に回す仕組み。範囲は番号ではなく「学年」で決める。
// ───────────────────────────────────────────────

/** 熟語1件ぶんの例文データ（public/data/idioms.json）。id は words.json と共通 */
export interface IdiomEntry {
  id: string;
  /** 見出しの形。"look for 〜" のように 〜 を含みうる */
  en: string;
  /** idiom＝熟語（うしろに前置詞が続くものなど） / compound＝2語で1つの名詞 */
  kind: 'idiom' | 'compound';
  /** 例文。空所は "___"。空所が2つの熟語もある（not 〜 very much など） */
  q: string;
  /** 空所に実際に入る形。空所が複数なら "|" 区切りで前から順に */
  a: string;
  /** 例文の和訳 */
  ja: string;
}

/**
 * 出題形式。
 *  meaning … 熟語を見て意味を選ぶ（いちばん速い）
 *  cloze   … 例文の空所に入る熟語を選ぶ
 *  slot    … 熟語の一部（多くは前置詞）を選ぶ
 *  reverse … 意味を見て熟語を選ぶ（いちばん難しい）
 */
export type IdiomFormat = 'meaning' | 'cloze' | 'slot' | 'reverse';

/** 「おまかせ」は習熟度に応じて上の4つを切り替える */
export type IdiomMode = 'auto' | IdiomFormat;

export interface IdiomOptions {
  /** 対象の学年。空にはできない */
  grades: number[];
  /** 「2語で1つの名詞」（post office など）も混ぜるか */
  includeCompound: boolean;
  mode: IdiomMode;
}

export interface IdiomState {
  options: IdiomOptions;
  /** 何周目か（1始まり） */
  round: number;
  /** この周の残りキュー（熟語ID。先頭から出す） */
  queue: string[];
  roundTotal: number;
  /** 熟語ごとの成績。ドリルと同じ形を使う */
  stats: Record<string, DrillStat>;
  /** 「まちがえた熟語だけ」の特別な周かどうか（周回数に数えない） */
  wrongOnly: boolean;
}

/** 熟語モードの1問 */
export interface IdiomQuestion {
  entry: IdiomEntry;
  word: Word;
  format: IdiomFormat;
  /** 画面に出す問題文。cloze/slot では空所が "___" で入っている */
  prompt: string;
  /** 問題と一緒に見せる日本語（cloze は例文の訳、slot は熟語の意味） */
  hint?: string;
  /** 4つの選択肢（正解を含む・シャッフル済み） */
  choices: string[];
  /** 正解の選択肢 */
  answer: string;
  /** 答え合わせで見せる、空所が埋まった英文（cloze/slot のとき） */
  filled?: string;
  /** 読み上げる英文 */
  speech: string;
}

export interface Store {
  version: 2;
  cards: Record<string, CardState>;
  streak: StreakState;
  settings: Settings;
  history: HistoryEntry[];
  drill: DrillStore;
  /** 熟語モードの進行状況。一度も始めていなければ null */
  idiom: IdiomState | null;
}

/** セッション中の1問 */
export interface Question {
  word: Word;
  stage: Stage;
  /** Stage1のときだけ入る4つの選択肢（正解を含む・シャッフル済み） */
  choices?: string[];
  /** Stage3のとき、並べ替えかキーボード入力か */
  produceMode?: 'arrange' | 'type';
  /** 復習カードか新規カードか（統計用） */
  isNew: boolean;
  /** 最後の再出題ぶん（FSRSと統計に反映しない） */
  isRetry: boolean;
  /** 学年ごとの単語番号（ドリルの画面表示に使う） */
  number?: number;
}

/** 1問に答えた結果 */
export interface AnswerResult {
  wordId: string;
  correct: boolean;
  elapsedMs: number;
  stage: Stage;
  isNew: boolean;
  isRetry: boolean;
}
