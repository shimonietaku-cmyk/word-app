// Stage1：受容フェーズ。英単語を見て、日本語の意味を4つから選ぶ。
// 問題が出た瞬間に発音を鳴らし、「音」と「意味」を結びつける。

import { useEffect, useRef, useState } from 'react';
import type { Word } from '../types';
import { speak } from '../lib/speech';
import { useApp } from '../store/useStore';
import SpeakerButton from './SpeakerButton';

interface Props {
  word: Word;
  choices: string[];
  disabled: boolean;
  onAnswer: (correct: boolean, elapsedMs: number) => void;
}

export default function Stage1Choice({ word, choices, disabled, onAnswer }: Props) {
  const { store, speechAvailable } = useApp();
  const [selected, setSelected] = useState<string | null>(null);
  const startRef = useRef(0);

  useEffect(() => {
    setSelected(null);
    startRef.current = performance.now();
    // 英→日のときは、問題が出た瞬間に自動再生する
    if (speechAvailable && store.settings.audio) speak(word.en, true);
  }, [word.id, speechAvailable, store.settings.audio, word.en]);

  const handle = (choice: string) => {
    if (disabled || selected !== null) return;
    setSelected(choice);
    onAnswer(choice === word.jaMain, performance.now() - startRef.current);
  };

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-5 py-6">
        <p className="text-xs text-gray-400">意味をえらぼう</p>
        <div className="flex items-center gap-3">
          <h2 className="break-words text-center text-4xl font-bold leading-tight">{word.en}</h2>
          <SpeakerButton text={word.en} />
        </div>
      </div>

      <div className="grid gap-3 px-5 pb-6">
        {choices.map((c) => {
          const isSelected = selected === c;
          const isAnswer = c === word.jaMain;
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
              className={`tap w-full rounded-2xl border px-4 py-3 text-left text-[15px] leading-snug transition ${tone}`}
            >
              {c}
            </button>
          );
        })}
      </div>
    </div>
  );
}
