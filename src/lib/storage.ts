// 学習の記録を localStorage（ブラウザの中の保存場所）に読み書きする。
// サーバーは使わないので、記録はすべてこの端末の中だけにある。
// データが壊れていても学習が止まらないよう、読み込みに失敗したら初期状態に戻す。

import type { CardState, Store, Word } from '../types';
import { newStoredCard } from './scheduler';

export const STORAGE_KEY = 'wordclimb.v1';

/** "2026-08-08" 形式の日付文字列（端末のローカル時間で計算する） */
export function dateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** "2026-08-08" を Date に戻す */
export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** 2つの日付キーの日数差（b - a） */
export function diffDays(a: string, b: string): number {
  const ms = parseDateKey(b).getTime() - parseDateKey(a).getTime();
  return Math.round(ms / 86400000);
}

/** 保存データの形式のバージョン。増やしたときは migrate() に移行処理を足すこと */
export const STORE_VERSION = 2;

export function createInitialStore(now: Date = new Date()): Store {
  return {
    version: 2,
    cards: {},
    streak: {
      current: 0,
      best: 0,
      lastStudyDate: '',
      freezes: 0,
      days: [],
      lastFreezeGrantDate: dateKey(now),
    },
    settings: {
      sessionSize: 10,
      scope: { grades: [1, 2], units: [] }, // units が空＝学年まるごと
      audio: true,
      darkMode: 'auto',
      requestRetention: 0.9,
    },
    history: [],
    drill: { current: null, presets: [] },
    idiom: null,
  };
}

/** 新しいカード状態を作る */
export function createCardState(now: Date = new Date()): CardState {
  return {
    stage: 1,
    fsrs: newStoredCard(now),
    correct: 0,
    wrong: 0,
    consecutiveWrong: 0,
    consecutiveCorrect: 0,
    fastCorrect: 0,
    arrangeSuccess: 0,
    lastSeen: '',
    leech: false,
  };
}

/**
 * 保存されたデータを読み込む。
 * 形が壊れていたら初期状態を返す（アプリが起動しなくなるのを防ぐ）。
 * 古いバージョンのデータは migrate() で今の形に変換し、学習記録は引き継ぐ。
 */
export function loadStore(now: Date = new Date()): Store {
  const initial = createInitialStore(now);
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initial;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!isObject(parsed)) return initial;
    const migrated = migrate(parsed);
    if (!migrated) return initial;
    return mergeWithDefaults(migrated, initial);
  } catch {
    return initial;
  }
}

/**
 * 古い保存データを今の形に変換する。対応できない形なら null。
 *
 * version 1 → 2 の変更点：
 *  ・settings.dailyNewLimit（1日の新規上限）を廃止
 *  ・testMode（単元チェックボックス式）を廃止し、drill（番号指定式）に置き換え
 * カード・履歴・ストリークはそのまま引き継ぐので、これまでの学習記録は消えない。
 */
export function migrate(parsed: Record<string, unknown>): Record<string, unknown> | null {
  const version = parsed.version;
  if (version === STORE_VERSION) return parsed;

  if (version === 1) {
    const settings = isObject(parsed.settings) ? { ...parsed.settings } : {};
    delete settings.dailyNewLimit;
    const next: Record<string, unknown> = { ...parsed, version: STORE_VERSION, settings };
    delete next.testMode; // 単元チェックボックス式の旧テストモードは廃止
    return next;
  }

  return null; // 未来のバージョンや不明な形式は読み込まない
}

/** 保存データに足りない項目を初期値で埋める（設定を後から増やしても壊れないように） */
export function mergeWithDefaults(parsed: Partial<Store>, initial: Store): Store {
  const drill = isObject(parsed.drill) ? (parsed.drill as Partial<Store['drill']>) : {};
  return {
    version: STORE_VERSION,
    cards: isObject(parsed.cards) ? (parsed.cards as Record<string, CardState>) : initial.cards,
    streak: { ...initial.streak, ...(isObject(parsed.streak) ? parsed.streak : {}) },
    settings: {
      ...initial.settings,
      ...(isObject(parsed.settings) ? parsed.settings : {}),
      scope: {
        ...initial.settings.scope,
        ...(isObject(parsed.settings?.scope) ? parsed.settings!.scope : {}),
      },
    },
    history: Array.isArray(parsed.history) ? parsed.history : initial.history,
    drill: {
      current: isObject(drill.current) ? (drill.current as Store['drill']['current']) : null,
      presets: Array.isArray(drill.presets) ? drill.presets : [],
    },
    // 熟語モードは後から足した機能なので、古い保存データには入っていない
    idiom: isObject(parsed.idiom) ? (parsed.idiom as Store['idiom']) : null,
  };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** 保存する。容量オーバーなどで失敗しても学習は続けられるようにする */
export function saveStore(store: Store): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    return true;
  } catch {
    return false;
  }
}

/** 全消去 */
export function clearStore(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* 消せなくても致命的ではない */
  }
}

/** 進捗の書き出し（JSONの文字列を作る） */
export function exportStore(store: Store): string {
  return JSON.stringify(store, null, 2);
}

/** 進捗の読み込み。壊れたファイルなら null を返す（古い形式は自動で変換する） */
export function importStore(text: string, now: Date = new Date()): Store | null {
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (!isObject(parsed)) return null;
    const migrated = migrate(parsed);
    if (!migrated) return null;
    return mergeWithDefaults(migrated, createInitialStore(now));
  } catch {
    return null;
  }
}

/** その日の履歴を取り出す（無ければ0件のものを返す） */
export function todayHistory(store: Store, today: string) {
  return (
    store.history.find((h) => h.date === today) ?? {
      date: today,
      answered: 0,
      correct: 0,
      newLearned: 0,
    }
  );
}

/** 単語データに存在しないカード記録を掃除する（words.json を差し替えたとき用） */
export function pruneCards(store: Store, words: Word[]): Store {
  const ids = new Set(words.map((w) => w.id));
  const cards: Record<string, CardState> = {};
  for (const [id, card] of Object.entries(store.cards)) {
    if (ids.has(id)) cards[id] = card;
  }
  return { ...store, cards };
}
