// 熟語を1周し終えたときの画面。
//
// ここで見せたいのは正答率よりも「全部の熟語をあと何個で1周できるか」。
// 熟語の数は決まっている（1・2年あわせて約240）ので、
// 終わりが見えると回数を重ねやすい。

import type { IdiomState } from '../types';
import type { IdiomIndex } from '../lib/idioms';
import { summarizeIdioms } from '../lib/idioms';

interface Props {
  state: IdiomState;
  index: IdiomIndex;
  tally: { correct: number; wrong: number };
  wrongIds: string[];
  onNextRound: () => void;
  onRetryWrong: () => void;
  onOpenList: () => void;
  onExit: () => void;
}

export default function IdiomResult({
  state,
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
  const summary = summarizeIdioms(index, state);
  const perfect = tally.wrong === 0 && answered > 0;

  return (
    <div className="flex min-h-screen flex-col px-6 py-8">
      <div className="flex flex-1 flex-col items-center gap-5 text-center">
        <p className="animate-pop text-5xl">{perfect ? '🎉' : '💪'}</p>

        <h1 className="text-2xl font-bold leading-snug">
          {state.wrongOnly ? 'まちがえた熟語を一通りやりました' : `熟語を${state.round}周しました`}
        </h1>
        <p className="-mt-3 text-sm text-gray-500">
          {summary.total}個ぜんぶが対象です
        </p>

        <div className="w-full card-surface p-5">
          <p className="text-4xl font-bold tabular-nums">{accuracy}%</p>
          <p className="mt-1 text-xs text-gray-500">
            {answered}問中 {tally.correct}問 正解
          </p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
            <div className="h-full rounded-full bg-accent-500" style={{ width: `${accuracy}%` }} />
          </div>
        </div>

        <div className="w-full card-surface divide-y divide-gray-100 text-left dark:divide-gray-800">
          <Row label="2回続けて正解できた熟語" value={`${summary.solid} / ${summary.total} 個`} />
          <Row label="直前にまちがえた熟語" value={`${summary.wrongNow} 個`} />
          {summary.untouched > 0 && (
            <Row label="まだ出ていない熟語" value={`${summary.untouched} 個`} />
          )}
        </div>

        {wrongIds.length > 0 && (
          <div className="w-full text-left">
            <p className="mb-2 px-1 text-xs font-bold text-gray-500">
              まちがえた熟語（{wrongIds.length}個）
            </p>
            <ul className="card-surface max-h-64 divide-y divide-gray-100 overflow-y-auto dark:divide-gray-800">
              {wrongIds.map((id) => {
                const entry = index.byId.get(id);
                const word = index.wordOf.get(id);
                if (!entry || !word) return null;
                return (
                  <li key={id} className="px-4 py-2.5">
                    <span className="block truncate text-sm font-bold">{entry.en}</span>
                    <span className="block truncate text-xs text-gray-500">{word.jaMain}</span>
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
            まちがえた{wrongIds.length}個だけ もう一度
          </button>
        )}
        <button
          type="button"
          onClick={onNextRound}
          className={`${wrongIds.length > 0 ? 'btn-secondary' : 'btn-primary'} h-14 w-full text-base`}
        >
          {state.wrongOnly ? 'もう1周する' : `${state.round + 1}周目に入る`}
        </button>
        <div className="flex gap-3">
          <button type="button" onClick={onOpenList} className="btn-secondary h-12 flex-1 text-sm">
            熟語ごとの状況
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
