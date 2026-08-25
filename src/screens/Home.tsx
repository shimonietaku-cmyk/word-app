// ホーム画面。
//
// 目的が「学校のテストで点を取ること」なので、いちばん上・いちばん大きい導線は
// テスト対策ドリル。毎日モードとストリークはその下に並べる。
// 1日の出題数に上限は設けず、やった分をそのまま実績として見せる。

import { useMemo } from 'react';
import { useApp } from '../store/useStore';
import { dateKey, todayHistory } from '../lib/storage';
import { displayStreak } from '../lib/streak';
import { dueCount } from '../lib/session';
import type { SessionMode } from '../lib/session';
import { answeredInRound, rangeLabel, summarize, wordsInRange } from '../lib/drill';
import { answeredInIdiomRound, entriesFor, summarizeIdioms } from '../lib/idioms';
import { unlockSpeech } from '../lib/speech';
import StreakCalendar from '../components/StreakCalendar';

interface Props {
  onStartDaily: (mode: SessionMode) => void;
  onStartDrill: () => void;
  onSetupDrill: () => void;
  onOpenDrillList: () => void;
  onStartIdioms: () => void;
  onSetupIdioms: () => void;
  onOpenIdiomList: () => void;
}

export default function Home({
  onStartDaily,
  onStartDrill,
  onSetupDrill,
  onOpenDrillList,
  onStartIdioms,
  onSetupIdioms,
  onOpenIdiomList,
}: Props) {
  const { store, index, idioms } = useApp();
  const history = todayHistory(store, dateKey());
  const streak = displayStreak(store.streak);
  const drill = store.drill.current;
  const idiom = store.idiom;

  const due = useMemo(() => (index ? dueCount(index, store) : 0), [index, store]);
  const summary = useMemo(() => (index ? summarize(index, drill) : null), [index, drill]);
  const rangeCount = useMemo(
    () => (index && drill ? wordsInRange(index, drill.range).length : 0),
    [index, drill],
  );

  const idiomSummary = useMemo(
    () => (idioms ? summarizeIdioms(idioms, idiom) : null),
    [idioms, idiom],
  );
  /** 設定していないときに「熟語は全部で何個か」を出すための数 */
  const idiomTotal = useMemo(
    () =>
      idioms
        ? entriesFor(idioms, { grades: [1, 2], includeCompound: false, mode: 'auto' }).length
        : 0,
    [idioms],
  );

  const accuracy =
    history.answered === 0 ? null : Math.round((history.correct / history.answered) * 100);

  // iOS Safari は「タップの中」で1回 speak しないと以後ずっと音が鳴らないので、
  // 画面遷移の起点になるここで必ず解錠しておく
  const go = (fn: () => void) => () => {
    unlockSpeech();
    fn();
  };

  return (
    <div className="px-5 pt-5">
      {/* 今日の実績（上限ではなく、やった分をそのまま出す） */}
      <section className="flex items-center justify-between rounded-2xl bg-gray-100 px-4 py-3 dark:bg-gray-900">
        <span className="text-xs text-gray-500">今日</span>
        <span className="flex items-baseline gap-4">
          <span className="text-base font-bold tabular-nums">
            {history.answered}
            <span className="ml-0.5 text-xs font-normal text-gray-500">問</span>
          </span>
          <span className="text-base font-bold tabular-nums">
            {accuracy === null ? '—' : `${accuracy}%`}
            <span className="ml-0.5 text-xs font-normal text-gray-500">正答率</span>
          </span>
        </span>
      </section>

      {/* ★主役：テスト対策ドリル */}
      <section className="mt-4">
        <h2 className="mb-2 px-1 text-xs font-bold text-accent-500">テスト対策</h2>

        {drill && summary ? (
          <div className="card-surface overflow-hidden">
            <div className="px-4 pt-4">
              <div className="flex items-baseline justify-between">
                <p className="text-base font-bold">{rangeLabel(drill.range)}</p>
                <p className="text-xs text-gray-500">{rangeCount}語</p>
              </div>

              <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
                {summary.solid > 0 && (
                  <span
                    className="bg-green-500"
                    style={{ width: `${(summary.solid / summary.total) * 100}%` }}
                  />
                )}
                {summary.correctNow - summary.solid > 0 && (
                  <span
                    className="bg-green-300 dark:bg-green-700"
                    style={{ width: `${((summary.correctNow - summary.solid) / summary.total) * 100}%` }}
                  />
                )}
                {summary.wrongNow > 0 && (
                  <span
                    className="bg-red-400"
                    style={{ width: `${(summary.wrongNow / summary.total) * 100}%` }}
                  />
                )}
              </div>

              <p className="mt-2 text-xs text-gray-500">
                {drill.wrongOnly ? 'まちがえた単語だけ' : `${drill.round}周目`}
                ：{answeredInRound(drill)} / {drill.roundTotal}問
                <span className="mx-1.5 text-gray-300 dark:text-gray-700">|</span>
                仕上がり {summary.solid} / {summary.total}語
              </p>
            </div>

            <button
              type="button"
              onClick={go(onStartDrill)}
              className="btn-primary mx-4 mt-3 h-20 w-[calc(100%-2rem)] text-xl shadow-lg shadow-accent-500/20"
            >
              {answeredInRound(drill) > 0 ? 'つづきから' : 'はじめる'}
            </button>

            <div className="mt-3 flex divide-x divide-gray-100 border-t border-gray-100 dark:divide-gray-800 dark:border-gray-800">
              <button type="button" onClick={onOpenDrillList} className="tap flex-1 py-3 text-sm">
                単語ごとの状況
              </button>
              <button type="button" onClick={onSetupDrill} className="tap flex-1 py-3 text-sm">
                範囲を変える
              </button>
            </div>
          </div>
        ) : (
          <div className="card-surface p-5 text-center">
            <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
              テスト範囲を「◯番〜◯番」で指定すると、
              <br />
              その範囲を1周ずつ確実に回せます。
            </p>
            <button
              type="button"
              onClick={onSetupDrill}
              className="btn-primary mt-4 h-16 w-full text-lg"
            >
              テスト範囲をえらぶ
            </button>
          </div>
        )}
      </section>

      {/* 熟語モード。単語より数が少なく終わりが見えるので、周回数を前に出す */}
      {idioms && idiomTotal > 0 && (
        <section className="mt-5">
          <h2 className="mb-2 px-1 text-xs font-bold text-accent-500">熟語</h2>

          {idiom && idiomSummary && idiomSummary.total > 0 ? (
            <div className="card-surface overflow-hidden">
              <div className="px-4 pt-4">
                <div className="flex items-baseline justify-between">
                  <p className="text-base font-bold">
                    {idiom.wrongOnly ? 'まちがえた熟語だけ' : `${idiom.round}周目`}
                  </p>
                  <p className="text-xs text-gray-500">{idiomSummary.total}個</p>
                </div>

                <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
                  {idiomSummary.solid > 0 && (
                    <span
                      className="bg-green-500"
                      style={{ width: `${(idiomSummary.solid / idiomSummary.total) * 100}%` }}
                    />
                  )}
                  {idiomSummary.correctNow - idiomSummary.solid > 0 && (
                    <span
                      className="bg-green-300 dark:bg-green-700"
                      style={{
                        width: `${((idiomSummary.correctNow - idiomSummary.solid) / idiomSummary.total) * 100}%`,
                      }}
                    />
                  )}
                  {idiomSummary.wrongNow > 0 && (
                    <span
                      className="bg-red-400"
                      style={{ width: `${(idiomSummary.wrongNow / idiomSummary.total) * 100}%` }}
                    />
                  )}
                </div>

                <p className="mt-2 text-xs text-gray-500">
                  この周：{answeredInIdiomRound(idiom)} / {idiom.roundTotal}問
                  <span className="mx-1.5 text-gray-300 dark:text-gray-700">|</span>
                  仕上がり {idiomSummary.solid} / {idiomSummary.total}個
                </p>
              </div>

              <button
                type="button"
                onClick={go(onStartIdioms)}
                className="btn-primary mx-4 mt-3 h-16 w-[calc(100%-2rem)] text-lg shadow-lg shadow-accent-500/20"
              >
                {answeredInIdiomRound(idiom) > 0 ? 'つづきから' : 'はじめる'}
              </button>

              <div className="mt-3 flex divide-x divide-gray-100 border-t border-gray-100 dark:divide-gray-800 dark:border-gray-800">
                <button type="button" onClick={onOpenIdiomList} className="tap flex-1 py-3 text-sm">
                  熟語ごとの状況
                </button>
                <button type="button" onClick={onSetupIdioms} className="tap flex-1 py-3 text-sm">
                  出しかたを変える
                </button>
              </div>
            </div>
          ) : (
            <div className="card-surface p-5 text-center">
              <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                get up・be good at 〜 のような熟語{idiomTotal}個を、
                <br />
                例文の穴うめや前置詞の選択で何周も回します。
              </p>
              <button
                type="button"
                onClick={go(onStartIdioms)}
                className="btn-primary mt-4 h-16 w-full text-lg"
              >
                熟語モードをはじめる
              </button>
              <button
                type="button"
                onClick={onSetupIdioms}
                className="btn-ghost mt-2 h-11 w-full text-xs"
              >
                出しかたを選んでから始める
              </button>
            </div>
          )}
        </section>
      )}

      {/* 毎日モード（副次的） */}
      <section className="mt-5">
        <h2 className="mb-2 px-1 text-xs font-bold text-gray-500">毎日の積み上げ</h2>
        <div className="card-surface p-4">
          <div className="flex items-baseline justify-between">
            <p className="text-base font-bold">
              {streak > 0 ? (
                <>
                  🔥 {streak}
                  <span className="ml-1 text-sm font-medium">日連続</span>
                </>
              ) : (
                <span className="text-sm">またここから 🌱</span>
              )}
            </p>
            <p className="text-[11px] text-gray-400">
              自己ベスト {store.streak.best}日
              {store.streak.freezes > 0 && ` ・ ❄️${store.streak.freezes}`}
            </p>
          </div>

          <div className="mt-3">
            <StreakCalendar streak={store.streak} />
          </div>

          <p className="mt-3 text-xs text-gray-500">
            復習まちの単語：
            <span className="font-bold text-gray-900 dark:text-gray-100">{due}</span>語
          </p>

          <div className="mt-3 flex gap-3">
            <button
              type="button"
              onClick={go(() => onStartDaily('mixed'))}
              className="btn-secondary h-12 flex-1 text-sm"
            >
              今日の{store.settings.sessionSize}問
            </button>
            <button
              type="button"
              onClick={go(() => onStartDaily('new'))}
              className="btn-secondary h-12 flex-1 text-sm"
            >
              新しい単語だけ
            </button>
          </div>
        </div>
      </section>

      <p className="mt-4 text-center text-[11px] text-gray-400">
        やった分だけ記録されます。上限はありません。
      </p>
    </div>
  );
}
