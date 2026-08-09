// 「範囲」画面。どの学年・単元を出題対象にするかを決める。
// 単元の並びは words.json の登場順（＝教科書順）を必ず守る。

import { useMemo, useState } from 'react';
import { useApp } from '../store/useStore';
import { unitKey } from '../lib/words';
import { dateKey } from '../lib/storage';
import { unmasteredCount, wordsInTestScope } from '../lib/session';
import { daysUntil } from '../lib/stats';

interface Props {
  onStartTest: () => void;
}

export default function Scope({ onStartTest }: Props) {
  const { index, store, update } = useApp();
  const [openGrade, setOpenGrade] = useState<number | null>(1);
  const [testUnits, setTestUnits] = useState<string[]>(store.testMode?.units ?? []);
  const [testDate, setTestDate] = useState(store.testMode?.testDate ?? '');
  const [tab, setTab] = useState<'scope' | 'test'>('scope');

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

  // --- テストモード ---
  const testStore = { ...store, testMode: { active: true, units: testUnits, testDate } };
  const testWords = index ? wordsInTestScope(index, testStore) : [];
  const remainingDays = daysUntil(testDate);

  const applyTestMode = () => {
    update((prev) => ({
      ...prev,
      testMode: { active: true, units: testUnits, testDate },
    }));
  };

  const clearTestMode = () => {
    setTestUnits([]);
    setTestDate('');
    update((prev) => ({ ...prev, testMode: null }));
  };

  return (
    <div className="px-5 pt-6">
      <h1 className="text-lg font-bold">範囲</h1>

      <div className="mt-3 flex gap-2">
        <TabBtn active={tab === 'scope'} onClick={() => setTab('scope')}>
          ふだんの範囲
        </TabBtn>
        <TabBtn active={tab === 'test'} onClick={() => setTab('test')}>
          テストモード
        </TabBtn>
      </div>

      {tab === 'scope' ? (
        <>
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
              const allSelected =
                gradeUnits.length > 0 && gradeUnits.every((u) => selected.has(u.key));
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
                            <span className="text-xs text-gray-400">
                              {u.parts.filter((p) => p !== null).length > 1 &&
                                `Part ${u.parts.filter((p) => p !== null).join('・')} / `}
                              {u.count}語
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        </>
      ) : (
        <div className="mt-4 space-y-4 pb-6">
          <p className="text-sm leading-relaxed text-gray-500">
            テスト範囲の単元と実施日を指定すると、復習の期限を無視してその範囲から出題します。
          </p>

          <label className="block">
            <span className="text-sm font-medium">テストの日</span>
            <input
              type="date"
              value={testDate}
              min={dateKey()}
              onChange={(e) => setTestDate(e.target.value)}
              className="mt-1 h-12 w-full rounded-2xl border border-gray-300 bg-white px-4
                         dark:border-gray-700 dark:bg-gray-900"
            />
          </label>

          <div>
            <p className="text-sm font-medium">テスト範囲の単元</p>
            <div className="mt-2 max-h-72 space-y-1 overflow-y-auto rounded-2xl border border-gray-200 p-2 dark:border-gray-800">
              {units.map((u) => (
                <button
                  key={u.key}
                  type="button"
                  onClick={() =>
                    setTestUnits((prev) =>
                      prev.includes(u.key) ? prev.filter((k) => k !== u.key) : [...prev, u.key],
                    )
                  }
                  className="tap flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left"
                >
                  <Check checked={testUnits.includes(u.key)} />
                  <span className="flex-1 text-sm">
                    {u.grade}年 {u.unit}
                  </span>
                  <span className="text-xs text-gray-400">{u.count}語</span>
                </button>
              ))}
            </div>
          </div>

          {testUnits.length > 0 && (
            <div className="card-surface p-4 text-sm">
              <p>
                範囲内の単語：<b>{testWords.length}</b>語
              </p>
              <p className="mt-1">
                まだ仕上がっていない単語：
                <b>{unmasteredCount(testWords, store)}</b>語
              </p>
              {testDate && (
                <p className="mt-1">
                  テストまで
                  <b>{remainingDays >= 0 ? ` あと${remainingDays}日` : ' 終了'}</b>
                </p>
              )}
            </div>
          )}

          <div className="flex gap-3">
            <button type="button" onClick={clearTestMode} className="btn-secondary h-12 flex-1">
              解除する
            </button>
            <button
              type="button"
              disabled={testUnits.length === 0}
              onClick={applyTestMode}
              className="btn-primary h-12 flex-1"
            >
              この範囲にする
            </button>
          </div>

          {store.testMode?.active && (
            <button type="button" onClick={onStartTest} className="btn-primary h-14 w-full text-base">
              テスト対策をはじめる
            </button>
          )}
        </div>
      )}
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

function TabBtn({
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
      className={`tap flex-1 rounded-xl px-3 text-sm font-medium ${
        active
          ? 'bg-accent-500 text-white'
          : 'border border-gray-300 text-gray-600 dark:border-gray-700 dark:text-gray-300'
      }`}
    >
      {children}
    </button>
  );
}
