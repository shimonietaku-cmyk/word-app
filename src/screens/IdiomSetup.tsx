// 熟語モードの設定画面。
//
// 単語のドリルと違って範囲を番号で切らない。熟語は全部で240個ほどしかなく、
// 「教科書の何番から何番まで」より「ぜんぶを何周したか」のほうが役に立つため、
// 選ぶのは学年と出題形式だけにしている。

import { useMemo, useState } from 'react';
import type { IdiomMode, IdiomOptions } from '../types';
import { useApp } from '../store/useStore';
import { defaultIdiomOptions, entriesFor, startIdioms } from '../lib/idioms';

interface Props {
  onStart: () => void;
  onCancel: () => void;
}

const MODES: { key: IdiomMode; label: string; note: string }[] = [
  {
    key: 'auto',
    label: 'おまかせ',
    note: '正解を重ねるほど難しくなる。意味 → 例文 → 前置詞 → 日本語から英語の順',
  },
  { key: 'cloze', label: '例文の穴うめ', note: '文に合う熟語を選ぶ。使い方が身につく' },
  { key: 'slot', label: '前置詞ドリル', note: 'be good ( ) 〜 の形。テストで点になるところ' },
  { key: 'meaning', label: '意味だけ（最速）', note: '英語→日本語。とにかく数をこなしたいとき' },
  { key: 'reverse', label: '日本語から英語', note: '意味を見て熟語を選ぶ。いちばん難しい' },
];

export default function IdiomSetup({ onStart, onCancel }: Props) {
  const { idioms, store, update } = useApp();
  const current = store.idiom;

  const [options, setOptions] = useState<IdiomOptions>(
    () => current?.options ?? defaultIdiomOptions(),
  );

  const count = useMemo(
    () => (idioms ? entriesFor(idioms, options).length : 0),
    [idioms, options],
  );

  const toggleGrade = (grade: number) => {
    setOptions((prev) => {
      const has = prev.grades.includes(grade);
      const grades = has ? prev.grades.filter((g) => g !== grade) : [...prev.grades, grade].sort();
      // 0個になると出す熟語が無くなるので、最後の1つは外せないようにする
      return grades.length === 0 ? prev : { ...prev, grades };
    });
  };

  const start = () => {
    if (!idioms || count === 0) return;
    update((prev) => ({ ...prev, idiom: startIdioms(idioms, options, prev.idiom) }));
    onStart();
  };

  return (
    <div className="flex min-h-screen flex-col px-5 pt-5">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-bold">熟語モードの設定</h1>
        <button type="button" onClick={onCancel} className="btn-ghost h-11 text-sm">
          とじる
        </button>
      </header>

      <section className="mt-5">
        <h2 className="mb-2 px-1 text-xs font-bold text-gray-500">学年</h2>
        <div className="flex gap-3">
          {[1, 2].map((g) => {
            const on = options.grades.includes(g);
            return (
              <button
                key={g}
                type="button"
                onClick={() => toggleGrade(g)}
                aria-pressed={on}
                className={`tap flex-1 rounded-2xl border py-3 text-base font-bold ${
                  on
                    ? 'border-accent-500 bg-accent-500 text-white'
                    : 'border-gray-300 bg-white text-gray-500 dark:border-gray-700 dark:bg-gray-900'
                }`}
              >
                {g}年
              </button>
            );
          })}
        </div>
      </section>

      <section className="mt-5">
        <h2 className="mb-2 px-1 text-xs font-bold text-gray-500">出題のしかた</h2>
        <ul className="card-surface divide-y divide-gray-100 dark:divide-gray-800">
          {MODES.map((m) => {
            const on = options.mode === m.key;
            return (
              <li key={m.key}>
                <button
                  type="button"
                  onClick={() => setOptions((prev) => ({ ...prev, mode: m.key }))}
                  aria-pressed={on}
                  className="tap flex w-full items-start gap-3 px-4 py-3 text-left"
                >
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                      on ? 'border-accent-500' : 'border-gray-300 dark:border-gray-600'
                    }`}
                  >
                    {on && <span className="h-2.5 w-2.5 rounded-full bg-accent-500" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold">{m.label}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-gray-500">
                      {m.note}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-5">
        <button
          type="button"
          onClick={() =>
            setOptions((prev) => ({ ...prev, includeCompound: !prev.includeCompound }))
          }
          aria-pressed={options.includeCompound}
          className="card-surface tap flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <span className="min-w-0 pr-3">
            <span className="block text-sm font-bold">2語で1つの名詞も混ぜる</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-gray-500">
              post office・New York など。まずは熟語だけに絞るのがおすすめ
            </span>
          </span>
          <span
            className={`relative h-7 w-12 shrink-0 rounded-full transition ${
              options.includeCompound ? 'bg-accent-500' : 'bg-gray-300 dark:bg-gray-700'
            }`}
          >
            <span
              className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${
                options.includeCompound ? 'left-6' : 'left-1'
              }`}
            />
          </span>
        </button>
      </section>

      <div className="mt-auto py-6">
        <p className="mb-3 text-center text-sm text-gray-500">
          この設定で <span className="font-bold text-gray-900 dark:text-gray-100">{count}</span>{' '}
          個の熟語を1周します
        </p>
        <button
          type="button"
          onClick={start}
          disabled={count === 0}
          className="btn-primary h-16 w-full text-lg"
        >
          はじめる
        </button>
      </div>
    </div>
  );
}
