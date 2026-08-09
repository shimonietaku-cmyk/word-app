// 今日の進み具合を表す円。画像を使わず、SVGだけで描く（読み込みの遅れやガタつきを避けるため）。

interface Props {
  value: number;
  max: number;
  label: string;
  sub?: string;
  size?: number;
}

export default function ProgressRing({ value, max, label, sub, size = 132 }: Props) {
  const ratio = max <= 0 ? 0 : Math.min(1, value / max);
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          className="fill-none stroke-gray-200 dark:stroke-gray-800"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
          className="fill-none stroke-accent-500 transition-[stroke-dashoffset] duration-300"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold tabular-nums">{label}</span>
        {sub && <span className="mt-0.5 text-[11px] text-gray-500">{sub}</span>}
      </div>
    </div>
  );
}
