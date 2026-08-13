// 音声の診断画面。
//
// 「音が出ない」は端末ごとに原因が違い、画面を見ないと切り分けられない。
// そこで、この端末で何が起きているかをすべて表示し、まるごとコピーできるようにする。
// 息子さんの端末でこれを実行し、結果を送ってもらう前提。

import { useCallback, useEffect, useState } from 'react';
import {
  FAILURE_MESSAGE,
  collectDiagnostics,
  prepareVoices,
  testSpeak,
  unlockSpeech,
} from '../lib/speech';
import type { SpeechDiagnostics as Diag } from '../lib/speech';

interface Props {
  onExit: () => void;
}

export default function SpeechDiagnostics({ onExit }: Props) {
  const [diag, setDiag] = useState<Diag>(() => collectDiagnostics());
  const [log, setLog] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(() => setDiag(collectDiagnostics()), []);

  useEffect(() => {
    // 音声一覧は遅れて届くことがあるので、開いた直後に読み込みを促してから再表示する
    prepareVoices().then(refresh);
    const t = window.setInterval(refresh, 1500);
    return () => window.clearInterval(t);
  }, [refresh]);

  const runTest = async () => {
    // ここはボタンのタップの中。iOS のために必ず解錠してから鳴らす
    unlockSpeech();
    setLog((l) => ['▶ テスト再生をはじめます…', ...l]);
    const r = await testSpeak('apple');
    setLog((l) => [`${r.ok ? '✅' : '❌'} ${r.event}: ${r.detail}`, ...l]);
    refresh();
  };

  const report = buildReport(diag, log);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="min-h-screen px-5 pt-5">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-bold">音声の診断</h1>
        <button type="button" onClick={onExit} className="btn-ghost h-11 text-sm">
          とじる
        </button>
      </header>

      <p className="mt-2 text-xs leading-relaxed text-gray-500">
        「テスト再生」を押して、音が鳴るか確認してください。鳴らない場合は下の「結果をコピー」を押して、
        その内容をそのまま送ってもらえれば原因を特定できます。
      </p>

      <button type="button" onClick={runTest} className="btn-primary mt-4 h-16 w-full text-lg">
        🔊 テスト再生（apple）
      </button>

      {/* 判定 */}
      <div className="mt-4 card-surface divide-y divide-gray-100 dark:divide-gray-800">
        <Row label="読み上げ機能" ok={diag.supported} value={diag.supported ? '使える' : '使えない'} />
        <Row
          label="端末の音声データ"
          ok={diag.voiceCount > 0}
          value={`${diag.voiceCount} 個`}
        />
        <Row
          label="英語の音声"
          ok={diag.englishVoiceCount > 0}
          value={`${diag.englishVoiceCount} 個`}
        />
        <Row label="使用中の音声" ok={null} value={diag.selectedVoice} />
        <Row label="音声の解錠" ok={diag.unlocked} value={diag.unlocked ? '済み' : 'まだ'} />
      </div>

      {diag.lastFailure && (
        <p className="mt-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm leading-relaxed text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          {FAILURE_MESSAGE[diag.lastFailure]}
        </p>
      )}

      {/* 実行ログ */}
      {log.length > 0 && (
        <section className="mt-4">
          <h2 className="mb-2 px-1 text-xs font-bold text-gray-500">テスト結果</h2>
          <ul className="card-surface divide-y divide-gray-100 dark:divide-gray-800">
            {log.map((line, i) => (
              <li key={`${line}-${i}`} className="px-4 py-2 text-xs">
                {line}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 音声一覧 */}
      <section className="mt-4">
        <h2 className="mb-2 px-1 text-xs font-bold text-gray-500">
          この端末にある音声（{diag.voices.length}）
        </h2>
        {diag.voices.length === 0 ? (
          <p className="card-surface p-4 text-xs leading-relaxed text-gray-500">
            音声データが1つも見つかりません。Androidの場合は「設定 → システム → 言語と入力 →
            音声出力（テキスト読み上げ）」で Google テキスト読み上げエンジンと英語の音声データを
            インストールすると鳴るようになります。
          </p>
        ) : (
          <ul className="card-surface max-h-72 divide-y divide-gray-100 overflow-y-auto dark:divide-gray-800">
            {diag.voices.map((v) => (
              <li key={`${v.name}-${v.lang}`} className="flex items-baseline gap-2 px-4 py-2">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    v.lang.toLowerCase().startsWith('en') ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-700'
                  }`}
                />
                <span className="min-w-0 flex-1 truncate text-xs">{v.name}</span>
                <span className="shrink-0 text-[11px] text-gray-400">{v.lang}</span>
                <span className="shrink-0 text-[11px] text-gray-400">
                  {v.localService ? '内蔵' : 'ネット'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* コピー */}
      <button type="button" onClick={copy} className="btn-secondary mt-4 h-14 w-full">
        {copied ? '✓ コピーしました' : '結果をコピー'}
      </button>
      <textarea
        readOnly
        value={report}
        className="mt-3 h-40 w-full rounded-2xl border border-gray-300 bg-white p-3 font-mono text-[11px]
                   dark:border-gray-700 dark:bg-gray-900"
      />
      <p className="mb-8 mt-2 text-[11px] text-gray-400">
        コピーがうまくいかないときは、上の枠の文字を長押しして選択してください。
      </p>
    </div>
  );
}

function Row({ label, ok, value }: { label: string; ok: boolean | null; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <span className="shrink-0 text-sm text-gray-500">{label}</span>
      <span className="flex min-w-0 items-center gap-2">
        {ok !== null && <span aria-hidden>{ok ? '✅' : '❌'}</span>}
        <span className="truncate text-sm font-bold">{value}</span>
      </span>
    </div>
  );
}

/** 送ってもらう用のテキストを作る */
function buildReport(diag: Diag, log: string[]): string {
  const lines = [
    '--- WordClimb 音声診断 ---',
    `端末: ${diag.userAgent}`,
    `読み上げ対応: ${diag.supported}`,
    `音声の数: ${diag.voiceCount}（英語 ${diag.englishVoiceCount}）`,
    `使用中の音声: ${diag.selectedVoice}`,
    `解錠: ${diag.unlocked}`,
    `直近の失敗: ${diag.lastFailure ?? 'なし'}`,
    '',
    '[音声一覧]',
    ...(diag.voices.length === 0
      ? ['（なし）']
      : diag.voices.map((v) => `- ${v.name} / ${v.lang} / ${v.localService ? 'local' : 'network'}`)),
    '',
    '[テスト結果]',
    ...(log.length === 0 ? ['（未実行）'] : log),
  ];
  return lines.join('\n');
}
