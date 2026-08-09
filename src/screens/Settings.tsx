// 「設定」画面。学習量の調整と、記録の書き出し・読み込み・全消去。

import { useRef, useState } from 'react';
import { useApp } from '../store/useStore';
import { exportStore } from '../lib/storage';
import ConfirmDialog from '../components/ConfirmDialog';

interface Props {
  onStartParentQuiz: () => void;
}

export default function Settings({ onStartParentQuiz }: Props) {
  const { store, update, resetAll, importFromText, speechAvailable } = useApp();
  const [confirmReset, setConfirmReset] = useState(false);
  const [message, setMessage] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof typeof store.settings>(key: K, value: (typeof store.settings)[K]) => {
    update((prev) => ({ ...prev, settings: { ...prev.settings, [key]: value } }));
  };

  const handleExport = () => {
    const blob = new Blob([exportStore(store)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wordclimb-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (file: File) => {
    const text = await file.text();
    setMessage(importFromText(text) ? '進捗を読み込みました。' : 'このファイルは読み込めませんでした。');
    window.setTimeout(() => setMessage(''), 4000);
  };

  return (
    <div className="px-5 pt-6">
      <h1 className="text-lg font-bold">設定</h1>

      <Group title="学習の量">
        <Choice
          label="1セッションの問題数"
          options={[10, 15, 20]}
          value={store.settings.sessionSize}
          onChange={(v) => set('sessionSize', v)}
          suffix="問"
        />
        <Choice
          label="1日の新しい単語の上限"
          options={[15, 20, 25]}
          value={store.settings.dailyNewLimit}
          onChange={(v) => set('dailyNewLimit', v)}
          suffix="語"
          note="増やしすぎると数日後の復習が増えて続きにくくなります。"
        />
        <Choice
          label="復習の多さ"
          options={[0.85, 0.9, 0.95]}
          labels={['少なめ', '標準', '多め']}
          value={store.settings.requestRetention}
          onChange={(v) => set('requestRetention', v)}
          note="「多め」にすると同じ単語が何度も出て、忘れにくくなります。"
        />
      </Group>

      <Group title="表示と音">
        <Row label="発音を鳴らす">
          <Toggle
            checked={store.settings.audio && speechAvailable}
            disabled={!speechAvailable}
            onChange={(v) => set('audio', v)}
          />
        </Row>
        {!speechAvailable && (
          <p className="px-4 pb-3 text-xs text-gray-400">
            この端末には英語の音声が入っていないため、読み上げは使えません。
          </p>
        )}
        <Choice
          label="ダークモード"
          options={['auto', 'light', 'dark'] as const}
          labels={['自動', 'ライト', 'ダーク']}
          value={store.settings.darkMode}
          onChange={(v) => set('darkMode', v)}
        />
      </Group>

      <Group title="親子クイズ">
        <p className="px-4 pb-3 text-xs leading-relaxed text-gray-500">
          親のスマホに英単語と答えを表示し、お子さんが口頭で答えるモードです。
          10問で終わります。成績は記録に反映されますが、復習の間隔は一律「ふつう」で計算します。
        </p>
        <button
          type="button"
          onClick={onStartParentQuiz}
          className="btn-secondary mx-4 mb-4 h-12 w-[calc(100%-2rem)]"
        >
          親子クイズをはじめる
        </button>
      </Group>

      <Group title="記録の管理">
        <button type="button" onClick={handleExport} className="tap w-full px-4 py-3.5 text-left text-sm">
          進捗を書き出す（JSONファイル）
        </button>
        <div className="border-t border-gray-100 dark:border-gray-800" />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="tap w-full px-4 py-3.5 text-left text-sm"
        >
          進捗を読み込む
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleImport(f);
            e.target.value = '';
          }}
        />
        <div className="border-t border-gray-100 dark:border-gray-800" />
        <button
          type="button"
          onClick={() => setConfirmReset(true)}
          className="tap w-full px-4 py-3.5 text-left text-sm text-red-500"
        >
          学習記録をすべて消す
        </button>
      </Group>

      {message && (
        <p className="mt-3 rounded-xl bg-gray-100 px-4 py-3 text-sm dark:bg-gray-800">{message}</p>
      )}

      <p className="mb-4 mt-6 text-center text-[11px] leading-relaxed text-gray-400">
        このアプリはインターネットに何も送りません。
        <br />
        記録はこの端末の中だけに保存されます。
      </p>

      <ConfirmDialog
        open={confirmReset}
        title="学習記録をすべて消しますか？"
        message="これまでの正誤・復習の予定・連続日数がすべて消えます。&#10;元にはもどせません。"
        confirmLabel="すべて消す"
        danger
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          resetAll();
          setConfirmReset(false);
          setMessage('学習記録を消しました。');
          window.setTimeout(() => setMessage(''), 4000);
        }}
      />
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h2 className="mb-2 px-1 text-xs font-bold text-gray-500">{title}</h2>
      <div className="card-surface overflow-hidden">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-sm">{label}</span>
      {children}
    </div>
  );
}

function Choice<T extends string | number>({
  label,
  options,
  labels,
  value,
  onChange,
  suffix = '',
  note,
}: {
  label: string;
  options: readonly T[];
  labels?: readonly string[];
  value: T;
  onChange: (v: T) => void;
  suffix?: string;
  note?: string;
}) {
  return (
    <div className="border-b border-gray-100 px-4 py-3 last:border-b-0 dark:border-gray-800">
      <p className="text-sm">{label}</p>
      <div className="mt-2 flex gap-2">
        {options.map((o, i) => (
          <button
            key={String(o)}
            type="button"
            onClick={() => onChange(o)}
            className={`tap flex-1 rounded-xl px-2 text-sm font-medium ${
              o === value
                ? 'bg-accent-500 text-white'
                : 'border border-gray-300 text-gray-600 dark:border-gray-700 dark:text-gray-300'
            }`}
          >
            {labels ? labels[i] : `${o}${suffix}`}
          </button>
        ))}
      </div>
      {note && <p className="mt-2 text-[11px] leading-relaxed text-gray-400">{note}</p>}
    </div>
  );
}

function Toggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`tap relative h-8 w-14 rounded-full transition ${
        checked ? 'bg-accent-500' : 'bg-gray-300 dark:bg-gray-700'
      } ${disabled ? 'opacity-40' : ''}`}
    >
      <span
        className={`absolute top-1 h-6 w-6 rounded-full bg-white transition-[left] ${
          checked ? 'left-7' : 'left-1'
        }`}
      />
    </button>
  );
}
