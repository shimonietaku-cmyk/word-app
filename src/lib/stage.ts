// 3段階の「足場かけ」の昇格・降格判定。
//
// いきなりスペルを書かせると続かないので、同じ単語でも習熟度に応じて出題形式を変える。
//   Stage1 受容：英→日の4択          → 2回連続正解で昇格
//   Stage2 想起：カードを裏返して自己判定 → 2秒以内の正解が2回で昇格
//   Stage3 産出：日→英（並べ替え→入力）
// どの段階でも、不正解が2回続いたら1つ下の段階に戻す。

import type { CardState, Stage } from '../types';
import { thresholdsFor } from './scheduler';

/** Stage1→2 に必要な連続正解数 */
export const PROMOTE_STAGE1_CORRECT = 2;
/** Stage2→3 に必要な「速い正解」の回数 */
export const PROMOTE_STAGE2_FAST = 2;
/** 降格の条件となる連続不正解数 */
export const DEMOTE_WRONG = 2;
/** Stage3で並べ替えからキーボード入力に切り替わる成功回数 */
export const ARRANGE_TO_TYPE = 2;
/** 難単語（leech）と判定する条件 */
export const LEECH_CONSECUTIVE_WRONG = 3;
export const LEECH_TOTAL_WRONG = 8;

export interface AnswerInput {
  correct: boolean;
  elapsedMs: number;
  /** その問題を出したときの Stage */
  stage: Stage;
  /** Stage3で並べ替え形式だったか */
  arranged?: boolean;
}

/**
 * 1回の解答を反映した新しいカード状態を返す（元の状態は変更しない）。
 * FSRSの日付更新は scheduler.ts が担当し、ここでは Stage と成績カウンタだけを扱う。
 */
export function applyAnswer(card: CardState, input: AnswerInput, now: Date = new Date()): CardState {
  const next: CardState = { ...card, lastSeen: now.toISOString() };
  const { fast } = thresholdsFor(input.stage);

  if (input.correct) {
    next.correct += 1;
    next.consecutiveWrong = 0;
    next.consecutiveCorrect += 1;
    if (input.elapsedMs < fast) next.fastCorrect += 1;
    if (input.stage === 3 && input.arranged) next.arrangeSuccess += 1;
  } else {
    next.wrong += 1;
    next.consecutiveWrong += 1;
    next.consecutiveCorrect = 0;
  }

  // 降格：不正解が2回続いたら1つ下げる（これを昇格判定より先に見る）
  if (next.consecutiveWrong >= DEMOTE_WRONG && next.stage > 1) {
    next.stage = (next.stage - 1) as Stage;
    next.consecutiveWrong = 0;
    next.consecutiveCorrect = 0;
    next.fastCorrect = 0;
  } else if (input.correct) {
    // 昇格
    if (next.stage === 1 && next.consecutiveCorrect >= PROMOTE_STAGE1_CORRECT) {
      next.stage = 2;
      next.consecutiveCorrect = 0;
      next.fastCorrect = 0;
    } else if (next.stage === 2 && next.fastCorrect >= PROMOTE_STAGE2_FAST) {
      next.stage = 3;
      next.fastCorrect = 0;
      next.arrangeSuccess = 0;
    }
  }

  // 難単語の隔離判定
  if (next.consecutiveWrong >= LEECH_CONSECUTIVE_WRONG && next.wrong >= LEECH_TOTAL_WRONG) {
    next.leech = true;
  }

  return next;
}

/** Stage3の出題形式。並べ替えに2回成功したらキーボード入力にする */
export function produceModeFor(card: CardState): 'arrange' | 'type' {
  return card.arrangeSuccess >= ARRANGE_TO_TYPE ? 'type' : 'arrange';
}

/** 苦手特訓でleechを解除するときに使う（Stage1に戻して少量ずつ出す） */
export function releaseLeech(card: CardState): CardState {
  return { ...card, leech: false, stage: 1, consecutiveWrong: 0, consecutiveCorrect: 0 };
}
