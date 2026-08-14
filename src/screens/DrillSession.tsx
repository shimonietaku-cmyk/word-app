// テスト対策ドリルの出題画面。
//
// 毎日モードと違い、範囲内を1周ぶん通しで出す。
// 1問ごとに進捗を保存するので、途中でやめても次に開いたときに続きから再開できる。

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DrillState, Question } from '../types';
import { useApp } from '../store/useStore';
import { makeQuestion, cardOf } from '../lib/session';
import {
  answeredInRound,
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

  /**
   * いま画面に出している問題。
   *
   * 出題キューの先頭から直接求めてはいけない。
   * 回答するとその単語はキューから即座に取り除かれるため、
   * 不正解の「正解はこちら」を表示している最中に次の単語へ切り替わってしまい、
   * 答えがずれて見える。表示中の問題はここに保持し、
   * 「わかった」を押す（または正解の演出が終わる）まで次に進めない。
   */
  const [shown, setShown] = useState<{
    question: Question;
    /** この周で何問目か。表示中は固定する（回答直後に数字が動かないように） */
    position: number;
    /** 同じ単語が再登場したときに中身を作り直すための連番 */
    seq: number;
  } | null>(null);
  const seqRef = useRef(0);

  // 表示中の問題が無くなったら、キューの先頭から次の1問を作る。
  // 1問ずつその場で作るのは、範囲が1000語でも最初の待ち時間を出さないため。
  useEffect(() => {
    if (shown || roundDone || !drill || !index) return;
    const nextId = drill.queue[0];
    if (!nextId) {
      setRoundDone(true); // この周は出し切った
      return;
    }
    const word = index.byId.get(nextId);
    if (!word) return;
    const question = makeQuestion(word, cardOf(store, word.id, new Date()), index);
    question.number = index.numberOf.get(word.id);
    seqRef.current += 1;
    setShown({ question, position: answeredInRound(drill) + 1, seq: seqRef.current });
    setPhase('question');
    // store を依存に入れると解答のたびに作り直しになるので、意図的に外している
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, roundDone, drill, index]);

  /** 次の問題へ進む（表示中の問題を手放すと、上の useEffect が次を作る） */
  const goNext = useCallback(() => setShown(null), []);

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
      if (!shown || phase !== 'question') return;
      const { word, stage } = shown.question;

      // ドリルの進捗（範囲内の成績）と、アプリ全体の記録（Stage・FSRS・今日の実績）の両方を更新する。
      // ここでキューからは取り除かれるが、画面の表示は shown が持っているので切り替わらない。
      setDrill((prev) => recordDrillAnswer(prev, word.id, correct));
      recordAnswer({
        wordId: word.id,
        correct,
        elapsedMs,
        stage,
        isNew: false,
        isRetry: false,
      });

      setTally((t) => ({
        correct: t.correct + (correct ? 1 : 0),
        wrong: t.wrong + (correct ? 0 : 1),
      }));
      if (!correct) {
        setWrongThisRun((prev) => (prev.includes(word.id) ? prev : [...prev, word.id]));
      }

      // Stage3（日→英）は答え合わせの瞬間に発音を鳴らす
      if (stage === 3 && store.settings.audio) speak(word.en, true);

      if (correct) {
        setPhase('correct');
        timerRef.current = window.setTimeout(goNext, CORRECT_DELAY_MS);
      } else {
        // 不正解のときは「正解はこちら」を出したまま止め、「わかった」で次へ進む
        setPhase('wrong');
      }
    },
    [shown, phase, setDrill, recordAnswer, store.settings.audio, goNext],
  );

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
          setShown(null);
          setRoundDone(false);
        }}
        onRetryWrong={() => {
          // ボタンに出している語数と実際の出題数が必ず一致するよう、この周の記録を渡す
          setDrill((prev) => wrongOnlyRound(index, prev, wrongThisRun));
          setTally({ correct: 0, wrong: 0 });
          setWrongThisRun([]);
          setShown(null);
          setRoundDone(false);
        }}
        onOpenList={onOpenList}
        onExit={onExit}
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
  const total = drill.roundTotal;
  const rangeTotal = wordsInRange(index, drill.range).length;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="px-4 pt-4">
        <div className="flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
            <div
              className="h-full rounded-full bg-accent-500 transition-[width] duration-300"
              style={{ width: `${total === 0 ? 0 : Math.round(((position - 1) / total) * 100)}%` }}
            />
          </div>
          <button type="button" onClick={onExit} className="btn-ghost h-11 text-sm">
            やめる
          </button>
        </div>

        <div className="mt-2 flex items-center justify-between text-sm">
          <span className="font-bold tabular-nums">
            {Math.min(position, total)} / {total}問
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
        instanceKey={`${question.word.id}-${shown.seq}`}
        phase={phase}
        onAnswer={handleAnswer}
        onContinue={goNext}
      />
    </div>
  );
}
