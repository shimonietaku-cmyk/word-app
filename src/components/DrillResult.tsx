// ドリルを1周し終えたときの画面。
// 正答率と、間違えた単語の一覧を出す。ここから「間違えた単語だけ」をすぐ回せる。

import type { DrillState } from '../types';
import type { WordIndex } from '../lib/words';
import { summarize } from '../lib/drill';

interface Props {
  drill: DrillState;
  index: WordIndex;
  tally: { correct: number; wrong: number };
  wrongIds: string[];
  onNextRound: () => void;
  onRetryWrong: () => void;
  onOpenList: () => void;
  onExit: () => void;
}

export default function DrillResult({
  drill,
  index,
  tally,
  wrongIds,
  onNextRound,
  onRetryWrong,
  onOpenList,
  onExit,
}: Props) {
  const answered = tally.correct + tally.wrong;
  const accuracy = answered === 0 ? 0 : Math.round((tally.correct / answered) * 100);
  const summary = summarize(index, drill);
  const perfect = tally.wrong === 0 && answered > 0;

  return (
    <div className="flex min-h-screen flex-col px-6 py-8">
      <div className="flex flex-1 flex-col items-center gap-5 text-center">
        <p className="animate-pop text-5xl">{perfect ? '🎉' : '💪'}</p>

        <h1 className="text-2xl font-bold leading-snug">
          {drill.wrongOnly
            ? 'まちがえた単語を一通りやりました'
            : `この範囲を${drill.round}周しました`}
        </h1>
        <p className="-mt-3 text-sm text-gray-500">
          {drill.range.grade}年 {drill.range.from}〜{drill.range.to}番
        </p>

        {/* 正答率 */}
        <div className="w-full card-surface p-5">
          <p className="text-4xl font-bold tabular-nums">{accuracy}%</p>
          <p className="mt-1 text-xs text-gray-500">
            {answered}問中 {tally.correct}問 正解
          </p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
            <div className="h-full rounded-full bg-accent-500" style={{ width: `${accuracy}%` }} />
          </div>
        </div>

        {/* 範囲全体の仕上がり */}
        <div className="w-full card-surface divide-y divide-gray-100 text-left dark:divide-gray-800">
          <Row label="2回続けて正解できた語" value={`${summary.solid} / ${summary.total} 語`} />
          <Row label="直前にまちがえた語" value={`${summary.wrongNow} 語`} />
          {summary.untouched > 0 && (
            <Row label="まだ出ていない語" value={`${summary.untouched} 語`} />
          )}
        </div>

        {/* 間違えた単語一覧 */}
        {wrongIds.length > 0 && (
          <div className="w-full text-left">
            <p className="mb-2 px-1 text-xs font-bold text-gray-500">
              まちがえた単語（{wrongIds.length}語）
            </p>
            <ul className="card-surface max-h-64 divide-y divide-gray-100 overflow-y-auto dark:divide-gray-800">
              {wrongIds.map((id) => {
                const w = index.byId.get(id);
                if (!w) return null;
                return (
                  <li key={id} className="flex items-baseline gap-3 px-4 py-2.5">
                    <span className="w-10 shrink-0 text-xs tabular-nums text-gray-400">
                      {index.numberOf.get(id)}番
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold">{w.en}</span>
                      <span className="block truncate text-xs text-gray-500">{w.jaMain}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-col gap-3">
        {wrongIds.length > 0 && (
          <button type="button" onClick={onRetryWrong} className="btn-primary h-14 w-full text-base">
            まちがえた{wrongIds.length}語だけ もう一度
          </button>
        )}
        <button
          type="button"
          onClick={onNextRound}
          className={`${wrongIds.length > 0 ? 'btn-secondary' : 'btn-primary'} h-14 w-full text-base`}
        >
          {drill.wrongOnly ? 'この範囲をもう1周する' : `${drill.round + 1}周目に入る`}
        </button>
        <div className="flex gap-3">
          <button type="button" onClick={onOpenList} className="btn-secondary h-12 flex-1 text-sm">
            単語ごとの状況
          </button>
          <button type="button" onClick={onExit} className="btn-secondary h-12 flex-1 text-sm">
            ホームにもどる
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-bold tabular-nums">{value}</span>
    </div>
  );
}
