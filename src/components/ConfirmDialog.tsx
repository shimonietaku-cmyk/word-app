// 取り消せない操作（全消去など）の前に必ず出す確認ダイアログ。

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'OK',
  danger = false,
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6"
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
    >
      <div
        className="card-surface w-full max-w-sm p-5 shadow-xl animate-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-bold">{title}</h2>
        <p className="mt-2 whitespace-pre-line text-sm text-gray-600 dark:text-gray-300">{message}</p>
        <div className="mt-5 flex gap-3">
          <button type="button" className="btn-secondary h-12 flex-1" onClick={onCancel}>
            キャンセル
          </button>
          <button
            type="button"
            className={`tap flex h-12 flex-1 items-center justify-center rounded-2xl px-5 font-bold text-white ${
              danger ? 'bg-red-500 active:bg-red-600' : 'bg-accent-500 active:bg-accent-600'
            }`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
