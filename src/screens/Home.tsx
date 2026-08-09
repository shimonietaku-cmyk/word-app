// ホーム画面。主役は「今日の10問をはじめる」大ボタン1つ。ほかは小さく置く。

import { useMemo } from 'react';
import { useApp } from '../store/useStore';
import { dateKey, todayHistory } from '../lib/storage';
import { displayStreak } from '../lib/streak';
import { dueCount } from '../lib/session';
import type { SessionMode } from '../lib/session';
import { unlockSpeech } from '../lib/speech';
import ProgressRing from '../components/ProgressRing';
import StreakCalendar from '../components/StreakCalendar';

interface Props {
  onStart: (mode: SessionMode) => void;
}

export default function Home({ onStart }: Props) {
  const { store, index } = useApp();
  const today = dateKey();
  const history = todayHistory(store, today);
  const streak = displayStreak(store.streak);

  const due = useMemo(() => (index ? dueCount(index, store) : 0), [index, store]);

  const goal = store.settings.sessionSize;
  const newLimit = store.settings.dailyNewLimit;
  const limitReached = history.newLearned >= newLimit;

  const start = (mode: SessionMode) => {
    // iOS Safari は「タップの中」で1回 speak しないと以後ずっと音が鳴らない。
    // ここが最初のタップなので、必ずここで解錠しておく。
    unlockSpeech();
    onStart(mode);
  };

  return (
    <div className="px-5 pt-6">
      {/* ストリーク */}
      <section className="card-surface p-4">
        <div className="flex items-baseline justify-between">
          <p className="text-2xl font-bold">
            {streak > 0 ? (
              <>
                🔥 {streak}
                <span className="ml-1 text-base font-medium">日連続</span>
              </>
            ) : (
              <span className="text-xl">またここから 🌱</span>
            )}
          </p>
          <p className="text-xs text-gray-400">
            自己ベスト {store.streak.best}日
            {store.streak.freezes > 0 && ` ・ ❄️${store.streak.freezes}`}
          </p>
        </div>
        <div className="mt-3">
          <StreakCalendar streak={store.streak} />
        </div>
      </section>

      {/* 今日の進み具合 */}
      <section className="mt-4 flex items-center gap-4">
        <ProgressRing
          value={history.answered}
          max={Math.max(goal, history.answered)}
          label={`${history.answered}`}
          sub={`/ ${Math.max(goal, history.answered)} 問`}
        />
        <div className="flex-1 text-sm">
          <p className="text-gray-500">
            今日の新規：
            <span className="font-bold text-gray-900 dark:text-gray-100">
              {history.newLearned} / {newLimit}
            </span>
            語
          </p>
          <p className="mt-1 text-gray-500">
            復習まちの単語：
            <span className="font-bold text-gray-900 dark:text-gray-100">{due}</span>語
          </p>
          {limitReached && (
            <p className="mt-2 rounded-xl bg-accent-50 px-3 py-2 text-xs leading-relaxed text-accent-700 dark:bg-accent-900/40 dark:text-accent-200">
              今日の新しい単語はここまで。
              <br />
              あとは復習でしっかり固めよう。
            </p>
          )}
        </div>
      </section>

      {/* 主役のボタン */}
      <button
        type="button"
        onClick={() => start('mixed')}
        className="btn-primary mt-6 h-20 w-full text-xl shadow-lg shadow-accent-500/20"
      >
        今日の{goal}問をはじめる
      </button>

      {/* 補助的な入り口は小さく */}
      <div className="mt-3 flex gap-3">
        <button
          type="button"
          onClick={() => start('new')}
          className="btn-secondary h-12 flex-1 text-sm"
        >
          新しい単語だけ
        </button>
        {store.testMode?.active && (
          <button
            type="button"
            onClick={() => start('test')}
            className="btn-secondary h-12 flex-1 text-sm"
          >
            テスト対策
          </button>
        )}
      </div>

      <p className="mt-4 text-center text-[11px] text-gray-400">
        30秒〜1分で終わります。毎日ちょっとずつ。
      </p>
    </div>
  );
}
