// 手動で発音を聞き直すボタン。
// 英語の音声が使えない端末では表示しない（押しても何も起きないボタンを見せないため）。

import { speak } from '../lib/speech';
import { useApp } from '../store/useStore';

interface Props {
  text: string;
  size?: 'sm' | 'lg';
  className?: string;
}

export default function SpeakerButton({ text, size = 'lg', className = '' }: Props) {
  const { speechAvailable, store } = useApp();
  if (!speechAvailable || !store.settings.audio) return null;

  return (
    <button
      type="button"
      aria-label="発音を聞く"
      onClick={(e) => {
        e.stopPropagation();
        speak(text, store.settings.audio);
      }}
      className={`tap flex items-center justify-center rounded-full border border-gray-200 bg-white
                  text-gray-600 active:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300
                  dark:active:bg-gray-800 ${size === 'lg' ? 'h-12 w-12 text-xl' : 'h-11 w-11 text-base'} ${className}`}
    >
      🔊
    </button>
  );
}
