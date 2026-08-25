// 熟語モードの出題画面。
//
// つくりはテスト対策ドリル（DrillSession）と同じで、キューの先頭から1問ずつ出す。
// ちがうのは「範囲」が番号ではなく熟語ぜんぶであることと、
// 同じ熟語でも正解を重ねるほど出題形式が難しくなること。
//
// 熟語モードの成績（stats）は熟語モードの中だけで持ち、
// 毎日モードの復習間隔（FSRS）には影響させない。
// 短時間で何周も回す使い方をするので、混ぜると復習日がずれてしまうため。

import { useCallback, useEffect, useRef, useState } from 'react';
import type { IdiomQuestion, IdiomState } from '../types';
import { useApp } from '../store/useStore';
import {
  answeredInIdiomRound,
  defaultIdiomOptions,
  entriesFor,
  formatFor,
  idiomStatOf,
  idiomWrongOnlyRound,
  makeIdiomQuestion,
  nextIdiomRound,
  recordIdiomAnswer,
  startIdioms,
} from '../lib/idioms';
import { speak, stopSpeaking, unlockSpeech } from '../lib/speech';
import IdiomQuestionView from '../components/IdiomQuestionView';
import type { IdiomPhase } from '../components/IdiomQuestionView';
import IdiomResult from '../components/IdiomResult';

interface Props {
  onExit: () => void;
  onOpenList: () => void;
  onSetup: () => void;
}

/** 正解の演出を出しておく時間。短いほど回転数が上がる */
const CORRECT_DELAY_MS = 350;

export default function IdiomSession({ onExit, onOpenList, onSetup }: Props) {
  const { idioms, store, update, recordPractice, finishSession } = useApp();
  const state = store.idiom;

  const [phase, setPhase] = useState<IdiomPhase>('question');
  const [roundDone, setRoundDone] = useState(false);
  const [tally, setTally] = useState({ correct: 0, wrong: 0 });
  const [wrongThisRun, setWrongThisRun] = useState<string[]>([]);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    unlockSpeech();
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      stopSpeaking();
    };
  }, []);

  // 設定を通らずに来たとき（ホームの「はじめる」）は、おすすめの設定でそのまま始める。
  // 最初の1回で設定画面を挟むと、それだけで続かなくなるため。
  useEffect(() => {
    if (state || !idioms) return;
    update((prev) =>
      prev.idiom ? prev : { ...prev, idiom: startIdioms(idioms, defaultIdiomOptions(), null) },
    );
  }, [state, idioms, update]);

  /**
   * いま画面に出している問題。
   * 回答するとキューから即座に取り除かれるので、
   * 表示中の1問はここに固定しておかないと答え合わせの途中で中身が入れ替わる。
   */
  const [shown, setShown] = useState<{
    question: IdiomQuestion;
    position: number;
    seq: number;
  } | null>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    if (shown || roundDone || !state || !idioms) return;
    const nextId = state.queue[0];
    if (!nextId) {
      setRoundDone(true);
      finishSession(0);
      return;
    }
    const entry = idioms.byId.get(nextId);
    if (!entry) return;
    const format = formatFor(idiomStatOf(state, nextId), state.options.mode);
    seqRef.current += 1;
    setShown({
      question: makeIdiomQuestion(entry, idioms, format),
      position: answeredInIdiomRound(state) + 1,
      seq: seqRef.current,
    });
    setPhase('question');
    // store 全体を依存に入れると解答のたびに作り直しになるので、意図的に外している
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, roundDone, state, idioms]);

  const goNext = useCallback(() => setShown(null), []);

  /** 画面を離れるとき、その日の合計でストリークを判定してもらう */
  const leave = useCallback(() => {
    finishSession(0);
    onExit();
  }, [finishSession, onExit]);

  const setIdiom = useCallback(
    (updater: (prev: IdiomState) => IdiomState) => {
      update((prev) => (prev.idiom ? { ...prev, idiom: updater(prev.idiom) } : prev));
    },
    [update],
  );

  const handleAnswer = useCallback(
    (correct: boolean) => {
      if (!shown || phase !== 'question') return;
      const { entry } = shown.question;

      setIdiom((prev) => recordIdiomAnswer(prev, entry.id, correct));
      // 今日の実績には数えるが、毎日モードの復習日（FSRS）には触れない
      recordPractice(correct);

      setTally((t) => ({
        correct: t.correct + (correct ? 1 : 0),
        wrong: t.wrong + (correct ? 0 : 1),
      }));
      if (!correct) {
        setWrongThisRun((prev) => (prev.includes(entry.id) ? prev : [...prev, entry.id]));
      }

      // 答えを隠していた形式は、答え合わせの瞬間に正しい英語を鳴らす
      if (shown.question.format !== 'meaning' && store.settings.audio) {
        speak(shown.question.speech, true);
      }

      if (correct) {
        setPhase('correct');
        timerRef.current = window.setTimeout(goNext, CORRECT_DELAY_MS);
      } else {
        setPhase('wrong');
      }
    },
    [shown, phase, setIdiom, recordPractice, store.settings.audio, goNext],
  );

  if (!idioms) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-8 text-center">
        <p className="text-lg font-bold">熟語データを読み込めませんでした</p>
        <button className="btn-primary h-12 px-8" onClick={onExit}>
          もどる
        </button>
      </div>
    );
  }

  // 上の useEffect が初期設定を書き込むまでの一瞬だけここに来る
  if (!state) {
    return (
      <div className="flex min-h-screen items-center justify-center text-gray-400">
        <p>準備中…</p>
      </div>
    );
  }

  const total = entriesFor(idioms, state.options).length;

  if (total === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-8 text-center">
        <p className="text-lg font-bold">出せる熟語がありません</p>
        <p className="text-sm text-gray-500">学年の選択を見直してください。</p>
        <button className="btn-primary h-12 px-8" onClick={onSetup}>
          設定を変える
        </button>
      </div>
    );
  }

  if (roundDone) {
    return (
      <IdiomResult
        state={state}
        index={idioms}
        tally={tally}
        wrongIds={wrongThisRun}
        onNextRound={() => {
          setIdiom((prev) => nextIdiomRound(idioms, prev));
          setTally({ correct: 0, wrong: 0 });
          setWrongThisRun([]);
          setShown(null);
          setRoundDone(false);
        }}
        onRetryWrong={() => {
          setIdiom((prev) => idiomWrongOnlyRound(idioms, prev, wrongThisRun));
          setTally({ correct: 0, wrong: 0 });
          setWrongThisRun([]);
          setShown(null);
          setRoundDone(false);
        }}
        onOpenList={onOpenList}
        onExit={leave}
      />
    );
  }

  if (!shown) {
    return (
      <div className="flex min-h-screen items-center justify-center text-gray-400">
        <p>準備中…</p>
      </div>
    );
  }

  const { question, position } = shown;
  const roundTotal = state.roundTotal;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="px-4 pt-4">
        <div className="flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
            <div
              className="h-full rounded-full bg-accent-500 transition-[width] duration-300"
              style={{
                width: `${roundTotal === 0 ? 0 : Math.round(((position - 1) / roundTotal) * 100)}%`,
              }}
            />
          </div>
          <button type="button" onClick={leave} className="btn-ghost h-11 text-sm">
            やめる
          </button>
        </div>

        <div className="mt-2 flex items-center justify-between text-sm">
          <span className="font-bold tabular-nums">
            {Math.min(position, roundTotal)} / {roundTotal}問
          </span>
          <span className="flex gap-3 tabular-nums">
            <span className="text-green-600 dark:text-green-400">○ {tally.correct}</span>
            <span className="text-red-500 dark:text-red-400">✗ {tally.wrong}</span>
          </span>
        </div>

        <p className="mt-1 text-[11px] text-gray-400">
          {state.wrongOnly ? `まちがえた${roundTotal}個だけ` : `${state.round}周目`}
          <span className="mx-1.5 text-gray-300 dark:text-gray-700">|</span>
          熟語 {total}個
        </p>
      </header>

      <IdiomQuestionView
        question={question}
        instanceKey={`${question.entry.id}-${shown.seq}`}
        phase={phase}
        onAnswer={handleAnswer}
        onContinue={goNext}
      />
    </div>
  );
}
