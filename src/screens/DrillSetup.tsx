// テスト範囲の指定画面。
//
// 学校の単語テストは「◯番〜◯番」で範囲が出るので、番号で直接指定できるようにする。
// 番号は学年ごとの通し番号（1年 1〜1115、2年 1〜846）で、教科書の並び順に対応する。

import { useMemo, useState } from 'react';
import type { DrillPreset, DrillRange } from '../types';
import { useApp } from '../store/useStore';
import {
  clampRange,
  defaultPresetName,
  rangeLabel,
  startDrill,
  wordCountOf,
  wordsInRange,
} from '../lib/drill';

interface Props {
  onStart: () => void;
  onCancel: () => void;
}

export default function DrillSetup({ onStart, onCancel }: Props) {
  const { index, store, update } = useApp();
  const current = store.drill.current;

  const [grade, setGrade] = useState<1 | 2>(current?.range.grade ?? 1);
  // 入力途中の空欄を許すため、数値ではなく文字列で持つ
  const [fromText, setFromText] = useState(String(current?.range.from ?? 1));
  const [toText, setToText] = useState(String(current?.range.to ?? 50));
  const [savedNotice, setSavedNotice] = useState('');

  const max = index ? wordCountOf(index, grade) : 0;

  const range: DrillRange = useMemo(() => {
    const from = Number(fromText) || 1;
    const to = Number(toText) || from;
    const raw: DrillRange = { grade, from, to };
    return index ? clampRange(index, raw) : raw;
  }, [fromText, toText, grade, index]);

  const words = useMemo(() => (index ? wordsInRange(index, range) : []), [index, range]);

  const bump = (which: 'from' | 'to', delta: number) => {
    const setter = which === 'from' ? setFromText : setToText;
    const value = which === 'from' ? range.from : range.to;
    setter(String(Math.min(Math.max(1, value + delta), max || 1)));
  };

  const applyRange = (r: DrillRange) => {
    setGrade(r.grade);
    setFromText(String(r.from));
    setToText(String(r.to));
  };

  const start = () => {
    if (!index) return;
    update((prev) => ({
      ...prev,
      drill: { ...prev.drill, current: startDrill(index, range, prev.drill.current) },
    }));
    onStart();
  };

  const savePreset = () => {
    if (!index) return;
    const preset: DrillPreset = {
      id: `p-${Date.now()}`,
      name: defaultPresetName(index, range),
      range,
    };
    update((prev) => ({
      ...prev,
      drill: { ...prev.drill, presets: [preset, ...prev.drill.presets].slice(0, 12) },
    }));
    setSavedNotice(`「${preset.name}」を保存しました`);
    window.setTimeout(() => setSavedNotice(''), 3000);
  };

  const removePreset = (id: string) => {
    update((prev) => ({
      ...prev,
      drill: { ...prev.drill, presets: prev.drill.presets.filter((p) => p.id !== id) },
    }));
  };

  return (
    <div className="flex min-h-screen flex-col px-5 pt-5">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-bold">テスト範囲をえらぶ</h1>
        <button type="button" onClick={onCancel} className="btn-ghost h-11 text-sm">
          とじる
        </button>
      </header>

      {/* 学年 */}
      <div className="mt-4 flex gap-2">
        {([1, 2] as const).map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setGrade(g)}
            className={`tap h-12 flex-1 rounded-xl text-base font-bold ${
              g === grade
                ? 'bg-accent-500 text-white'
                : 'border border-gray-300 text-gray-600 dark:border-gray-700 dark:text-gray-300'
            }`}
          >
            {g}年
            <span className="ml-1 text-xs font-normal">
              （{index ? wordCountOf(index, g) : 0}語）
            </span>
          </button>
        ))}
      </div>

      {/* 番号入力 */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <NumberField
          label="はじめ"
          value={fromText}
          max={max}
          onChange={setFromText}
          onBump={(d) => bump('from', d)}
        />
        <NumberField
          label="おわり"
          value={toText}
          max={max}
          onChange={setToText}
          onBump={(d) => bump('to', d)}
        />
      </div>

      <p className="mt-3 text-center text-sm">
        <b className="text-lg tabular-nums">{words.length}</b> 語が対象
        <span className="ml-2 text-gray-500">（{rangeLabel(range)}）</span>
      </p>

      {/* 範囲の中身を確認できるプレビュー */}
      {words.length > 0 && (
        <div className="mt-3 card-surface max-h-44 overflow-y-auto">
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {words.slice(0, 4).map((w) => (
              <PreviewRow key={w.id} n={index!.numberOf.get(w.id)!} en={w.en} unit={w.unit} />
            ))}
            {words.length > 8 && (
              <li className="px-4 py-1.5 text-center text-[11px] text-gray-400">
                … 他 {words.length - 8} 語 …
              </li>
            )}
            {words.length > 4 &&
              words
                .slice(-4)
                .map((w) => (
                  <PreviewRow key={w.id} n={index!.numberOf.get(w.id)!} en={w.en} unit={w.unit} />
                ))}
          </ul>
        </div>
      )}

      {/* プリセット */}
      <section className="mt-5">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold text-gray-500">保存した範囲</h2>
          <button
            type="button"
            onClick={savePreset}
            disabled={words.length === 0}
            className="btn-ghost h-10 text-xs text-accent-500"
          >
            ＋ いまの範囲を保存
          </button>
        </div>
        {savedNotice && <p className="mt-1 text-xs text-accent-500">{savedNotice}</p>}

        {store.drill.presets.length === 0 ? (
          <p className="mt-2 text-xs text-gray-400">
            よく使う範囲を保存しておくと、次から1タップで呼び出せます。
          </p>
        ) : (
          <ul className="mt-2 card-surface divide-y divide-gray-100 dark:divide-gray-800">
            {store.drill.presets.map((p) => (
              <li key={p.id} className="flex items-center">
                <button
                  type="button"
                  onClick={() => applyRange(p.range)}
                  className="tap min-w-0 flex-1 px-4 py-3 text-left"
                >
                  <span className="block truncate text-sm font-medium">{p.name}</span>
                  <span className="block text-xs text-gray-500">{rangeLabel(p.range)}</span>
                </button>
                <button
                  type="button"
                  aria-label={`${p.name} を削除`}
                  onClick={() => removePreset(p.id)}
                  className="btn-ghost h-12 px-4 text-lg"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="sticky bottom-0 mt-auto bg-gradient-to-t from-white via-white pb-6 pt-4 dark:from-gray-950 dark:via-gray-950">
        <button
          type="button"
          onClick={start}
          disabled={words.length === 0}
          className="btn-primary h-16 w-full text-lg"
        >
          この範囲ではじめる
        </button>
      </div>
    </div>
  );
}

function PreviewRow({ n, en, unit }: { n: number; en: string; unit: string }) {
  return (
    <li className="flex items-baseline gap-3 px-4 py-2">
      <span className="w-10 shrink-0 text-xs tabular-nums text-gray-400">{n}番</span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{en}</span>
      <span className="shrink-0 text-[11px] text-gray-400">{unit}</span>
    </li>
  );
}

/** 数字入力欄。スマホで数字キーボードが出るようにし、±ボタンでも動かせる */
function NumberField({
  label,
  value,
  max,
  onChange,
  onBump,
}: {
  label: string;
  value: string;
  max: number;
  onChange: (v: string) => void;
  onBump: (delta: number) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-bold text-gray-500">{label}</label>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={value}
        max={max}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
        onFocus={(e) => e.target.select()}
        className="mt-1 h-16 w-full rounded-2xl border border-gray-300 bg-white text-center text-3xl
                   font-bold tabular-nums outline-none focus:border-accent-500
                   dark:border-gray-700 dark:bg-gray-900"
      />
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={() => onBump(-10)} className="btn-secondary h-11 flex-1 text-sm">
          −10
        </button>
        <button type="button" onClick={() => onBump(10)} className="btn-secondary h-11 flex-1 text-sm">
          +10
        </button>
      </div>
    </div>
  );
}
