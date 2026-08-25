// 熟語モードの1問ぶん（出題＋答え合わせ）。
//
// 役割は QuestionView（毎日モード・ドリル用）と同じ。
// ちがうのは、不正解のときに「熟語だけ」でなく「その熟語が入った文まるごと」を見せること。
// 熟語は文の中でしか意味が決まらないので、正解の形をここで必ず1回見せる。

import type { IdiomQuestion } from '../types';
import IdiomChoice, { BlankSentence } from './IdiomChoice';
import SpeakerButton from './SpeakerButton';

export type IdiomPhase = 'question' | 'correct' | 'wrong';

interface Props {
  question: IdiomQuestion;
  /** 同じ熟語が再登場したときに中身を作り直すための識別子 */
  instanceKey: string;
  phase: IdiomPhase;
  onAnswer: (correct: boolean, elapsedMs: number) => void;
  onContinue: () => void;
}

export default function IdiomQuestionView({
  question,
  instanceKey,
  phase,
  onAnswer,
  onContinue,
}: Props) {
  const { entry, word } = question;
  // 例文の空所に入る実際の形（"be interested in 〜" なら "am interested in"）。
  // どの形式でも、答え合わせでは例文をまるごと見せる
  const fills = entry.a.split('|');

  return (
    <>
      <div className="flex flex-1 flex-col">
        <IdiomChoice
          key={instanceKey}
          question={question}
          disabled={phase !== 'question'}
          onAnswer={onAnswer}
        />
      </div>

      {phase === 'correct' && (
        <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center">
          <div className="animate-pop rounded-full bg-green-500/90 px-8 py-6 text-4xl text-white shadow-lg">
            ○
          </div>
        </div>
      )}

      {phase === 'wrong' && (
        <div className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-md animate-fade-up">
          <div className="rounded-t-3xl border-t border-gray-200 bg-white p-5 shadow-2xl dark:border-gray-800 dark:bg-gray-900">
            <p className="text-xs text-gray-400">正解はこちら</p>

            <div className="mt-1 flex items-start gap-3">
              <div className="min-w-0 flex-1 text-left">
                <p className="break-words text-2xl font-bold">{entry.en}</p>
                <p className="mt-1 text-sm leading-relaxed">{word.ja.join('、')}</p>
              </div>
              <SpeakerButton text={question.speech} size="sm" />
            </div>

            {/* 例文。空所が埋まった形を見せる */}
            <div className="mt-3 rounded-2xl bg-gray-100 px-4 py-3 dark:bg-gray-800">
              <BlankSentence text={entry.q} size="compact" fill={fills} />
              <p className="mt-1.5 text-center text-xs leading-relaxed text-gray-500">{entry.ja}</p>
            </div>

            <button
              type="button"
              onClick={onContinue}
              className="btn-primary mt-4 h-14 w-full text-base"
            >
              わかった
            </button>
          </div>
        </div>
      )}
    </>
  );
}
