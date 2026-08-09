// 英語の読み上げ（Web Speech API）。ブラウザに内蔵された機能だけを使い、外部APIは使わない。
//
// iPhone(iOS Safari) の注意点：
//   ユーザーが画面を触った操作の「中」で1回 speak() しないと、以後ずっと音が鳴らない。
//   そのため「セッションを開始する」ボタンを押した瞬間に、無音の発話を1回流して解錠する。

let unlocked = false;
let cachedVoice: SpeechSynthesisVoice | null = null;
let voicesReady = false;

/** この端末で読み上げが使えるか */
export function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/** 英語の音声を探す。見つからなければ null */
export function getEnglishVoice(): SpeechSynthesisVoice | null {
  if (!isSpeechSupported()) return null;
  if (cachedVoice) return cachedVoice;

  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;

  const english = voices.filter((v) => v.lang.toLowerCase().startsWith('en'));
  if (english.length === 0) return null;

  // en-US を優先し、無ければ最初の英語音声
  cachedVoice =
    english.find((v) => v.lang.toLowerCase() === 'en-us') ??
    english.find((v) => v.lang.toLowerCase().startsWith('en-us')) ??
    english[0];
  return cachedVoice;
}

/**
 * 音声リストの準備を待つ。
 * getVoices() は最初は空配列を返すことがあるので voiceschanged イベントを待つ。
 */
export function prepareVoices(): Promise<boolean> {
  return new Promise((resolve) => {
    if (!isSpeechSupported()) {
      resolve(false);
      return;
    }
    if (getEnglishVoice()) {
      voicesReady = true;
      resolve(true);
      return;
    }
    const onChange = () => {
      window.speechSynthesis.removeEventListener('voiceschanged', onChange);
      voicesReady = true;
      resolve(Boolean(getEnglishVoice()));
    };
    window.speechSynthesis.addEventListener('voiceschanged', onChange);
    // 一定時間で諦める（voiceschanged が来ない環境がある）
    window.setTimeout(() => {
      window.speechSynthesis.removeEventListener('voiceschanged', onChange);
      voicesReady = true;
      resolve(Boolean(getEnglishVoice()));
    }, 1500);
  });
}

export function areVoicesReady(): boolean {
  return voicesReady;
}

/**
 * 音声を解錠する。**必ずタップ／クリックのハンドラの中から呼ぶこと。**
 * これを忘れると iPhone で一切音が鳴らない。
 */
export function unlockSpeech(): void {
  if (!isSpeechSupported() || unlocked) return;
  try {
    const u = new SpeechSynthesisUtterance('');
    u.volume = 0;
    window.speechSynthesis.speak(u);
    unlocked = true;
  } catch {
    /* 失敗しても学習は続けられる */
  }
}

/** 英単語を読み上げる */
export function speak(text: string, enabled = true): void {
  if (!enabled || !isSpeechSupported()) return;
  const voice = getEnglishVoice();
  if (!voice) return;

  try {
    // 前の読み上げが残っていると重なるので止める
    window.speechSynthesis.cancel();
    // 〜 や [ ] は読み上げに邪魔なので取り除く
    const clean = text.replace(/[[\]（）()~〜]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!clean) return;
    const u = new SpeechSynthesisUtterance(clean);
    u.voice = voice;
    u.lang = voice.lang;
    u.rate = 0.9; // 中学生向けに少しゆっくり
    u.pitch = 1;
    window.speechSynthesis.speak(u);
  } catch {
    /* 読み上げに失敗しても学習は続けられる */
  }
}

/** 読み上げを止める */
export function stopSpeaking(): void {
  if (!isSpeechSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* 何もしない */
  }
}
