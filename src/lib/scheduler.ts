// 復習スケジューリング。「次にいつ復習すると忘れにくいか」を計算する。
//
// 間隔の計算式は自前で書かず、研究にもとづく ts-fsrs というライブラリに任せる。
// このファイルの役割は2つ：
//  (1) 中学生に Again/Hard/Good/Easy を選ばせず、正誤と解答時間から自動で決める
//  (2) 日付を localStorage に保存できる形（文字列）と ts-fsrs の形（Date）で相互変換する

import { createEmptyCard, fsrs, generatorParameters, Rating, State } from 'ts-fsrs';
import type { Card as FSRSCard, FSRS, Grade } from 'ts-fsrs';
import type { Stage, StoredFSRSCard } from '../types';

/** 解答時間の閾値（ミリ秒）。Stage3は打鍵に時間がかかるので緩める */
export const FAST_MS = 2000;
export const SLOW_MS = 6000;
export const FAST_MS_STAGE3 = 5000;
export const SLOW_MS_STAGE3 = 15000;

/** Stageごとの「速い」「遅い」の境目を返す */
export function thresholdsFor(stage: Stage): { fast: number; slow: number } {
  return stage === 3 ? { fast: FAST_MS_STAGE3, slow: SLOW_MS_STAGE3 } : { fast: FAST_MS, slow: SLOW_MS };
}

/**
 * 正誤と解答時間から評価（Rating）を自動で決める。
 *  不正解                → Again
 *  正解 かつ 遅い(>6秒)  → Hard   ※「遅いが正解」を Again に落とさない
 *  正解 かつ 2〜6秒      → Good
 *  正解 かつ 速い(<2秒)  → Easy
 */
export function ratingFor(correct: boolean, elapsedMs: number, stage: Stage): Grade {
  if (!correct) return Rating.Again;
  const { fast, slow } = thresholdsFor(stage);
  if (elapsedMs > slow) return Rating.Hard;
  if (elapsedMs >= fast) return Rating.Good;
  return Rating.Easy;
}

// 「復習の多さ」設定ごとに FSRS の計算機を作り、使い回す（毎回作ると無駄なので）
const engines = new Map<number, FSRS>();

export function getEngine(requestRetention = 0.9): FSRS {
  let engine = engines.get(requestRetention);
  if (!engine) {
    engine = fsrs(
      generatorParameters({
        request_retention: requestRetention,
        enable_fuzz: true, // 復習日を少しばらけさせ、同じ日に集中しないようにする
      }),
    );
    engines.set(requestRetention, engine);
  }
  return engine;
}

/** ts-fsrs のカード（Date型）→ 保存用（文字列） */
export function toStored(card: FSRSCard): StoredFSRSCard {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review ? card.last_review.toISOString() : undefined,
  };
}

/** 保存用（文字列）→ ts-fsrs のカード（Date型） */
export function fromStored(stored: StoredFSRSCard): FSRSCard {
  return {
    due: new Date(stored.due),
    stability: stored.stability,
    difficulty: stored.difficulty,
    elapsed_days: stored.elapsed_days,
    scheduled_days: stored.scheduled_days,
    reps: stored.reps,
    lapses: stored.lapses,
    state: stored.state as State,
    last_review: stored.last_review ? new Date(stored.last_review) : undefined,
  };
}

/** まだ一度も学習していないカードを作る */
export function newStoredCard(now: Date = new Date()): StoredFSRSCard {
  return toStored(createEmptyCard(now));
}

/** 1回の解答を反映して、次の復習日が入ったカードを返す */
export function reviewCard(
  stored: StoredFSRSCard,
  rating: Grade,
  now: Date = new Date(),
  requestRetention = 0.9,
): StoredFSRSCard {
  const engine = getEngine(requestRetention);
  const result = engine.next(fromStored(stored), now, rating);
  return toStored(result.card);
}

/** そのカードが今日復習すべきか（due が今より前かどうか） */
export function isDue(stored: StoredFSRSCard, now: Date = new Date()): boolean {
  return new Date(stored.due).getTime() <= now.getTime();
}

/** まだ一度も出題していないカードか */
export function isNewCard(stored: StoredFSRSCard): boolean {
  return stored.state === State.New && stored.reps === 0;
}

export { Rating, State };
