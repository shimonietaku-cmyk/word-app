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
  dailyNewLimit: number; // 15 / 20 / 25
  sessionSize: number; // 10 / 15 / 20
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

export interface TestMode {
  active: boolean;
  units: string[];
  testDate: string; // "2026-08-20"
}

export interface Store {
  version: 1;
  cards: Record<string, CardState>;
  streak: StreakState;
  settings: Settings;
  history: HistoryEntry[];
  testMode: TestMode | null;
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
