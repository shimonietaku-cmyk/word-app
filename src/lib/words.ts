// words.json の読み込みと、検索を速くするための「索引（さくいん）」づくり。
//
// 1,961語を毎回すべて見にいくと出題のたびに時間がかかる。
// そこでアプリ起動時に1回だけ、品詞別・単元別などのグループ表を作っておき、
// 出題時はその表を引くだけにする（＝16ms以内の応答を守るための工夫）。

import type { Word } from '../types';

/** 単元の識別キー。"Unit 1" は1年にも2年にもあるので、学年とセットにする */
export function unitKey(grade: number, unit: string): string {
  return `${grade}|${unit}`;
}

/** 単元の表示用ラベル */
export function unitLabel(key: string): string {
  const [grade, ...rest] = key.split('|');
  return `${grade}年 ${rest.join('|')}`;
}

export interface UnitInfo {
  key: string; // "1|Unit 1"
  grade: number;
  unit: string;
  /** words.json の登場順（教科書順）。並べ替えに使う */
  order: number;
  /** その単元に含まれる part の一覧（登場順） */
  parts: (number | null)[];
  count: number;
}

export interface WordIndex {
  all: Word[];
  byId: Map<string, Word>;
  /** `${pos}|${grade}|${unit}` → 単語 */
  byPosUnit: Map<string, Word[]>;
  /** `${pos}|${level}` → 単語 */
  byPosLevel: Map<string, Word[]>;
  /** 綴りの先頭2文字 → 単語 */
  byPrefix2: Map<string, Word[]>;
  /** 綴りの先頭1文字 → 単語（編集距離の計算対象を絞るために使う） */
  byFirstChar: Map<string, Word[]>;
  /** jaMain の末尾1文字 → 単語（「〜な」「〜する」など意味カテゴリの近さ） */
  byJaTail: Map<string, Word[]>;
  /** 学年 → 単語（words.json の登場順＝教科書順。添字+1 が単語番号になる） */
  byGrade: Map<number, Word[]>;
  /** 単語ID → 学年ごとの単語番号（1始まり）。テスト範囲の指定と表示に使う */
  numberOf: Map<string, number>;
  /** 単元一覧（words.json の登場順） */
  units: UnitInfo[];
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** 索引をつくる。単語配列を渡すだけ */
export function buildIndex(words: Word[]): WordIndex {
  const index: WordIndex = {
    all: words,
    byId: new Map(),
    byPosUnit: new Map(),
    byPosLevel: new Map(),
    byPrefix2: new Map(),
    byFirstChar: new Map(),
    byJaTail: new Map(),
    byGrade: new Map(),
    numberOf: new Map(),
    units: [],
  };

  const unitMap = new Map<string, UnitInfo>();

  for (const w of words) {
    index.byId.set(w.id, w);
    push(index.byPosUnit, `${w.pos}|${unitKey(w.grade, w.unit)}`, w);
    push(index.byPosLevel, `${w.pos}|${w.level}`, w);
    push(index.byGrade, w.grade, w);
    // 学年ごとの通し番号。byGrade は登場順に積むので、いま入れた位置がそのまま番号になる
    index.numberOf.set(w.id, index.byGrade.get(w.grade)!.length);

    const en = w.en.toLowerCase();
    if (en.length >= 2) push(index.byPrefix2, en.slice(0, 2), w);
    if (en.length >= 1) push(index.byFirstChar, en.slice(0, 1), w);

    const ja = w.jaMain;
    if (ja.length >= 1) push(index.byJaTail, ja.slice(-1), w);

    // 単元は words.json の登場順で記録する（文字列ソートすると教科書順が壊れる）
    const key = unitKey(w.grade, w.unit);
    let info = unitMap.get(key);
    if (!info) {
      info = { key, grade: w.grade, unit: w.unit, order: unitMap.size, parts: [], count: 0 };
      unitMap.set(key, info);
      index.units.push(info);
    }
    info.count += 1;
    if (!info.parts.includes(w.part)) info.parts.push(w.part);
  }

  return index;
}

/** words.json を読み込む（public/data/words.json） */
export async function loadWords(baseUrl: string): Promise<Word[]> {
  const res = await fetch(`${baseUrl}data/words.json`);
  if (!res.ok) throw new Error(`単語データを読み込めませんでした (${res.status})`);
  const data = (await res.json()) as Word[];
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('単語データの中身が空です');
  }
  return data;
}
