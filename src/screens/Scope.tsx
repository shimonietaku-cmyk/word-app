// 「範囲」画面。毎日モードで出題する学年・単元を決める。
// 単元の並びは words.json の登場順（＝教科書順）を必ず守る。
//
// テスト対策の範囲指定は、単元ではなく単語番号で指定する別画面（DrillSetup）が担当する。

import { useMemo, useState } from 'react';
import { useApp } from '../store/useStore';
import { unitKey } from '../lib/words';

export default function Scope() {
  const { index, store, update } = useApp();
  const [openGrade, setOpenGrade] = useState<number | null>(1);

  const units = index?.units ?? [];
  const selected = new Set(store.settings.scope.units);
  const grades = store.settings.scope.grades;

  const unitsByGrade = useMemo(() => {
    const map = new Map<number, typeof units>();
    for (const u of units) {
      const list = map.get(u.grade) ?? [];
      list.push(u);
      map.set(u.grade, list);
    }
    return map;
  }, [units]);

  const setScope = (nextGrades: number[], nextUnits: string[]) => {
    update((prev) => ({
      ...prev,
      settings: { ...prev.settings, scope: { grades: nextGrades, units: nextUnits } },
    }));
  };

  const toggleUnit = (key: string, grade: number) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    const nextGrades = next.size === 0 ? grades : [...new Set([...grades, grade])];
    setScope(nextGrades, [...next]);
  };

  /** 学年まるごとを選ぶ／外す（親チェックで子も全選択） */
  const toggleGradeAll = (grade: number) => {
    const gradeUnits = (unitsByGrade.get(grade) ?? []).map((u) => u.key);
    const allSelected = gradeUnits.every((k) => selected.has(k));
    const next = new Set(selected);
    for (const k of gradeUnits) {
      if (allSelected) next.delete(k);
      else next.add(k);
    }
    setScope([...new Set([...grades, grade])], [...next]);
  };

  const presets = [
    { label: '1年ぜんぶ', run: () => setScope([1], []) },
    { label: '2年ぜんぶ', run: () => setScope([2], []) },
    { label: '1・2年ぜんぶ', run: () => setScope([1, 2], []) },
    {
      label: '苦手な単語だけ',
      run: () => {
        const leechUnits = new Set<string>();
        for (const [id, card] of Object.entries(store.cards)) {
          if (!card.leech && card.wrong < 3) continue;
          const w = index?.byId.get(id);
          if (w) leechUnits.add(unitKey(w.grade, w.unit));
        }
        setScope([1, 2], [...leechUnits]);
      },
    },
    {
      label: '今週の復習',
      run: () => {
        // 直近7日以内に学習した単語がある単元にしぼる
        const limit = Date.now() - 7 * 86400000;
        const recent = new Set<string>();
        for (const [id, card] of Object.entries(store.cards)) {
          if (!card.lastSeen || new Date(card.lastSeen).getTime() < limit) continue;
          const w = index?.byId.get(id);
          if (w) recent.add(unitKey(w.grade, w.unit));
        }
        setScope([1, 2], [...recent]);
      },
    },
  ];

  const scopeSummary =
    selected.size === 0 ? `${grades.join('・')}年 ぜんぶ` : `${selected.size} 単元を選択中`;

  return (
    <div className="px-5 pt-6">
      <h1 className="text-lg font-bold">毎日モードの範囲</h1>
      <p className="mt-1 text-xs leading-relaxed text-gray-500">
        テスト対策の範囲は、ホームの「テスト対策」から番号で指定します。ここは毎日の積み上げ用です。
      </p>

      <p className="mt-3 text-sm text-gray-500">いま出題される範囲：{scopeSummary}</p>

      {/* プリセット */}
      <div className="mt-3 flex flex-wrap gap-2">
        {presets.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={p.run}
            className="tap rounded-full border border-gray-300 px-4 text-sm text-gray-700
                       active:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:active:bg-gray-800"
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* 学年 → 単元 */}
      <div className="mt-4 space-y-3 pb-4">
        {[1, 2].map((grade) => {
          const gradeUnits = unitsByGrade.get(grade) ?? [];
          const allSelected = gradeUnits.length > 0 && gradeUnits.every((u) => selected.has(u.key));
          return (
            <section key={grade} className="card-surface overflow-hidden">
              <div className="flex items-center">
                <button
                  type="button"
                  onClick={() => toggleGradeAll(grade)}
                  className="tap flex flex-1 items-center gap-3 px-4 py-3 text-left"
                >
                  <Check checked={allSelected} />
                  <span className="font-bold">{grade}年</span>
                  <span className="text-xs text-gray-400">
                    {gradeUnits.reduce((n, u) => n + u.count, 0)}語
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setOpenGrade(openGrade === grade ? null : grade)}
                  className="btn-ghost h-12 px-4 text-sm"
                >
                  {openGrade === grade ? '閉じる' : '単元を選ぶ'}
                </button>
              </div>

              {openGrade === grade && (
                <ul className="border-t border-gray-100 dark:border-gray-800">
                  {gradeUnits.map((u) => (
                    <li key={u.key}>
                      <button
                        type="button"
                        onClick={() => toggleUnit(u.key, grade)}
                        className="tap flex w-full items-center gap-3 px-4 py-2.5 text-left"
                      >
                        <Check checked={selected.has(u.key)} />
                        <span className="flex-1 text-sm">{u.unit}</span>
                        <span className="text-xs text-gray-400">{u.count}語</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Check({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-sm font-bold ${
        checked
          ? 'border-accent-500 bg-accent-500 text-white'
          : 'border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-900'
      }`}
    >
      {checked ? '✓' : ''}
    </span>
  );
}
