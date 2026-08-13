// Stage2：想起フェーズ。選択肢を見ずに、頭の中で意味を思い出す。
// タップでカードを裏返し、「わかった／あやふや」を自分で申告する（左右スワイプでも可）。
//
// 解答時間は「問題が出てから裏返すまで」で測る。
// 裏返したあとのボタン操作の時間まで含めると、思い出す速さが正しく測れないため。

import { useEffect, useRef, useState } from 'react';
import type { Word } from '../types';
import { speak } from '../lib/speech';
import { useApp } from '../store/useStore';
import SpeakerButton from './SpeakerButton';

interface Props {
  word: Word;
  disabled: boolean;
  onAnswer: (correct: boolean, elapsedMs: number) => void;
}

export default function Stage2Recall({ word, disabled, onAnswer }: Props) {
  const { store } = useApp();
  const [flipped, setFlipped] = useState(false);
  const [dragX, setDragX] = useState(0);
  const startRef = useRef(0);
  const recallMsRef = useRef(0);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    setFlipped(false);
    setDragX(0);
    startRef.current = performance.now();
    // 可否の判断は speak() に任せる（理由は Stage1Choice のコメント参照）
    if (store.settings.audio) speak(word.en, true);
  }, [word.id, store.settings.audio, word.en]);

  const flip = () => {
    if (flipped || disabled) return;
    recallMsRef.current = performance.now() - startRef.current;
    setFlipped(true);
  };

  const answer = (correct: boolean) => {
    if (!flipped || disabled) return;
    onAnswer(correct, recallMsRef.current);
  };

  // --- 左右スワイプ ---
  const onTouchStart = (e: React.TouchEvent) => {
    if (!flipped) return;
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    setDragX(e.touches[0].clientX - touchStartX.current);
  };
  const onTouchEnd = () => {
    if (touchStartX.current === null) return;
    const dx = dragX;
    touchStartX.current = null;
    setDragX(0);
    if (Math.abs(dx) > 70) answer(dx > 0); // 右へ＝わかった / 左へ＝あやふや
  };

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 items-center justify-center px-5 py-4">
        <div
          role="button"
          tabIndex={0}
          onClick={flip}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') flip();
          }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          style={{ transform: `translateX(${dragX}px) rotate(${dragX / 40}deg)` }}
          className="card-surface flex min-h-[260px] w-full flex-col items-center justify-center gap-4 px-6 py-8 shadow-sm"
        >
          <h2 className="break-words text-center text-4xl font-bold leading-tight">{word.en}</h2>
          <SpeakerButton text={word.en} />

          {!flipped ? (
            <p className="mt-2 text-xs text-gray-400">タップして答えを見る</p>
          ) : (
            <div className="mt-2 w-full animate-fade-up border-t border-gray-200 pt-4 text-center dark:border-gray-800">
              {word.ja.map((j) => (
                <p key={j} className="text-lg font-medium leading-relaxed">
                  {j}
                </p>
              ))}
              {word.note && <p className="mt-2 text-xs text-gray-500">{word.note}</p>}
            </div>
          )}
        </div>
      </div>

      <div className="px-5 pb-6">
        {flipped ? (
          <>
            <p className="mb-2 text-center text-[11px] text-gray-400">
              左右にスワイプでも答えられます
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                disabled={disabled}
                onClick={() => answer(false)}
                className="btn-secondary h-14 flex-1 text-base"
              >
                あやふや
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => answer(true)}
                className="btn-primary h-14 flex-1 text-base"
              >
                わかった
              </button>
            </div>
          </>
        ) : (
          <button type="button" onClick={flip} className="btn-primary h-14 w-full text-base">
            答えを見る
          </button>
        )}
      </div>
    </div>
  );
}
