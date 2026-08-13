// 1問ぶんの表示。Stageに応じた出題と、正解・不正解のフィードバックを担当する。
//
// 毎日モードとテスト対策ドリルの両方から使う共通部品。
// 「どの問題を出すか」は呼び出し側が決め、ここは「出された1問を見せる」ことだけを行う。

import type { Question } from '../types';
import Stage1Choice from './Stage1Choice';
import Stage2Recall from './Stage2Recall';
import Stage3Produce from './Stage3Produce';
import SpeakerButton from './SpeakerButton';

export type QuestionPhase = 'question' | 'correct' | 'wrong';

interface Props {
  question: Question;
  /** 同じ単語が再登場したときに中身を作り直すための識別子 */
  instanceKey: string;
  phase: QuestionPhase;
  onAnswer: (correct: boolean, elapsedMs: number) => void;
  /** 不正解の「わかった」を押したとき */
  onContinue: () => void;
}

export default function QuestionView({ question, instanceKey, phase, onAnswer, onContinue }: Props) {
  const disabled = phase !== 'question';

  return (
    <>
      <div className="flex flex-1 flex-col">
        {question.stage === 1 && (
          <Stage1Choice
            key={instanceKey}
            word={question.word}
            choices={question.choices ?? []}
            disabled={disabled}
            onAnswer={onAnswer}
          />
        )}
        {question.stage === 2 && (
          <Stage2Recall
            key={instanceKey}
            word={question.word}
            disabled={disabled}
            onAnswer={onAnswer}
          />
        )}
        {question.stage === 3 && (
          <Stage3Produce
            key={instanceKey}
            word={question.word}
            mode={question.produceMode ?? 'arrange'}
            disabled={disabled}
            onAnswer={onAnswer}
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
              <p className="break-words text-3xl font-bold">{question.word.en}</p>
              <SpeakerButton text={question.word.en} size="sm" />
            </div>
            <p className="mt-2 text-base leading-relaxed">{question.word.ja.join('、')}</p>
            {question.word.note && (
              <p className="mt-1 text-xs text-gray-500">{question.word.note}</p>
            )}
            <button type="button" onClick={onContinue} className="btn-primary mt-4 h-14 w-full text-base">
              わかった
            </button>
          </div>
        </div>
      )}
    </>
  );
}
