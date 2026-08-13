// 毎日モードの学習セッション。10問を出して、間違えた語は最後にもう一度出す。
//
// 大事にしていること：
//  ・正解したらボタンを押させず、0.4秒で自動的に次へ進む（テンポを止めない）
//  ・間違えても学習は止まらない。正解を大きく見せて「わかった」で次へ
//  ・最後は満点で終われるように、間違えた語を最大3周まで出し直す
//
// テスト範囲を集中的に回すドリルは DrillSession.tsx が担当する。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AnswerResult, Question } from '../types';
import { useApp } from '../store/useStore';
import { buildRetryQuestions, buildSession } from '../lib/session';
import type { SessionMode } from '../lib/session';
import { speak, stopSpeaking, unlockSpeech } from '../lib/speech';
import QuestionView from '../components/QuestionView';
import type { QuestionPhase } from '../components/QuestionView';
import ResultScreen from '../components/ResultScreen';

interface Props {
  mode: SessionMode;
  onExit: () => void;
}

/** 間違えた語を出し直す上限（これ以上は繰り返さない） */
const MAX_RETRY_ROUNDS = 3;
/** 正解したときに次の問題へ進むまでの時間 */
const CORRECT_DELAY_MS = 400;

export default function Session({ mode, onExit }: Props) {
  const { index, store, recordAnswer, finishSession } = useApp();
  const [queue, setQueue] = useState<Question[]>([]);
  const [pos, setPos] = useState(0);
  const [phase, setPhase] = useState<QuestionPhase | 'result'>('question');
  const [results, setResults] = useState<AnswerResult[]>([]);
  const [wrongIds, setWrongIds] = useState<string[]>([]);
  const [retryRound, setRetryRound] = useState(0);
  const [startedAt] = useState(() => Date.now());
  const timerRef = useRef<number | null>(null);

  // セッションの最初の1回だけ問題を組み立てる
  const initialPlan = useMemo(() => {
    if (!index) return null;
    return buildSession(index, store, { mode });
    // store の変化で作り直すと出題が入れ替わってしまうので、最初の1回だけにする
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, mode]);

  useEffect(() => {
    if (!initialPlan) return;
    setQueue(initialPlan.questions);
    unlockSpeech();
  }, [initialPlan]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      stopSpeaking(); // 画面を離れたら読み上げも止める
    };
  }, []);

  const current = queue[pos];
  const mainCount = initialPlan?.questions.length ?? 0;
  const answeredMain = results.filter((r) => !r.isRetry).length;

  /** 次の問題へ。もう無ければ再出題を組むか、結果画面へ */
  const advance = useCallback(() => {
    const nextPos = pos + 1;
    if (nextPos < queue.length) {
      setPos(nextPos);
      setPhase('question');
      return;
    }

    // このまとまりが終わった。間違えた語があればもう一度出す（満点で終わるため）
    if (wrongIds.length > 0 && retryRound < MAX_RETRY_ROUNDS && index) {
      setQueue(buildRetryQuestions(wrongIds, index, store));
      setWrongIds([]);
      setRetryRound(retryRound + 1);
      setPos(0);
      setPhase('question');
      return;
    }

    setPhase('result');
  }, [pos, queue.length, wrongIds, retryRound, index, store]);

  const handleAnswer = useCallback(
    (correct: boolean, elapsedMs: number) => {
      if (!current || phase !== 'question') return;

      const result: AnswerResult = {
        wordId: current.word.id,
        correct,
        elapsedMs,
        stage: current.stage,
        isNew: current.isNew,
        isRetry: current.isRetry,
      };
      setResults((prev) => [...prev, result]);
      recordAnswer(result);

      if (!correct) {
        setWrongIds((prev) => (prev.includes(current.word.id) ? prev : [...prev, current.word.id]));
      }

      // Stage3（日→英）は答え合わせの瞬間に発音を鳴らす
      if (current.stage === 3 && store.settings.audio) speak(current.word.en, true);

      if (correct) {
        setPhase('correct');
        timerRef.current = window.setTimeout(advance, CORRECT_DELAY_MS);
      } else {
        setPhase('wrong');
      }
    },
    [current, phase, recordAnswer, advance, store.settings.audio],
  );

  // 結果画面に入ったタイミングでストリークを更新する
  useEffect(() => {
    if (phase !== 'result') return;
    finishSession(results.filter((r) => !r.isRetry).length);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  if (initialPlan?.empty) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-8 text-center">
        <p className="text-2xl">🎉</p>
        <p className="text-lg font-bold">いまの範囲に出せる単語がありません</p>
        <p className="text-sm text-gray-500">
          「範囲」から学年や単元を選び直すと、また学習をはじめられます。
        </p>
        <button className="btn-primary h-12 px-8" onClick={onExit}>
          もどる
        </button>
      </div>
    );
  }

  if (phase === 'result') {
    return (
      <ResultScreen
        results={results}
        mainCount={mainCount}
        elapsedSec={Math.round((Date.now() - startedAt) / 1000)}
        onExit={onExit}
      />
    );
  }

  if (!current) {
    return (
      <div className="flex min-h-screen items-center justify-center text-gray-400">
        <p>準備中…</p>
      </div>
    );
  }

  const progress = retryRound > 0 ? 1 : mainCount === 0 ? 0 : answeredMain / mainCount;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center gap-3 px-4 pt-4">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
          <div
            className="h-full rounded-full bg-accent-500 transition-[width] duration-300"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
        <span className="text-xs tabular-nums text-gray-500">
          {retryRound > 0 ? 'おさらい' : `${Math.min(pos + 1, mainCount)}/${mainCount}`}
        </span>
        <button type="button" onClick={onExit} className="btn-ghost h-11 text-sm">
          やめる
        </button>
      </header>

      {retryRound > 0 && (
        <p className="px-4 pt-2 text-center text-xs text-accent-500">
          まちがえた単語をもう一度。ここを全部正解すれば満点！
        </p>
      )}

      <QuestionView
        question={current}
        instanceKey={`${current.word.id}-${pos}-${retryRound}`}
        phase={phase}
        onAnswer={handleAnswer}
        onContinue={advance}
      />
    </div>
  );
}
