// 学習セッションの画面。10問を出して、間違えた語は最後にもう一度出す。
//
// 大事にしていること：
//  ・正解したらボタンを押させず、0.4秒で自動的に次へ進む（テンポを止めない）
//  ・間違えても学習は止まらない。正解を大きく見せて「わかった」で次へ
//  ・最後は満点で終われるように、間違えた語を最大3周まで出し直す

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AnswerResult, Question } from '../types';
import { useApp } from '../store/useStore';
import { buildRetryQuestions, buildSession } from '../lib/session';
import type { SessionMode } from '../lib/session';
import { speak, unlockSpeech } from '../lib/speech';
import Stage1Choice from '../components/Stage1Choice';
import Stage2Recall from '../components/Stage2Recall';
import Stage3Produce from '../components/Stage3Produce';
import SpeakerButton from '../components/SpeakerButton';
import ResultScreen from '../components/ResultScreen';

interface Props {
  mode: SessionMode;
  onExit: () => void;
}

type Phase = 'question' | 'correct' | 'wrong' | 'result';

/** 間違えた語を出し直す上限（これ以上は繰り返さない） */
const MAX_RETRY_ROUNDS = 3;
/** 正解したときに次の問題へ進むまでの時間 */
const CORRECT_DELAY_MS = 400;

export default function Session({ mode, onExit }: Props) {
  const { index, store, recordAnswer, finishSession, speechAvailable } = useApp();
  const [queue, setQueue] = useState<Question[]>([]);
  const [pos, setPos] = useState(0);
  const [phase, setPhase] = useState<Phase>('question');
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
    // iOS Safari で音を鳴らすための解錠。必ず画面を触った操作の中で呼ぶ必要があるが、
    // ここに来る直前の「はじめる」ボタンのタップハンドラでも呼んでいる（二重でも害はない）
    unlockSpeech();
  }, [initialPlan]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
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
      if (current.stage === 3 && speechAvailable && store.settings.audio) {
        speak(current.word.en, true);
      }

      if (correct) {
        setPhase('correct');
        timerRef.current = window.setTimeout(advance, CORRECT_DELAY_MS);
      } else {
        setPhase('wrong');
      }
    },
    [current, phase, recordAnswer, advance, speechAvailable, store.settings.audio],
  );

  // 結果画面に入ったタイミングでストリークを更新する
  useEffect(() => {
    if (phase !== 'result') return;
    finishSession(results.filter((r) => !r.isRetry).length);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- 出せる問題が無いとき ---
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
        dailyLimitReached={initialPlan?.dailyLimitReached ?? false}
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
      {/* 上部：進み具合とやめるボタン */}
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

      {/* 出題（Stageによって形式が変わる） */}
      <div className="flex flex-1 flex-col">
        {current.stage === 1 && (
          <Stage1Choice
            key={`${current.word.id}-${pos}-${retryRound}`}
            word={current.word}
            choices={current.choices ?? []}
            disabled={phase !== 'question'}
            onAnswer={handleAnswer}
          />
        )}
        {current.stage === 2 && (
          <Stage2Recall
            key={`${current.word.id}-${pos}-${retryRound}`}
            word={current.word}
            disabled={phase !== 'question'}
            onAnswer={handleAnswer}
          />
        )}
        {current.stage === 3 && (
          <Stage3Produce
            key={`${current.word.id}-${pos}-${retryRound}`}
            word={current.word}
            mode={current.produceMode ?? 'arrange'}
            disabled={phase !== 'question'}
            onAnswer={handleAnswer}
          />
        )}
      </div>

      {/* 正解：短いフィードバックだけ出してすぐ次へ */}
      {phase === 'correct' && (
        <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center">
          <div className="animate-pop rounded-full bg-green-500/90 px-8 py-6 text-4xl text-white shadow-lg">
            ○
          </div>
        </div>
      )}

      {/* 不正解：正解を大きく見せる。責めない */}
      {phase === 'wrong' && (
        <div className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-md animate-fade-up">
          <div className="rounded-t-3xl border-t border-gray-200 bg-white p-5 shadow-2xl dark:border-gray-800 dark:bg-gray-900">
            <p className="text-xs text-gray-400">正解はこちら</p>
            <div className="mt-1 flex items-center gap-3">
              <p className="break-words text-3xl font-bold">{current.word.en}</p>
              <SpeakerButton text={current.word.en} size="sm" />
            </div>
            <p className="mt-2 text-base leading-relaxed">{current.word.ja.join('、')}</p>
            {current.word.note && (
              <p className="mt-1 text-xs text-gray-500">{current.word.note}</p>
            )}
            <button type="button" onClick={advance} className="btn-primary mt-4 h-14 w-full text-base">
              わかった
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
