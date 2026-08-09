// 親子クイズモード。親のスマホに英単語と答えを表示し、子が口頭で答える。
// 親は「正解／おしい」をタップするだけ。10問で終わる。
//
// 判定の基準は親によってばらつくので、復習の間隔計算は一律「ふつう（Good）」にする。
// 起動は設定からの明示的な操作のみ（ホームに置くと「見張られている」感じになるため）。

import { useMemo, useState } from 'react';
import { useApp } from '../store/useStore';
import { buildSession } from '../lib/session';
import { createCardState, dateKey } from '../lib/storage';
import { reviewCard, Rating } from '../lib/scheduler';
import { applyAnswer } from '../lib/stage';
import SpeakerButton from '../components/SpeakerButton';

interface Props {
  onExit: () => void;
}

export default function ParentQuiz({ onExit }: Props) {
  const { index, store, update } = useApp();
  const [pos, setPos] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [done, setDone] = useState(false);

  const plan = useMemo(() => {
    if (!index) return null;
    return buildSession(index, store, { size: 10 });
    // 出題は最初の1回だけ決める
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const questions = plan?.questions ?? [];
  const current = questions[pos];

  /** 親の判定を記録する。復習の間隔は一律 Good で計算する */
  const answer = (correct: boolean) => {
    if (!current) return;
    update((prev) => {
      const now = new Date();
      const today = dateKey(now);
      const existing = prev.cards[current.word.id] ?? createCardState(now);
      const staged = applyAnswer(
        existing,
        { correct, elapsedMs: 3000, stage: existing.stage },
        now,
      );
      const fsrs = reviewCard(existing.fsrs, Rating.Good, now, prev.settings.requestRetention);

      const history = [...prev.history];
      const i = history.findIndex((h) => h.date === today);
      const entry = i >= 0 ? { ...history[i] } : { date: today, answered: 0, correct: 0, newLearned: 0 };
      entry.answered += 1;
      if (correct) entry.correct += 1;
      if (i >= 0) history[i] = entry;
      else history.push(entry);

      return { ...prev, cards: { ...prev.cards, [current.word.id]: { ...staged, fsrs } }, history };
    });

    if (correct) setCorrectCount((n) => n + 1);
    setRevealed(false);
    if (pos + 1 >= questions.length) setDone(true);
    else setPos(pos + 1);
  };

  if (!current || done) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-5 px-8 text-center">
        <p className="text-5xl">👏</p>
        <h1 className="text-2xl font-bold">おつかれさま！</h1>
        {questions.length > 0 && (
          <p className="text-base text-gray-500">
            {questions.length}問中 {correctCount}問 正解
          </p>
        )}
        <button type="button" onClick={onExit} className="btn-primary h-14 w-full max-w-xs text-base">
          おわる
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-5 pt-4">
        <span className="text-sm tabular-nums text-gray-500">
          {pos + 1} / {questions.length}
        </span>
        <button type="button" onClick={onExit} className="btn-ghost h-11 text-sm">
          やめる
        </button>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6">
        <p className="text-xs text-gray-400">この単語を声に出して答えてもらいましょう</p>
        <div className="flex items-center gap-3">
          <h2 className="break-words text-center text-4xl font-bold">{current.word.en}</h2>
          <SpeakerButton text={current.word.en} />
        </div>

        {revealed ? (
          <div className="w-full animate-fade-up rounded-2xl bg-gray-100 p-4 text-center dark:bg-gray-800">
            {current.word.ja.map((j) => (
              <p key={j} className="text-lg font-medium">
                {j}
              </p>
            ))}
            {current.word.note && <p className="mt-1 text-xs text-gray-500">{current.word.note}</p>}
          </div>
        ) : (
          <button type="button" onClick={() => setRevealed(true)} className="btn-secondary h-12 px-6">
            答えを表示
          </button>
        )}
      </div>

      <div className="flex gap-3 px-5 pb-8">
        <button type="button" onClick={() => answer(false)} className="btn-secondary h-16 flex-1 text-base">
          おしい
        </button>
        <button type="button" onClick={() => answer(true)} className="btn-primary h-16 flex-1 text-base">
          正解
        </button>
      </div>
    </div>
  );
}
