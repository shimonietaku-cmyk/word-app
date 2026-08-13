// テスト対策ドリルの出題画面。
//
// 毎日モードと違い、範囲内を1周ぶん通しで出す。
// 1問ごとに進捗を保存するので、途中でやめても次に開いたときに続きから再開できる。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DrillState, Question } from '../types';
import { useApp } from '../store/useStore';
import { makeQuestion, cardOf } from '../lib/session';
import {
  answeredInRound,
  isRoundComplete,
  nextRound,
  recordDrillAnswer,
  wordsInRange,
  wrongOnlyRound,
} from '../lib/drill';
import { speak, stopSpeaking, unlockSpeech } from '../lib/speech';
import QuestionView from '../components/QuestionView';
import type { QuestionPhase } from '../components/QuestionView';
import DrillResult from '../components/DrillResult';

interface Props {
  onExit: () => void;
  onOpenList: () => void;
}

const CORRECT_DELAY_MS = 400;

export default function DrillSession({ onExit, onOpenList }: Props) {
  const { index, store, update, recordAnswer } = useApp();
  const drill = store.drill.current;

  const [phase, setPhase] = useState<QuestionPhase>('question');
  const [roundDone, setRoundDone] = useState(false);
  const [tally, setTally] = useState({ correct: 0, wrong: 0 });
  const [wrongThisRun, setWrongThisRun] = useState<string[]>([]);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    unlockSpeech();
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      stopSpeaking(); // 画面を離れたら読み上げも止める
    };
  }, []);

  const currentId = drill?.queue[0] ?? null;

  // 出題は1問ずつその場で作る。範囲が1000語でも最初の待ち時間が出ないようにするため
  const question: Question | null = useMemo(() => {
    if (!index || !currentId) return null;
    const word = index.byId.get(currentId);
    if (!word) return null;
    const q = makeQuestion(word, cardOf(store, word.id, new Date()), index);
    q.number = index.numberOf.get(word.id);
    return q;
    // store 全体を依存に入れると毎回作り直しになるので、単語が変わったときだけ作る
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, currentId]);

  const setDrill = useCallback(
    (updater: (prev: DrillState) => DrillState) => {
      update((prev) =>
        prev.drill.current
          ? { ...prev, drill: { ...prev.drill, current: updater(prev.drill.current) } }
          : prev,
      );
    },
    [update],
  );

  const handleAnswer = useCallback(
    (correct: boolean, elapsedMs: number) => {
      if (!question || phase !== 'question') return;

      // ドリルの進捗（範囲内の成績）と、アプリ全体の記録（Stage・FSRS・今日の実績）の両方を更新する
      setDrill((prev) => recordDrillAnswer(prev, question.word.id, correct));
      recordAnswer({
        wordId: question.word.id,
        correct,
        elapsedMs,
        stage: question.stage,
        isNew: false,
        isRetry: false,
      });

      setTally((t) => ({
        correct: t.correct + (correct ? 1 : 0),
        wrong: t.wrong + (correct ? 0 : 1),
      }));
      if (!correct) {
        setWrongThisRun((prev) =>
          prev.includes(question.word.id) ? prev : [...prev, question.word.id],
        );
      }

      // Stage3（日→英）は答え合わせの瞬間に発音を鳴らす
      if (question.stage === 3 && store.settings.audio) speak(question.word.en, true);

      if (correct) {
        setPhase('correct');
        timerRef.current = window.setTimeout(() => setPhase('question'), CORRECT_DELAY_MS);
      } else {
        setPhase('wrong');
      }
    },
    [question, phase, setDrill, recordAnswer, store.settings.audio],
  );

  // キューが空になった＝この周を出し終えた
  useEffect(() => {
    if (drill && isRoundComplete(drill) && phase === 'question') setRoundDone(true);
  }, [drill, phase]);

  if (!drill || !index) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-8 text-center">
        <p className="text-lg font-bold">出題範囲が設定されていません</p>
        <button className="btn-primary h-12 px-8" onClick={onExit}>
          もどる
        </button>
      </div>
    );
  }

  // --- 1周おわり ---
  if (roundDone) {
    return (
      <DrillResult
        drill={drill}
        index={index}
        tally={tally}
        wrongIds={wrongThisRun}
        onNextRound={() => {
          setDrill((prev) => nextRound(index, prev));
          setTally({ correct: 0, wrong: 0 });
          setWrongThisRun([]);
          setRoundDone(false);
          setPhase('question');
        }}
        onRetryWrong={() => {
          setDrill((prev) => wrongOnlyRound(index, prev));
          setTally({ correct: 0, wrong: 0 });
          setWrongThisRun([]);
          setRoundDone(false);
          setPhase('question');
        }}
        onOpenList={onOpenList}
        onExit={onExit}
      />
    );
  }

  if (!question) {
    return (
      <div className="flex min-h-screen items-center justify-center text-gray-400">
        <p>準備中…</p>
      </div>
    );
  }

  const done = answeredInRound(drill);
  const total = drill.roundTotal;
  const rangeTotal = wordsInRange(index, drill.range).length;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="px-4 pt-4">
        <div className="flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
            <div
              className="h-full rounded-full bg-accent-500 transition-[width] duration-300"
              style={{ width: `${total === 0 ? 0 : Math.round((done / total) * 100)}%` }}
            />
          </div>
          <button type="button" onClick={onExit} className="btn-ghost h-11 text-sm">
            やめる
          </button>
        </div>

        <div className="mt-2 flex items-center justify-between text-sm">
          <span className="font-bold tabular-nums">
            {Math.min(done + 1, total)} / {total}問
          </span>
          <span className="flex gap-3 tabular-nums">
            <span className="text-green-600 dark:text-green-400">○ {tally.correct}</span>
            <span className="text-red-500 dark:text-red-400">✗ {tally.wrong}</span>
          </span>
        </div>

        <p className="mt-1 text-[11px] text-gray-400">
          {drill.wrongOnly
            ? `まちがえた${total}語だけ・${drill.range.grade}年 ${drill.range.from}〜${drill.range.to}番`
            : `${drill.round}周目・${drill.range.grade}年 ${drill.range.from}〜${drill.range.to}番（${rangeTotal}語）`}
          {question.number ? ` ／ ${question.number}番` : ''}
        </p>
      </header>

      <QuestionView
        question={question}
        instanceKey={`${question.word.id}-${done}-${drill.round}`}
        phase={phase}
        onAnswer={handleAnswer}
        onContinue={() => setPhase('question')}
      />
    </div>
  );
}
