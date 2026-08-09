// Stage3：産出フェーズ。日本語を見て英語を書く。
// いきなりキーボード入力にすると負担が大きいので、まず「文字パネルの並べ替え」から始め、
// 2回成功したらキーボード入力に切り替わる。
//
// 発音はこの段階では「答え合わせの瞬間」に鳴らす（先に鳴らすと答えを教えてしまうため）。

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Word } from '../types';
import { judge, makeArrangePieces, normalize } from '../lib/judge';

interface Props {
  word: Word;
  mode: 'arrange' | 'type';
  disabled: boolean;
  onAnswer: (correct: boolean, elapsedMs: number) => void;
}

export default function Stage3Produce({ word, mode, disabled, onAnswer }: Props) {
  const startRef = useRef(0);
  const [used, setUsed] = useState<number[]>([]); // 並べ替えで選んだパネルの位置
  const [text, setText] = useState('');
  const [hint, setHint] = useState<string | null>(null); // 「おしい！」のときに出す正しい綴り
  const inputRef = useRef<HTMLInputElement>(null);

  const panel = useMemo(() => makeArrangePieces(word.en), [word.id, word.en]);
  const answerText = useMemo(() => normalize(word.en), [word.en]);

  useEffect(() => {
    setUsed([]);
    setText('');
    setHint(null);
    startRef.current = performance.now();
  }, [word.id]);

  const assembled = used.map((i) => panel.pieces[i]);
  const assembledText = panel.mode === 'char' ? assembled.join('') : assembled.join(' ');

  // --- 並べ替え：必要な数だけ並んだら自動で答え合わせ ---
  useEffect(() => {
    if (mode !== 'arrange' || disabled) return;
    if (used.length !== panel.answerPieces.length) return;
    const outcome = judge(assembledText, word.en);
    if (outcome.result === 'correct') {
      onAnswer(true, performance.now() - startRef.current);
    } else {
      // 並べ替えは選択肢が限られるので「おしい」は作らず、間違いとして正解を見せる
      onAnswer(false, performance.now() - startRef.current);
    }
    // assembledText を依存に入れると毎回走るので、選んだ数の変化だけを見る
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [used.length]);

  const tapPiece = (i: number) => {
    if (disabled || used.includes(i)) return;
    setUsed((prev) => [...prev, i]);
  };

  const undo = () => {
    if (disabled) return;
    setUsed((prev) => prev.slice(0, -1));
  };

  const submitTyped = () => {
    if (disabled || text.trim() === '') return;
    const outcome = judge(text, word.en);
    if (outcome.result === 'correct') {
      onAnswer(true, performance.now() - startRef.current);
    } else if (outcome.result === 'close' && hint === null) {
      // 惜しい入力は不正解にせず、正しい綴りを見せてもう一度入力してもらう
      setHint(outcome.normalizedAnswer);
      setText('');
      inputRef.current?.focus();
    } else {
      onAnswer(false, performance.now() - startRef.current);
    }
  };

  return (
    <div className="flex flex-1 flex-col">
      {/* 問題（日本語の訳を全部見せる） */}
      <div className="flex flex-col items-center justify-center gap-2 px-5 pt-6">
        <p className="text-xs text-gray-400">英語にしてみよう</p>
        {word.ja.map((j) => (
          <p key={j} className="text-center text-2xl font-bold leading-snug">
            {j}
          </p>
        ))}
        {word.note && <p className="text-xs text-gray-500">{word.note}</p>}
      </div>

      {mode === 'arrange' ? (
        <div className="flex flex-1 flex-col justify-end px-5 pb-6">
          {/* 並べた結果 */}
          <div className="mb-4 flex min-h-[64px] flex-wrap items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-gray-300 p-3 dark:border-gray-700">
            {assembled.length === 0 ? (
              <span className="text-sm text-gray-400">下の文字をタップして並べよう</span>
            ) : (
              assembled.map((p, i) => (
                <span
                  key={`${p}-${i}`}
                  className="rounded-lg bg-accent-500 px-2.5 py-1.5 text-lg font-bold text-white animate-pop"
                >
                  {p}
                </span>
              ))
            )}
          </div>

          {/* 文字パネル */}
          <div className="flex flex-wrap justify-center gap-2">
            {panel.pieces.map((p, i) => (
              <button
                key={`${p}-${i}`}
                type="button"
                disabled={disabled || used.includes(i)}
                onClick={() => tapPiece(i)}
                className={`tap min-w-[48px] rounded-xl border px-3 text-xl font-bold ${
                  used.includes(i)
                    ? 'border-gray-100 bg-gray-100 text-transparent dark:border-gray-800 dark:bg-gray-800'
                    : 'border-gray-300 bg-white text-gray-900 active:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:active:bg-gray-800'
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={undo}
            disabled={disabled || used.length === 0}
            className="btn-secondary mt-4 h-12 w-full"
          >
            1つ消す
          </button>
        </div>
      ) : (
        <div className="flex flex-1 flex-col justify-end px-5 pb-6">
          {hint && (
            <div className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-center dark:border-amber-700 dark:bg-amber-950">
              <p className="text-sm font-bold text-amber-700 dark:text-amber-300">おしい！</p>
              <p className="mt-1 text-3xl font-bold tracking-wide">{hint}</p>
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                この綴りをもう一度入力してみよう
              </p>
            </div>
          )}
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitTyped();
            }}
            disabled={disabled}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            inputMode="text"
            placeholder="英語を入力"
            className="h-14 w-full rounded-2xl border border-gray-300 bg-white px-4 text-xl
                       outline-none focus:border-accent-500 dark:border-gray-700 dark:bg-gray-900"
          />
          <button
            type="button"
            onClick={submitTyped}
            disabled={disabled || text.trim() === ''}
            className="btn-primary mt-3 h-14 w-full text-base"
          >
            こたえあわせ
          </button>
          <p className="mt-2 text-center text-[11px] text-gray-400">
            {answerText.includes(' ')
              ? `${answerText.split(' ').length}語（〜 や記号は入力しなくてOK）`
              : `${answerText.length}文字`}
          </p>
        </div>
      )}
    </div>
  );
}
