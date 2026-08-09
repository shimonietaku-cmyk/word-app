// テスト用の小さな道具。実際のアプリでは使わない。

import type { CardState, Store, Word } from '../../types';
import { createCardState, createInitialStore } from '../storage';

let counter = 0;

/** テスト用の単語を1件つくる。指定しない項目は適当な既定値になる */
export function makeWord(partial: Partial<Word> = {}): Word {
  counter += 1;
  const grade = partial.grade ?? 1;
  const unit = partial.unit ?? 'Unit 1';
  return {
    id: partial.id ?? `w-${counter}`,
    grade,
    unit,
    part: partial.part ?? 1,
    section: partial.section ?? 'unit',
    en: partial.en ?? `word${counter}`,
    ja: partial.ja ?? [partial.jaMain ?? `やく${counter}`],
    jaMain: partial.jaMain ?? `やく${counter}`,
    type: partial.type ?? 'word',
    pos: partial.pos ?? 'noun',
    level: partial.level ?? 2,
    note: partial.note ?? '',
    srcPage: partial.srcPage ?? 'test',
  };
}

export function makeStore(partial: Partial<Store> = {}, now = new Date()): Store {
  return { ...createInitialStore(now), ...partial };
}

export function makeCard(partial: Partial<CardState> = {}, now = new Date()): CardState {
  return { ...createCardState(now), ...partial };
}

/** テスト内で日付を固定するための Date */
export const FIXED_NOW = new Date(2026, 7, 8, 10, 0, 0); // 2026-08-08 10:00
