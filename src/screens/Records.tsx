// 「記録」画面。他人との比較・順位は一切出さない。すべて自分の積み上げだけを見せる。

import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApp } from '../store/useStore';
import { last30Days, leechWords, toughWords, unitProgress } from '../lib/stats';

interface Props {
  onGoScope: () => void;
  onStartLeech: () => void;
}

export default function Records({ onGoScope, onStartLeech }: Props) {
  const { index, store, update } = useApp();

  const progress = useMemo(() => (index ? unitProgress(index, store) : []), [index, store]);
  const daily = useMemo(() => last30Days(store), [store]);
  const tough = useMemo(() => (index ? toughWords(index, store) : []), [index, store]);
  const leeches = useMemo(() => (index ? leechWords(index, store) : []), [index, store]);

  const totalAnswered = daily.reduce((n, d) => n + d.answered, 0);

  /** ヒートマップのマスをタップすると、その単元を出題範囲にする */
  const focusUnit = (key: string, grade: number) => {
    update((prev) => ({
      ...prev,
      settings: { ...prev.settings, scope: { grades: [grade], units: [key] } },
    }));
    onGoScope();
  };

  return (
    <div className="px-5 pt-6">
      <h1 className="text-lg font-bold">記録</h1>

      {/* 単元別の習熟度ヒートマップ */}
      <section className="mt-4">
        <h2 className="text-sm font-bold">単元べつの仕上がり</h2>
        <p className="mt-1 text-[11px] text-gray-400">
          🟩 書ける ／ 🟨 思い出せる ／ 🟧 見て分かる ／ ⬜️ まだ　（タップでその単元を範囲にする）
        </p>
        <div className="mt-2 space-y-3">
          {[1, 2].map((grade) => {
            const items = progress.filter((p) => p.info.grade === grade);
            if (items.length === 0) return null;
            return (
              <div key={grade}>
                <p className="mb-1 text-xs text-gray-500">{grade}年</p>
                <div className="grid grid-cols-6 gap-1.5">
                  {items.map((p) => (
                    <button
                      key={p.info.key}
                      type="button"
                      title={`${p.info.unit}（${Math.round(p.ratio * 100)}%）`}
                      onClick={() => focusUnit(p.info.key, grade)}
                      className="flex aspect-square flex-col items-center justify-center rounded-lg text-[9px] leading-tight"
                      style={{ backgroundColor: heatColor(p.ratio) }}
                    >
                      <span className="font-bold text-gray-800">{shortUnit(p.info.unit)}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 直近30日の学習量 */}
      <section className="mt-6">
        <h2 className="text-sm font-bold">この30日の学習量</h2>
        {totalAnswered === 0 ? (
          <p className="mt-2 text-sm text-gray-400">まだ記録がありません。1回やると出てきます。</p>
        ) : (
          <div className="mt-2 h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={daily} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={6} stroke="#9ca3af" />
                <YAxis tick={{ fontSize: 9 }} stroke="#9ca3af" allowDecimals={false} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 12 }}
                  formatter={(v: number) => [`${v}問`, '解いた数']}
                  labelFormatter={(l) => `${l}`}
                />
                <Bar dataKey="answered" fill="#3366f2" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* 苦手単語 */}
      <section className="mt-6 pb-4">
        <h2 className="text-sm font-bold">苦手な単語 トップ20</h2>
        {tough.length === 0 ? (
          <p className="mt-2 text-sm text-gray-400">いまのところ苦手な単語はありません。</p>
        ) : (
          <>
            <ul className="card-surface mt-2 divide-y divide-gray-100 dark:divide-gray-800">
              {tough.map((t) => (
                <li key={t.word.id} className="flex items-center justify-between px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{t.word.en}</p>
                    <p className="truncate text-xs text-gray-500">{t.word.jaMain}</p>
                  </div>
                  <span className="ml-3 shrink-0 text-xs tabular-nums text-gray-400">
                    ✗{t.wrong} / ○{t.correct}
                  </span>
                </li>
              ))}
            </ul>
            {leeches.length > 0 && (
              <button type="button" onClick={onStartLeech} className="btn-primary mt-3 h-14 w-full text-base">
                ここだけ特訓する（{leeches.length}語）
              </button>
            )}
          </>
        )}
      </section>
    </div>
  );
}

/** 仕上がり具合を色にする。緑に近いほど仕上がっている */
function heatColor(ratio: number): string {
  if (ratio <= 0) return '#e5e7eb'; // グレー：未着手
  if (ratio < 0.34) return '#fdba74'; // 橙：Stage1
  if (ratio < 0.67) return '#fde047'; // 黄：Stage2
  return '#86efac'; // 緑：Stage3到達
}

/**
 * マスに収まるよう単元名を短くする。
 * "Unit 3" → "U3" ／ "World Tour 1" → "WT1" ／ "Let's Be Friends!" → "LBF"
 */
function shortUnit(unit: string): string {
  const m = unit.match(/^Unit (\d+)/);
  if (m) return `U${m[1]}`;

  // 末尾の番号を先に切り離してから頭文字を作る（切り離さないと番号が二重になる）
  const num = unit.match(/(\d+)\s*$/)?.[1] ?? '';
  const initials = unit
    .replace(/\d+\s*$/, '')
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .filter((c) => /[A-Za-z]/.test(c))
    .join('')
    .slice(0, 3);
  return `${initials}${num}`;
}
