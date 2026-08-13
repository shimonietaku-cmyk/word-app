// 発音を聞くボタン。
//
// 以前は「英語の音声が見つからない端末ではボタンを隠す」作りだったが、
// Android は音声一覧が遅れて届くため、鳴るはずの端末でもボタンが消えてしまっていた。
// いまは常に表示し、鳴らなかったときだけ理由をその場に出す。

import { useEffect, useState } from 'react';
import { FAILURE_MESSAGE, getLastFailure, speak, subscribeSpeech } from '../lib/speech';
import type { SpeechFailure } from '../lib/speech';
import { useApp } from '../store/useStore';

interface Props {
  text: string;
  size?: 'sm' | 'lg';
  className?: string;
}

export default function SpeakerButton({ text, size = 'lg', className = '' }: Props) {
  const { store } = useApp();
  const [failure, setFailure] = useState<SpeechFailure>(null);
  const [showReason, setShowReason] = useState(false);

  useEffect(() => subscribeSpeech(() => setFailure(getLastFailure())), []);

  if (!store.settings.audio) return null;

  const handle = (e: React.MouseEvent) => {
    e.stopPropagation();
    // タップの中から直接呼ぶ（間に await や setTimeout を挟むと鳴らない端末がある）
    speak(text, true);
    // 失敗していれば、少し待ってから理由を出す（onerror は非同期で届く）
    window.setTimeout(() => {
      const f = getLastFailure();
      setFailure(f);
      setShowReason(Boolean(f));
    }, 600);
  };

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label="発音を聞く"
        onClick={handle}
        className={`tap flex items-center justify-center rounded-full border border-gray-200 bg-white
                    text-gray-600 active:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300
                    dark:active:bg-gray-800 ${size === 'lg' ? 'h-12 w-12 text-xl' : 'h-11 w-11 text-base'} ${className}`}
      >
        🔊
      </button>

      {showReason && failure && (
        <span
          role="status"
          className="absolute left-1/2 top-full z-40 mt-2 w-64 -translate-x-1/2 rounded-xl border
                     border-amber-300 bg-amber-50 p-3 text-left text-[11px] leading-relaxed text-amber-800
                     shadow-lg dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
          onClick={() => setShowReason(false)}
        >
          {FAILURE_MESSAGE[failure]}
        </span>
      )}
    </span>
  );
}
