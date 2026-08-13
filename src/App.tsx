// アプリの土台。単語データの読み込み、記録の保存、画面の切り替えをここで行う。

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AnswerResult, Store } from './types';
import { AppContext } from './store/useStore';
import type { AppState } from './store/useStore';
import { buildIndex, loadWords } from './lib/words';
import type { WordIndex } from './lib/words';
import {
  createCardState,
  createInitialStore,
  dateKey,
  importStore,
  loadStore,
  pruneCards,
  saveStore,
  clearStore,
} from './lib/storage';
import { ratingFor, reviewCard } from './lib/scheduler';
import { applyAnswer } from './lib/stage';
import { grantFreezes, markStudied } from './lib/streak';
import { prepareVoices } from './lib/speech';
import TabBar from './components/TabBar';
import type { TabKey } from './components/TabBar';
import Home from './screens/Home';
import Scope from './screens/Scope';
// 「記録」画面はグラフ描画ライブラリが重いので、開いたときにだけ読み込む
// （最初の表示を軽くするため）
const Records = lazy(() => import('./screens/Records'));
import Settings from './screens/Settings';
import Session from './screens/Session';
import DrillSession from './screens/DrillSession';
import DrillSetup from './screens/DrillSetup';
import DrillList from './screens/DrillList';
import SpeechDiagnostics from './screens/SpeechDiagnostics';
import ParentQuiz from './screens/ParentQuiz';
import type { SessionMode } from './lib/session';

/** 全画面で開く画面（タブバーを隠すもの） */
type Overlay =
  | { kind: 'daily'; mode: SessionMode }
  | { kind: 'drill' }
  | { kind: 'drill-setup' }
  | { kind: 'drill-list' }
  | { kind: 'speech' }
  | { kind: 'parent-quiz' }
  | null;

export default function App() {
  const [status, setStatus] = useState<AppState['status']>('loading');
  const [error, setError] = useState('');
  const [words, setWords] = useState<AppState['words']>([]);
  const [index, setIndex] = useState<WordIndex | null>(null);
  const [store, setStore] = useState<Store>(() => createInitialStore());
  const [tab, setTab] = useState<TabKey>('home');
  const [overlay, setOverlay] = useState<Overlay>(null);

  // 保存は「変更のたび」に行うが、連続入力で書き込みが増えすぎないよう少しまとめる
  const saveTimer = useRef<number | null>(null);

  // --- 起動時：単語データと記録を読み込む ---
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await loadWords(import.meta.env.BASE_URL);
        if (cancelled) return;
        const idx = buildIndex(data);
        const loaded = pruneCards(loadStore(), data);
        // 週1回のフリーズ付与はここで判定する
        const withFreezes = { ...loaded, streak: grantFreezes(loaded.streak) };
        setWords(data);
        setIndex(idx);
        setStore(withFreezes);
        setStatus('ready');
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : '読み込みに失敗しました');
        setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // --- 読み上げの準備（英語音声があるかどうか） ---
  useEffect(() => {
    // 音声一覧の読み込みを促しておく（Android は遅れて届くので、結果は待たずに進む）
    void prepareVoices();
  }, []);

  // --- ダークモードの反映 ---
  useEffect(() => {
    const apply = () => {
      const mode = store.settings.darkMode;
      const dark =
        mode === 'dark' ||
        (mode === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.classList.toggle('dark', dark);
    };
    apply();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [store.settings.darkMode]);

  // --- 記録の保存 ---
  const persist = useCallback((next: Store) => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveStore(next);
      saveTimer.current = null;
    }, 120);
  }, []);

  const update = useCallback(
    (updater: (prev: Store) => Store) => {
      setStore((prev) => {
        const next = updater(prev);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  /** 1問ぶんの解答を記録に反映する */
  const recordAnswer = useCallback(
    (result: AnswerResult) => {
      update((prev) => {
        const now = new Date();
        const today = dateKey(now);
        const existing = prev.cards[result.wordId] ?? createCardState(now);

        // 最後の再出題ぶんは、実力を過大評価しないよう FSRS にも統計にも反映しない
        if (result.isRetry) {
          return { ...prev, cards: { ...prev.cards, [result.wordId]: { ...existing, lastSeen: now.toISOString() } } };
        }

        // Stage とカウンタの更新
        const staged = applyAnswer(
          existing,
          {
            correct: result.correct,
            elapsedMs: result.elapsedMs,
            stage: result.stage,
            arranged: result.stage === 3,
          },
          now,
        );
        // 次の復習日の更新
        const rating = ratingFor(result.correct, result.elapsedMs, result.stage);
        const fsrs = reviewCard(existing.fsrs, rating, now, prev.settings.requestRetention);

        // 今日の履歴
        const history = [...prev.history];
        const i = history.findIndex((h) => h.date === today);
        const entry = i >= 0 ? { ...history[i] } : { date: today, answered: 0, correct: 0, newLearned: 0 };
        entry.answered += 1;
        if (result.correct) entry.correct += 1;
        if (result.isNew) entry.newLearned += 1;
        if (i >= 0) history[i] = entry;
        else history.push(entry);

        return {
          ...prev,
          cards: { ...prev.cards, [result.wordId]: { ...staged, fsrs } },
          history: history.slice(-400), // 記録は直近400日ぶんだけ持つ
        };
      });
    },
    [update],
  );

  /** セッションを終えたときにストリークを更新する */
  const finishSession = useCallback(
    (answered: number) => {
      update((prev) => {
        const today = dateKey();
        // recordAnswer で履歴はすでに更新済み。その日の合計で判定する
        const answeredToday = Math.max(prev.history.find((h) => h.date === today)?.answered ?? 0, answered);
        // その日 sessionSize 以上を回答したら「学習した日」とみなす
        if (answeredToday < prev.settings.sessionSize) return prev;
        return { ...prev, streak: markStudied(prev.streak).streak };
      });
    },
    [update],
  );

  const resetAll = useCallback(() => {
    clearStore();
    const fresh = createInitialStore();
    setStore(fresh);
    saveStore(fresh);
  }, []);

  const importFromText = useCallback(
    (text: string) => {
      const parsed = importStore(text);
      if (!parsed) return false;
      const pruned = words.length > 0 ? pruneCards(parsed, words) : parsed;
      setStore(pruned);
      saveStore(pruned);
      return true;
    },
    [words],
  );

  const value = useMemo(
    () => ({
      status,
      error,
      words,
      index,
      store,
      update,
      recordAnswer,
      finishSession,
      resetAll,
      importFromText,
    }),
    [status, error, words, index, store, update, recordAnswer, finishSession, resetAll, importFromText],
  );

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 text-gray-500">
        <p className="text-base">単語データを読み込んでいます…</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-lg font-bold">単語データを読み込めませんでした</p>
        <p className="text-sm text-gray-500">{error}</p>
        <button className="btn-primary h-12" onClick={() => location.reload()}>
          もう一度ためす
        </button>
      </div>
    );
  }

  const close = () => setOverlay(null);

  return (
    <AppContext.Provider value={value}>
      <div className="mx-auto min-h-screen w-full max-w-md">
        {overlay?.kind === 'daily' && <Session mode={overlay.mode} onExit={close} />}
        {overlay?.kind === 'drill' && (
          <DrillSession onExit={close} onOpenList={() => setOverlay({ kind: 'drill-list' })} />
        )}
        {overlay?.kind === 'drill-setup' && (
          <DrillSetup onStart={() => setOverlay({ kind: 'drill' })} onCancel={close} />
        )}
        {overlay?.kind === 'drill-list' && <DrillList onExit={close} />}
        {overlay?.kind === 'speech' && <SpeechDiagnostics onExit={close} />}
        {overlay?.kind === 'parent-quiz' && <ParentQuiz onExit={close} />}

        {!overlay && (
          <>
            <main className="pb-24">
              {tab === 'home' && (
                <Home
                  onStartDaily={(mode) => setOverlay({ kind: 'daily', mode })}
                  onStartDrill={() => setOverlay({ kind: 'drill' })}
                  onSetupDrill={() => setOverlay({ kind: 'drill-setup' })}
                  onOpenDrillList={() => setOverlay({ kind: 'drill-list' })}
                />
              )}
              {tab === 'scope' && <Scope />}
              {tab === 'records' && (
                <Suspense
                  fallback={<p className="px-5 pt-10 text-center text-sm text-gray-400">読み込み中…</p>}
                >
                  <Records
                    onGoScope={() => setTab('scope')}
                    onStartLeech={() => setOverlay({ kind: 'daily', mode: 'leech' })}
                  />
                </Suspense>
              )}
              {tab === 'settings' && (
                <Settings
                  onStartParentQuiz={() => setOverlay({ kind: 'parent-quiz' })}
                  onOpenSpeechDiagnostics={() => setOverlay({ kind: 'speech' })}
                />
              )}
            </main>
            <TabBar current={tab} onChange={setTab} />
          </>
        )}
      </div>
    </AppContext.Provider>
  );
}
