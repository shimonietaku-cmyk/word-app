// 画面下のタブ。親指で届く位置に置き、各ボタンは48px以上にする。

export type TabKey = 'home' | 'scope' | 'records' | 'settings';

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'home', label: 'ホーム', icon: '🏠' },
  { key: 'scope', label: '範囲', icon: '📚' },
  { key: 'records', label: '記録', icon: '📈' },
  { key: 'settings', label: '設定', icon: '⚙️' },
];

interface Props {
  current: TabKey;
  onChange: (tab: TabKey) => void;
}

export default function TabBar({ current, onChange }: Props) {
  return (
    <nav
      className="fixed bottom-0 left-1/2 z-20 w-full max-w-md -translate-x-1/2 border-t border-gray-200
                 bg-white/95 backdrop-blur dark:border-gray-800 dark:bg-gray-950/95"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="flex">
        {TABS.map((t) => {
          const active = t.key === current;
          return (
            <li key={t.key} className="flex-1">
              <button
                type="button"
                onClick={() => onChange(t.key)}
                aria-current={active ? 'page' : undefined}
                className={`tap flex w-full flex-col items-center justify-center gap-0.5 py-2 text-[11px] ${
                  active ? 'text-accent-500' : 'text-gray-400 dark:text-gray-500'
                }`}
              >
                <span className="text-xl leading-none" aria-hidden>
                  {t.icon}
                </span>
                <span className={active ? 'font-bold' : ''}>{t.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
