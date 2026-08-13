// 出題範囲の単語を、番号順に一覧で見る画面。
// どこまで進んだか・どれが苦手かを一目で分かるようにする。

import { useMemo, useState } from 'react';
import { useApp } from '../store/useStore';
import { statOf, summarize, wordsInRange } from '../lib/drill';

interface Props {
  onExit: () => void;
}

type Filter = 'all' | 'wrong' | 'untouched';

export default function DrillList({ onExit }: Props) {
  const { index, store } = useApp();
  const drill = store.drill.current;
  const [filter, setFilter] = useState<Filter>('all');

  const words = useMemo(
    () => (index && drill ? wordsInRange(index, drill.range) : []),
    [index, drill],
  );
  const summary = useMemo(() => (index ? summarize(index, drill) : null), [index, drill]);

  if (!drill || !index || !summary) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-8 text-center">
        <p className="text-lg font-bold">出題範囲が設定されていません</p>
        <button className="btn-primary h-12 px-8" onClick={onExit}>
          もどる
        </button>
      </div>
    );
  }

  const filtered = words.filter((w) => {
    const s = statOf(drill, w.id);
    if (filter === 'wrong') return s.last === 'wrong';
    if (filter === 'untouched') return s.asked === 0;
    return true;
  });

  return (
    <div className="min-h-screen px-5 pt-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">単語ごとの状況</h1>
          <p className="text-xs text-gray-500">
            {drill.range.grade}年 {drill.range.from}〜{drill.range.to}番 ／ {drill.round}周目
          </p>
        </div>
        <button type="button" onClick={onExit} className="btn-ghost h-11 text-sm">
          とじる
        </button>
      </header>

      {/* 全体の進み具合 */}
      <div className="mt-4 card-surface p-4">
        <div className="flex h-3 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
          <Bar n={summary.solid} total={summary.total} className="bg-green-500" />
          <Bar
            n={summary.correctNow - summary.solid}
            total={summary.total}
            className="bg-green-300 dark:bg-green-700"
          />
          <Bar n={summary.wrongNow} total={summary.total} className="bg-red-400" />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-y-1 text-xs">
          <Legend color="bg-green-500" label="仕上がり（2回連続正解）" value={summary.solid} />
          <Legend color="bg-green-300 dark:bg-green-700" label="正解した" value={summary.correctNow - summary.solid} />
          <Legend color="bg-red-400" label="まちがえた" value={summary.wrongNow} />
          <Legend color="bg-gray-300 dark:bg-gray-700" label="まだ出ていない" value={summary.untouched} />
        </div>
      </div>

      {/* 絞り込み */}
      <div className="mt-4 flex gap-2">
        <FilterBtn active={filter === 'all'} onClick={() => setFilter('all')}>
          ぜんぶ（{words.length}）
        </FilterBtn>
        <FilterBtn active={filter === 'wrong'} onClick={() => setFilter('wrong')}>
          まちがえた（{summary.wrongNow}）
        </FilterBtn>
        <FilterBtn active={filter === 'untouched'} onClick={() => setFilter('untouched')}>
          未出題（{summary.untouched}）
        </FilterBtn>
      </div>

      {/* 番号順の一覧 */}
      <ul className="mt-3 card-surface mb-8 divide-y divide-gray-100 dark:divide-gray-800">
        {filtered.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-gray-400">
            この条件に当てはまる単語はありません。
          </li>
        )}
        {filtered.map((w) => {
          const s = statOf(drill, w.id);
          return (
            <li key={w.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="w-10 shrink-0 text-xs tabular-nums text-gray-400">
                {index.numberOf.get(w.id)}
              </span>
              <span
                aria-hidden
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                  s.asked === 0
                    ? 'bg-gray-300 dark:bg-gray-700'
                    : s.last === 'wrong'
                      ? 'bg-red-400'
                      : s.streak >= 2
                        ? 'bg-green-500'
                        : 'bg-green-300 dark:bg-green-700'
                }`}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">{w.en}</span>
                <span className="block truncate text-xs text-gray-500">
                  {w.jaMain}
                  <span className="ml-1 text-gray-400">（{w.unit}）</span>
                </span>
              </span>
              <span className="shrink-0 text-right text-[11px] tabular-nums text-gray-400">
                {s.asked === 0 ? (
                  '—'
                ) : (
                  <>
                    ○{s.correct} ✗{s.wrong}
                    {s.streak >= 2 && <span className="ml-1 text-green-500">連{s.streak}</span>}
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Bar({ n, total, className }: { n: number; total: number; className: string }) {
  if (n <= 0 || total <= 0) return null;
  return <span className={className} style={{ width: `${(n / total) * 100}%` }} />;
}

function Legend({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${color}`} />
      <span className="text-gray-500">{label}</span>
      <span className="font-bold tabular-nums">{value}</span>
    </span>
  );
}

function FilterBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`tap flex-1 rounded-xl px-2 text-xs font-medium ${
        active
          ? 'bg-accent-500 text-white'
          : 'border border-gray-300 text-gray-600 dark:border-gray-700 dark:text-gray-300'
      }`}
    >
      {children}
    </button>
  );
}
