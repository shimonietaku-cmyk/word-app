// セッションの結果画面。
// 「10問中10問正解！」で終われるように、間違えた語は最後に出し直してある。
// ただし3周しても正解に届かなかった場合は嘘の満点を出さず、できたところを肯定的に伝える。

import type { AnswerResult } from '../types';
import { useApp } from '../store/useStore';
import { displayStreak } from '../lib/streak';
import { newLearnedDiff } from '../lib/stats';

interface Props {
  results: AnswerResult[];
  mainCount: number;
  elapsedSec: number;
  dailyLimitReached: boolean;
  onExit: () => void;
}

export default function ResultScreen({
  results,
  mainCount,
  elapsedSec,
  dailyLimitReached,
  onExit,
}: Props) {
  const { store } = useApp();

  // 統計は「最初の1回の正誤」で数える（出し直しぶんで実力を過大評価しないため）
  const mainResults = results.filter((r) => !r.isRetry);
  const firstTryCorrect = mainResults.filter((r) => r.correct).length;

  // 最終的にクリアできた語数（出し直しで正解できたものを含む）
  const clearedIds = new Set(results.filter((r) => r.correct).map((r) => r.wordId));
  const allIds = new Set(mainResults.map((r) => r.wordId));
  const cleared = [...allIds].filter((id) => clearedIds.has(id)).length;
  const perfect = cleared === allIds.size && allIds.size > 0;

  const newLearned = mainResults.filter((r) => r.isNew).length;
  const diff = newLearnedDiff(store);
  const streak = displayStreak(store.streak);

  return (
    <div className="flex min-h-screen flex-col justify-between px-6 py-8">
      <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
        <p className="text-5xl animate-pop">{perfect ? '🎉' : '👏'}</p>

        {perfect ? (
          <h1 className="text-3xl font-bold leading-snug">
            {allIds.size}問中{allIds.size}問正解！
          </h1>
        ) : (
          <h1 className="text-3xl font-bold leading-snug">
            今日は{cleared}問クリア！
            <br />
            <span className="text-lg font-medium text-gray-500">
              残りはまた明日いっしょに
            </span>
          </h1>
        )}

        <div className="w-full card-surface divide-y divide-gray-100 text-left dark:divide-gray-800">
          <Row label="はじめから正解できた" value={`${firstTryCorrect} / ${mainCount} 問`} />
          <Row label="新しく覚えた単語" value={`${newLearned} 語`} />
          <Row
            label="昨日より"
            value={diff > 0 ? `${diff}語 多い` : diff === 0 ? '同じペース' : `${Math.abs(diff)}語 少なめ`}
          />
          <Row label="かかった時間" value={`${elapsedSec} 秒`} />
          <Row label="連続学習" value={streak > 0 ? `🔥 ${streak} 日` : 'またここから'} />
        </div>

        {dailyLimitReached && (
          <p className="rounded-2xl bg-accent-50 px-4 py-3 text-sm leading-relaxed text-accent-700 dark:bg-accent-900/40 dark:text-accent-200">
            今日の新しい単語はここまで。
            <br />
            あとは復習でしっかり固めよう。
          </p>
        )}
      </div>

      <button type="button" onClick={onExit} className="btn-primary mt-8 h-14 w-full text-base">
        ホームにもどる
      </button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-bold tabular-nums">{value}</span>
    </div>
  );
}
