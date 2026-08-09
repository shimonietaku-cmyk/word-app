// 今月のカレンダー。学習した日のマスを塗る。
// 「できた日」が目に見えて増えていくことが続けるきっかけになる。他人とは比べない。

import { monthGrid } from '../lib/streak';
import type { StreakState } from '../types';

interface Props {
  streak: StreakState;
  now?: Date;
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

export default function StreakCalendar({ streak, now = new Date() }: Props) {
  const cells = monthGrid(streak, now);
  const firstWeekday = new Date(now.getFullYear(), now.getMonth(), 1).getDay();

  return (
    <div>
      <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] text-gray-400">
        {WEEKDAYS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {/* 月初の曜日ぶんだけ空けておく */}
        {Array.from({ length: firstWeekday }, (_, i) => (
          <span key={`pad-${i}`} />
        ))}
        {cells.map((c) => (
          <span
            key={c.date}
            title={c.date}
            className={[
              'flex aspect-square items-center justify-center rounded-md text-[11px] tabular-nums',
              c.studied
                ? 'bg-accent-500 font-bold text-white'
                : c.isFuture
                  ? 'bg-gray-50 text-gray-300 dark:bg-gray-900 dark:text-gray-700'
                  : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500',
              c.isToday && !c.studied ? 'ring-2 ring-accent-400' : '',
            ].join(' ')}
          >
            {c.day}
          </span>
        ))}
      </div>
    </div>
  );
}
