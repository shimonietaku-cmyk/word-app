// アプリ全体で共有する状態（学習記録・設定・単語データ）を1か所で管理する。
// React の Context という仕組みで、どの画面からでも同じデータを読み書きできるようにしている。

import { createContext, useContext } from 'react';
import type { AnswerResult, Store, Word } from '../types';
import type { WordIndex } from '../lib/words';

export interface AppState {
  /** 読み込み状態 */
  status: 'loading' | 'ready' | 'error';
  error: string;
  /** 単語データと索引 */
  words: Word[];
  index: WordIndex | null;
  /** 学習記録・設定 */
  store: Store;
  /** 読み上げが使える端末か */
  speechAvailable: boolean;
}

export interface AppActions {
  /** 記録を更新して保存する */
  update: (updater: (prev: Store) => Store) => void;
  /** 1問ぶんの解答を記録に反映する（FSRS・Stage・統計） */
  recordAnswer: (result: AnswerResult) => void;
  /** セッション完了時にストリークと履歴を更新する */
  finishSession: (answered: number) => void;
  /** 全消去 */
  resetAll: () => void;
  /** 進捗ファイルの読み込み */
  importFromText: (text: string) => boolean;
}

export const AppContext = createContext<(AppState & AppActions) | null>(null);

export function useApp(): AppState & AppActions {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('AppContext の外で useApp が呼ばれました');
  return ctx;
}

/** 索引は必ずある前提で使いたい画面向けのショートカット */
export function useIndex(): WordIndex {
  const { index } = useApp();
  if (!index) throw new Error('単語データがまだ読み込まれていません');
  return index;
}
