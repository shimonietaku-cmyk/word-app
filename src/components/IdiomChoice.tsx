// 熟語モードの1問ぶんの表示。
//
// 4つの形式（意味・例文の空所・語句の空所・日→英）を1つの画面でまかなう。
// 形式が変わっても選択肢の位置と大きさは変えない。
// 毎回レイアウトが動くと、指の置き場所を探す時間だけで回転数が落ちるため。

import { useEffect, useRef, useState } from 'react';
import type { IdiomQuestion } from '../types';
import { BLANK } from '../lib/idioms';
import { speak } from '../lib/speech';
import { useApp } from '../store/useStore';
import SpeakerButton from './SpeakerButton';

interface Props {
  question: IdiomQuestion;
  disabled: boolean;
  onAnswer: (correct: boolean, elapsedMs: number) => void;
}

/** 形式ごとの「何をすればいいか」の一言 */
const INSTRUCTION: Record<IdiomQuestion['format'], string> = {
  meaning: '意味をえらぼう',
  cloze: '文に合う熟語をえらぼう',
  slot: 'あてはまる語をえらぼう',
  reverse: '英語をえらぼう',
};

export default function IdiomChoice({ question, disabled, onAnswer }: Props) {
  const { store } = useApp();
  const [selected, setSelected] = useState<string | null>(null);
  const startRef = useRef(0);

  useEffect(() => {
    setSelected(null);
    startRef.current = performance.now();
    // 英→日のときだけ、問題が出た瞬間に読み上げる。
    // 他の形式は答えそのものを読み上げてしまうので鳴らさない。
    if (question.format === 'meaning' && store.settings.audio) speak(question.speech, true);
  }, [question.entry.id, question.format, question.speech, store.settings.audio]);

  const handle = (choice: string) => {
    if (disabled || selected !== null) return;
    setSelected(choice);
    onAnswer(choice === question.answer, performance.now() - startRef.current);
  };

  // 選択肢が英語か日本語かで、読みやすい文字の大きさが変わる
  const choicesAreEnglish = question.format !== 'meaning';

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-5 py-6">
        <p className="text-xs text-gray-400">{INSTRUCTION[question.format]}</p>

        {question.format === 'meaning' ? (
          <div className="flex items-center gap-3">
            <h2 className="break-words text-center text-3xl font-bold leading-tight">
              {question.prompt}
            </h2>
            <SpeakerButton text={question.speech} />
          </div>
        ) : question.format === 'reverse' ? (
          <h2 className="break-words text-center text-2xl font-bold leading-snug">
            {question.prompt}
          </h2>
        ) : (
          <BlankSentence
            text={question.prompt}
            size={question.format === 'cloze' ? 'sentence' : 'heading'}
          />
        )}

        {question.hint && (
          <p className="max-w-full break-words text-center text-sm leading-relaxed text-gray-500">
            {question.hint}
          </p>
        )}
      </div>

      <div className="grid gap-3 px-5 pb-6">
        {question.choices.map((c) => {
          const isSelected = selected === c;
          const isAnswer = c === question.answer;
          let tone = 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900';
          if (selected !== null) {
            if (isAnswer) tone = 'border-green-400 bg-green-50 dark:border-green-600 dark:bg-green-950';
            else if (isSelected) tone = 'border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-950';
            else tone = 'border-gray-200 bg-white opacity-50 dark:border-gray-800 dark:bg-gray-900';
          }
          return (
            <button
              key={c}
              type="button"
              disabled={disabled || selected !== null}
              onClick={() => handle(c)}
              className={`tap w-full rounded-2xl border px-4 py-3 text-left leading-snug transition ${
                choicesAreEnglish ? 'text-base font-medium' : 'text-[15px]'
              } ${tone}`}
            >
              {c}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** "___" の部分を下線の空所として描く */
export function BlankSentence({
  text,
  size = 'sentence',
  fill,
}: {
  text: string;
  /** heading＝熟語そのもの / sentence＝出題中の例文 / compact＝答え合わせの中の例文 */
  size?: 'sentence' | 'heading' | 'compact';
  /** 空所に入れて見せる語（答え合わせのとき）。順番に使う */
  fill?: string[];
}) {
  const parts = text.split(BLANK);
  let filled = 0;
  const scale =
    size === 'heading' ? 'text-3xl' : size === 'compact' ? 'text-lg' : 'text-2xl';

  return (
    <p className={`max-w-full break-words text-center font-bold leading-relaxed ${scale}`}>
      {parts.map((part, i) => (
        <span key={i}>
          {i > 0 &&
            (fill ? (
              <span className="text-accent-500 underline decoration-accent-500/40 decoration-2 underline-offset-4">
                {fill[filled++] ?? ''}
              </span>
            ) : (
              // 高さを1文字ぶん取った空の箱にすると、下線がちょうど文字の足元にそろう
              <span
                className="mx-1 inline-block h-[0.9em] w-20 border-b-[3px] border-accent-500 align-baseline"
                role="img"
                aria-label="空所"
              />
            ))}
          {part}
        </span>
      ))}
    </p>
  );
}
