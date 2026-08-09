// 連続学習日数（ストリーク）の計算。
//
// 方針：続けられたことは大きく見せるが、途切れたときに責めない。
// 1日抜けても「フリーズ」が自動で消費され、連続が続く。フリーズは週1回もらえる（最大2個）。

import type { StreakState } from '../types';
import { dateKey, diffDays, parseDateKey } from './storage';

/** フリーズの上限 */
export const MAX_FREEZES = 2;
/** フリーズが付与される間隔（日） */
export const FREEZE_GRANT_INTERVAL = 7;

/**
 * 週1回のフリーズ付与。ログイン時に呼ぶ。
 * 前回付与から7日以上たっていれば1個増やす（上限2個）。
 */
export function grantFreezes(streak: StreakState, now: Date = new Date()): StreakState {
  const today = dateKey(now);
  if (!streak.lastFreezeGrantDate) {
    return { ...streak, lastFreezeGrantDate: today };
  }
  const elapsed = diffDays(streak.lastFreezeGrantDate, today);
  if (elapsed < FREEZE_GRANT_INTERVAL) return streak;

  const grants = Math.floor(elapsed / FREEZE_GRANT_INTERVAL);
  const freezes = Math.min(MAX_FREEZES, streak.freezes + grants);
  const grantedDate = dateKey(
    new Date(
      parseDateKey(streak.lastFreezeGrantDate).getTime() +
        grants * FREEZE_GRANT_INTERVAL * 86400000,
    ),
  );
  return { ...streak, freezes, lastFreezeGrantDate: grantedDate };
}

export interface StreakUpdate {
  streak: StreakState;
  /** この更新でストリークが途切れたか（表示を切り替えるために使う） */
  reset: boolean;
  /** この更新でフリーズを使ったか */
  usedFreeze: number;
}

/**
 * 「今日ぶんの学習を達成した」ときに呼ぶ。
 * - 前回が昨日 → そのまま +1
 * - 間が空いた → 空いた日数ぶんフリーズを消費できれば継続、足りなければ 1 に戻す
 */
export function markStudied(streak: StreakState, now: Date = new Date()): StreakUpdate {
  const today = dateKey(now);

  if (streak.lastStudyDate === today) {
    // 同じ日に2回目以降。連続日数は増やさない
    return { streak, reset: false, usedFreeze: 0 };
  }

  const days = streak.days.includes(today) ? streak.days : [...streak.days, today];

  if (!streak.lastStudyDate) {
    const current = 1;
    return {
      streak: {
        ...streak,
        current,
        best: Math.max(streak.best, current),
        lastStudyDate: today,
        days,
      },
      reset: false,
      usedFreeze: 0,
    };
  }

  const gap = diffDays(streak.lastStudyDate, today); // 1なら昨日学習している
  const missed = Math.max(0, gap - 1);

  let current: number;
  let freezes = streak.freezes;
  let reset = false;
  let usedFreeze = 0;

  if (missed === 0) {
    current = streak.current + 1;
  } else if (missed <= freezes) {
    usedFreeze = missed;
    freezes -= missed;
    current = streak.current + 1;
  } else {
    // 途切れた。ここで責める文言は出さない（UI側で「またここから」と表示する）
    current = 1;
    reset = true;
  }

  return {
    streak: {
      ...streak,
      current,
      best: Math.max(streak.best, current),
      lastStudyDate: today,
      freezes,
      days,
    },
    reset,
    usedFreeze,
  };
}

/**
 * 表示用に、実際に途切れているかを判定する（学習していない日にホームを開いたとき用）。
 * 最後の学習からフリーズで埋められないほど日が空いていたら 0 を返す。
 */
export function displayStreak(streak: StreakState, now: Date = new Date()): number {
  if (!streak.lastStudyDate) return 0;
  const gap = diffDays(streak.lastStudyDate, dateKey(now));
  if (gap <= 0) return streak.current;
  const missed = gap - 1;
  return missed <= streak.freezes ? streak.current : 0;
}

/** 今月のカレンダー用に、日ごとの学習有無を返す */
export function monthGrid(
  streak: StreakState,
  now: Date = new Date(),
): { date: string; day: number; studied: boolean; isToday: boolean; isFuture: boolean }[] {
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const studiedSet = new Set(streak.days);
  const today = dateKey(now);

  const cells = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const date = dateKey(new Date(year, month, day));
    cells.push({
      date,
      day,
      studied: studiedSet.has(date),
      isToday: date === today,
      isFuture: diffDays(today, date) > 0,
    });
  }
  return cells;
}
