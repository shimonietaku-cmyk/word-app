// 英語の読み上げ（Web Speech API）。ブラウザ内蔵の機能だけを使い、外部APIは使わない。
//
// 端末ごとのクセが多く、素直に書くと特定の端末だけ無音になる。
// 分かっている落とし穴を、すべてここで吸収する：
//
// 【Android Chrome】
//  ・getVoices() が最初は空配列を返す。しかも voiceschanged が数秒後に来ることがある
//    → 一度きりの待受ではなく、常時購読してキャッシュを更新し続ける
//  ・音声が見つからなくても lang 指定だけで鳴ることがある
//    → 「音声が無いから何もしない」で終わらせず、必ず発話を試す
//  ・空文字の発話はキューに詰まり、以後すべて無音になる
//    → 解錠には空文字ではなく半角スペースを使う
//  ・cancel() の直後に speak() すると無視される
//    → 再生中のときだけ cancel し、その場合は次のフレームで発話する
//  ・発話オブジェクトが回収されると途中で切れる → 参照を保持する
//
// 【iOS Safari】
//  ・ユーザーが画面を触った操作の「中」で1回 speak() しないと以後ずっと無音
//    → 開始ボタンのタップ内で unlockSpeech() を呼ぶ
//
// 【共通】
//  ・失敗した理由を記録し、画面に出せるようにする（無音のまま放置しない）

/** 読み上げが失敗した理由 */
export type SpeechFailure =
  | null
  | 'unsupported' // ブラウザが読み上げ機能を持っていない
  | 'no-voice' // 端末に音声データが1つも無い（TTSエンジン未インストールなど）
  | 'no-english-voice' // 音声はあるが英語が無い
  | 'not-allowed' // ブラウザに止められた（ユーザー操作が必要）
  | 'synthesis-failed' // 読み上げエンジン側の失敗
  | 'error'; // その他

export const FAILURE_MESSAGE: Record<NonNullable<SpeechFailure>, string> = {
  unsupported: 'このブラウザは読み上げ機能に対応していません。Chrome や Safari でお試しください。',
  'no-voice':
    'この端末に音声データが見つかりません。Androidの場合は「設定 → システム → 言語と入力 → 音声出力」から音声エンジン（Google テキスト読み上げ）と英語の音声データを入れると鳴るようになります。',
  'no-english-voice':
    '英語の音声データがこの端末に入っていません。端末の音声設定から英語（English）を追加してください。',
  'not-allowed': '画面を一度タップしてから、もう一度スピーカーボタンを押してください。',
  'synthesis-failed': '読み上げエンジンが応答しませんでした。もう一度お試しください。',
  error: '読み上げに失敗しました。設定の「音声の診断」で詳しく調べられます。',
};

let cachedVoice: SpeechSynthesisVoice | null = null;
let voicesLoaded = false;
let unlocked = false;
let lastFailure: SpeechFailure = null;
/** 発話中のオブジェクトを保持する（回収されて途中で切れるのを防ぐ） */
let holdUtterance: SpeechSynthesisUtterance | null = null;
let resumeTimer: number | null = null;
const listeners = new Set<() => void>();

/** この端末で読み上げ機能そのものが使えるか */
export function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/** 直近の失敗理由（画面表示用） */
export function getLastFailure(): SpeechFailure {
  return lastFailure;
}

function setFailure(f: SpeechFailure): void {
  lastFailure = f;
  listeners.forEach((fn) => fn());
}

/** 状態が変わったときに再描画するための購読 */
export function subscribeSpeech(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 端末が持っている音声の一覧（診断画面で使う） */
export function listVoices(): SpeechSynthesisVoice[] {
  if (!isSpeechSupported()) return [];
  try {
    return window.speechSynthesis.getVoices();
  } catch {
    return [];
  }
}

/** 英語の音声を選ぶ。無ければ null（null でも lang 指定で発話は試みる） */
export function getEnglishVoice(): SpeechSynthesisVoice | null {
  if (!isSpeechSupported()) return null;
  const voices = listVoices();
  if (voices.length === 0) {
    cachedVoice = null;
    return null;
  }
  // 音声一覧は後から増えることがあるので、キャッシュが一覧に残っているかを毎回確認する
  if (cachedVoice && voices.includes(cachedVoice)) return cachedVoice;

  const english = voices.filter((v) => v.lang?.toLowerCase().startsWith('en'));
  if (english.length === 0) {
    cachedVoice = null;
    return null;
  }
  cachedVoice =
    english.find((v) => v.lang.toLowerCase().replace('_', '-') === 'en-us') ??
    english.find((v) => v.localService) ?? // 端末内蔵を優先（オフラインでも鳴る）
    english[0];
  return cachedVoice;
}

/** 英語音声があるか（無くても発話は試すので、表示の参考値） */
export function hasEnglishVoice(): boolean {
  return getEnglishVoice() !== null;
}

/**
 * 音声一覧の準備。
 * Android は voiceschanged が遅れて来るので、一度きりの待受にせず購読し続ける。
 */
export function prepareVoices(): Promise<boolean> {
  if (!isSpeechSupported()) {
    setFailure('unsupported');
    return Promise.resolve(false);
  }

  // 以後ずっと購読して、遅れて届いた音声一覧も取り込む
  const onChange = () => {
    cachedVoice = null; // 選び直す
    voicesLoaded = listVoices().length > 0;
    if (voicesLoaded && lastFailure === 'no-voice') setFailure(null);
    listeners.forEach((fn) => fn());
  };
  window.speechSynthesis.addEventListener('voiceschanged', onChange);

  return new Promise((resolve) => {
    const done = () => {
      voicesLoaded = listVoices().length > 0;
      resolve(voicesLoaded);
    };
    if (listVoices().length > 0) {
      done();
      return;
    }
    // まだ空なら、届くか一定時間待つ（届かなくても発話自体は試す）
    const timer = window.setTimeout(done, 2000);
    const once = () => {
      window.speechSynthesis.removeEventListener('voiceschanged', once);
      window.clearTimeout(timer);
      done();
    };
    window.speechSynthesis.addEventListener('voiceschanged', once);
  });
}

/**
 * 音声を解錠する。**必ずタップ／クリックのハンドラの中から直接呼ぶこと。**
 * setTimeout や await をまたぐと、ユーザー操作とみなされず無音になる。
 */
export function unlockSpeech(): void {
  if (!isSpeechSupported() || unlocked) return;
  try {
    // 空文字だと Android でキューが詰まるため、半角スペースを使う
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    u.rate = 1;
    window.speechSynthesis.speak(u);
    unlocked = true;
  } catch {
    /* 解錠に失敗しても、実際の発話でもう一度試される */
  }
}

/** 読み上げに邪魔な記号を落とす */
function cleanText(text: string): string {
  return text
    .replace(/[[\]（）()~〜]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Android Chrome は長い発話の途中で勝手に止まることがある。
 * 発話中だけ定期的に resume() を送って止まらないようにする。
 */
function startResumeWatch(): void {
  stopResumeWatch();
  resumeTimer = window.setInterval(() => {
    const s = window.speechSynthesis;
    if (!s.speaking) {
      stopResumeWatch();
      return;
    }
    if (s.paused) s.resume();
  }, 4000);
}

function stopResumeWatch(): void {
  if (resumeTimer !== null) {
    window.clearInterval(resumeTimer);
    resumeTimer = null;
  }
}

/** 実際に発話する（内部用） */
function utter(text: string): void {
  const synth = window.speechSynthesis;
  const voice = getEnglishVoice();

  const u = new SpeechSynthesisUtterance(text);
  // 音声が見つからないときも lang だけ指定して試す（Android はこれで鳴ることがある）
  if (voice) {
    u.voice = voice;
    u.lang = voice.lang;
  } else {
    u.lang = 'en-US';
  }
  u.rate = 0.9; // 中学生向けに少しゆっくり
  u.pitch = 1;
  u.volume = 1;

  u.onstart = () => {
    setFailure(null);
    startResumeWatch();
  };
  u.onend = () => {
    stopResumeWatch();
    holdUtterance = null;
  };
  u.onerror = (e: SpeechSynthesisErrorEvent) => {
    stopResumeWatch();
    holdUtterance = null;
    // 'interrupted' と 'canceled' は自分で止めた場合なので失敗として扱わない
    if (e.error === 'interrupted' || e.error === 'canceled') return;
    if (e.error === 'not-allowed') setFailure('not-allowed');
    else if (e.error === 'synthesis-failed' || e.error === 'synthesis-unavailable')
      setFailure('synthesis-failed');
    else if (e.error === 'language-unavailable' || e.error === 'voice-unavailable')
      setFailure('no-english-voice');
    else setFailure('error');
  };

  holdUtterance = u; // 回収されないよう参照を残す
  if (synth.paused) synth.resume();
  synth.speak(u);
}

/**
 * 英単語を読み上げる。
 * 失敗しても学習は止めない。理由は getLastFailure() で取れる。
 */
export function speak(text: string, enabled = true): void {
  if (!enabled) return;
  if (!isSpeechSupported()) {
    setFailure('unsupported');
    return;
  }

  const clean = cleanText(text);
  if (!clean) return;

  const voices = listVoices();
  if (voices.length === 0) {
    // 音声が1つも無い端末。発話は試すが、鳴らなければ理由を残す
    setFailure('no-voice');
  } else if (!getEnglishVoice()) {
    setFailure('no-english-voice');
  }

  try {
    const synth = window.speechSynthesis;
    if (synth.speaking || synth.pending) {
      // cancel() の直後に speak() すると Android で無視されるので、次のフレームに回す
      synth.cancel();
      window.requestAnimationFrame(() => {
        try {
          utter(clean);
        } catch {
          setFailure('error');
        }
      });
    } else {
      utter(clean);
    }
  } catch {
    setFailure('error');
  }
}

/** 読み上げを止める */
export function stopSpeaking(): void {
  if (!isSpeechSupported()) return;
  try {
    stopResumeWatch();
    if (holdUtterance) {
      // 自分で止めた発話の onerror を失敗として記録しないよう、先に外す
      holdUtterance.onend = null;
      holdUtterance.onerror = null;
      holdUtterance = null;
    }
    window.speechSynthesis.cancel();
  } catch {
    /* 何もしない */
  }
}

/** 診断画面に出す情報 */
export interface SpeechDiagnostics {
  supported: boolean;
  userAgent: string;
  voiceCount: number;
  englishVoiceCount: number;
  selectedVoice: string;
  unlocked: boolean;
  lastFailure: SpeechFailure;
  voices: { name: string; lang: string; localService: boolean; default: boolean }[];
}

export function collectDiagnostics(): SpeechDiagnostics {
  const voices = listVoices();
  const english = voices.filter((v) => v.lang?.toLowerCase().startsWith('en'));
  const selected = getEnglishVoice();
  return {
    supported: isSpeechSupported(),
    userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
    voiceCount: voices.length,
    englishVoiceCount: english.length,
    selectedVoice: selected ? `${selected.name} (${selected.lang})` : '（なし・lang指定で発話）',
    unlocked,
    lastFailure,
    voices: voices.map((v) => ({
      name: v.name,
      lang: v.lang,
      localService: v.localService,
      default: v.default,
    })),
  };
}

/** 診断用のテスト再生。実際に何が起きたかを返す */
export function testSpeak(text = 'apple'): Promise<{
  ok: boolean;
  event: 'start' | 'end' | 'error' | 'timeout';
  detail: string;
}> {
  return new Promise((resolve) => {
    if (!isSpeechSupported()) {
      resolve({ ok: false, event: 'error', detail: 'speechSynthesis がありません' });
      return;
    }
    let settled = false;
    const finish = (r: { ok: boolean; event: 'start' | 'end' | 'error' | 'timeout'; detail: string }) => {
      if (settled) return;
      settled = true;
      resolve(r);
    };

    try {
      const voice = getEnglishVoice();
      const u = new SpeechSynthesisUtterance(text);
      if (voice) {
        u.voice = voice;
        u.lang = voice.lang;
      } else {
        u.lang = 'en-US';
      }
      u.onstart = () => finish({ ok: true, event: 'start', detail: '再生が始まりました' });
      u.onend = () => finish({ ok: true, event: 'end', detail: '再生が終わりました' });
      u.onerror = (e: SpeechSynthesisErrorEvent) =>
        finish({ ok: false, event: 'error', detail: `エラー: ${e.error}` });

      holdUtterance = u;
      const synth = window.speechSynthesis;
      if (synth.paused) synth.resume();
      synth.speak(u);

      // 何のイベントも来ない端末があるので、時間で打ち切る
      window.setTimeout(
        () =>
          finish({
            ok: false,
            event: 'timeout',
            detail: '5秒待っても反応がありませんでした（音声エンジンが未インストールの可能性）',
          }),
        5000,
      );
    } catch (e) {
      finish({ ok: false, event: 'error', detail: `例外: ${String(e)}` });
    }
  });
}
