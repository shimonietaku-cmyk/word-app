import { describe, expect, it } from 'vitest';
import {
  answeredInRound,
  buildQueue,
  clampRange,
  copiesFor,
  emptyStat,
  isRoundComplete,
  nextRound,
  rangeLabel,
  recordDrillAnswer,
  startDrill,
  summarize,
  wordCountOf,
  wordsInRange,
  wrongOnlyRound,
} from '../drill';
import { buildIndex } from '../words';
import { seededRng } from '../random';
import { makeWord } from './helpers';
import type { DrillStat, DrillState } from '../../types';

/** 1年 n語・2年 m語 のテスト用データ */
function makeIndex(n = 60, m = 30) {
  const g1 = Array.from({ length: n }, (_, i) =>
    makeWord({ id: `g1-${i}`, grade: 1, unit: `Unit ${Math.floor(i / 10) + 1}`, en: `a${i}`, jaMain: `いち${i}` }),
  );
  const g2 = Array.from({ length: m }, (_, i) =>
    makeWord({ id: `g2-${i}`, grade: 2, unit: `Unit ${Math.floor(i / 10) + 1}`, en: `b${i}`, jaMain: `に${i}` }),
  );
  return buildIndex([...g1, ...g2]);
}

/** 範囲を全部1周ぶん解く。correctOf で正誤を決める */
function playRound(
  state: DrillState,
  correctOf: (id: string, i: number) => boolean,
): { state: DrillState; served: string[] } {
  let s = state;
  const served: string[] = [];
  let i = 0;
  while (!isRoundComplete(s)) {
    const id = s.queue[0];
    served.push(id);
    s = recordDrillAnswer(s, id, correctOf(id, i));
    i += 1;
  }
  return { state: s, served };
}

describe('単語番号と範囲', () => {
  it('学年ごとに1から番号がふられる', () => {
    const index = makeIndex(60, 30);
    expect(wordCountOf(index, 1)).toBe(60);
    expect(wordCountOf(index, 2)).toBe(30);
    expect(index.numberOf.get('g1-0')).toBe(1);
    expect(index.numberOf.get('g1-59')).toBe(60);
    expect(index.numberOf.get('g2-0')).toBe(1); // 2年も1から振り直す
    expect(index.numberOf.get('g2-29')).toBe(30);
  });

  it('指定した番号の範囲がそのまま取れる（両端を含む）', () => {
    const index = makeIndex();
    const words = wordsInRange(index, { grade: 1, from: 11, to: 20 });
    expect(words).toHaveLength(10);
    expect(words[0].id).toBe('g1-10'); // 11番
    expect(words[9].id).toBe('g1-19'); // 20番
  });

  it('番号は教科書順（words.json の並び順）のまま', () => {
    const index = makeIndex();
    const words = wordsInRange(index, { grade: 1, from: 1, to: 5 });
    expect(words.map((w) => w.id)).toEqual(['g1-0', 'g1-1', 'g1-2', 'g1-3', 'g1-4']);
  });

  it('範囲外の番号を入れても、その学年の中に収まる', () => {
    const index = makeIndex(60, 30);
    expect(clampRange(index, { grade: 1, from: 0, to: 999 })).toEqual({ grade: 1, from: 1, to: 60 });
    expect(clampRange(index, { grade: 2, from: 5, to: 999 })).toEqual({ grade: 2, from: 5, to: 30 });
  });

  it('開始が終了より大きいときは、終了を開始に合わせる', () => {
    const index = makeIndex();
    expect(clampRange(index, { grade: 1, from: 30, to: 10 })).toEqual({ grade: 1, from: 30, to: 30 });
  });

  it('範囲の表示が読みやすい', () => {
    expect(rangeLabel({ grade: 2, from: 23, to: 50 })).toBe('2年 23〜50番');
  });
});

describe('1周の網羅保証（ここが最重要）', () => {
  it('1周のあいだ、同じ単語は絶対に2回出ない', () => {
    const index = makeIndex();
    const state = startDrill(index, { grade: 1, from: 1, to: 50 }, null, seededRng(1));
    const { served } = playRound(state, () => true);

    expect(served).toHaveLength(50);
    expect(new Set(served).size).toBe(50); // 重複ゼロ
  });

  it('1周で範囲内の全単語がちょうど1回ずつ出る', () => {
    const index = makeIndex();
    const range = { grade: 1 as const, from: 11, to: 40 };
    const state = startDrill(index, range, null, seededRng(2));
    const { served } = playRound(state, () => true);

    const expected = wordsInRange(index, range).map((w) => w.id).sort();
    expect([...served].sort()).toEqual(expected);
  });

  it('どの乱数でも網羅される（20パターン試す）', () => {
    const index = makeIndex();
    const range = { grade: 1 as const, from: 1, to: 30 };
    const expected = wordsInRange(index, range).map((w) => w.id).sort();

    for (let seed = 1; seed <= 20; seed++) {
      const state = startDrill(index, range, null, seededRng(seed));
      const { served } = playRound(state, () => true);
      expect([...served].sort()).toEqual(expected);
    }
  });

  it('出題順は毎回変わる（同じ並びの丸暗記を防ぐ）', () => {
    const index = makeIndex();
    const orders = new Set<string>();
    for (let seed = 1; seed <= 10; seed++) {
      const state = startDrill(index, { grade: 1, from: 1, to: 20 }, null, seededRng(seed));
      orders.add(playRound(state, () => true).served.join(','));
    }
    expect(orders.size).toBeGreaterThan(1);
  });

  it('途中でやめても、残りが正しく保たれる', () => {
    const index = makeIndex();
    let state = startDrill(index, { grade: 1, from: 1, to: 20 }, null, seededRng(3));
    const first5: string[] = [];
    for (let i = 0; i < 5; i++) {
      first5.push(state.queue[0]);
      state = recordDrillAnswer(state, state.queue[0], true);
    }
    expect(answeredInRound(state)).toBe(5);
    expect(state.queue).toHaveLength(15);
    // 済んだ単語は残りのキューに入っていない
    for (const id of first5) expect(state.queue).not.toContain(id);
  });
});

describe('2周目以降の重みづけ', () => {
  it('間違えた単語ほど多く出す', () => {
    const wrong: DrillStat = { asked: 1, correct: 0, wrong: 1, streak: 0, last: 'wrong' };
    const oldWrong: DrillStat = { asked: 3, correct: 2, wrong: 1, streak: 1, last: 'correct' };
    const solid: DrillStat = { asked: 3, correct: 3, wrong: 0, streak: 3, last: 'correct' };

    expect(copiesFor(wrong, 2)).toBe(3);
    expect(copiesFor(oldWrong, 2)).toBe(2);
    expect(copiesFor(solid, 2)).toBe(1);
  });

  it('1周目は全員1回だけ（重みづけしない）', () => {
    const wrong: DrillStat = { asked: 1, correct: 0, wrong: 1, streak: 0, last: 'wrong' };
    expect(copiesFor(wrong, 1)).toBe(1);
    expect(copiesFor(emptyStat(), 1)).toBe(1);
  });

  it('2周目のキューでは、間違えた単語の出現回数が実際に増える', () => {
    const index = makeIndex();
    let state = startDrill(index, { grade: 1, from: 1, to: 20 }, null, seededRng(4));
    // 最初の5語をわざと間違える
    const missed = state.queue.slice(0, 5);
    const played = playRound(state, (id) => !missed.includes(id));
    state = nextRound(index, played.state, seededRng(5));

    for (const id of missed) {
      expect(state.queue.filter((q) => q === id)).toHaveLength(3);
    }
    const ok = state.queue.find((q) => !missed.includes(q))!;
    expect(state.queue.filter((q) => q === ok)).toHaveLength(1);
  });

  it('同じ単語が連続で出ないよう間隔が空く', () => {
    const index = makeIndex();
    let state = startDrill(index, { grade: 1, from: 1, to: 30 }, null, seededRng(6));
    const missed = state.queue.slice(0, 10);
    state = nextRound(index, playRound(state, (id) => !missed.includes(id)).state, seededRng(7));

    for (let i = 1; i < state.queue.length; i++) {
      expect(state.queue[i]).not.toBe(state.queue[i - 1]);
    }
  });

  it('2周目でも範囲内の全単語が最低1回は出る', () => {
    const index = makeIndex();
    const range = { grade: 1 as const, from: 1, to: 25 };
    let state = startDrill(index, range, null, seededRng(8));
    state = nextRound(index, playRound(state, (_, i) => i % 3 !== 0).state, seededRng(9));

    const expected = new Set(wordsInRange(index, range).map((w) => w.id));
    expect(new Set(state.queue)).toEqual(expected);
  });

  it('周回数が1つずつ増える', () => {
    const index = makeIndex();
    let state = startDrill(index, { grade: 1, from: 1, to: 10 }, null, seededRng(10));
    expect(state.round).toBe(1);
    state = nextRound(index, playRound(state, () => true).state, seededRng(11));
    expect(state.round).toBe(2);
    state = nextRound(index, playRound(state, () => true).state, seededRng(12));
    expect(state.round).toBe(3);
  });
});

describe('まちがえた単語だけの周', () => {
  it('直前に間違えた単語だけが出る', () => {
    const index = makeIndex();
    let state = startDrill(index, { grade: 1, from: 1, to: 20 }, null, seededRng(13));
    const missed = state.queue.slice(0, 4);
    state = wrongOnlyRound(index, playRound(state, (id) => !missed.includes(id)).state, seededRng(14));

    expect([...state.queue].sort()).toEqual([...missed].sort());
    expect(state.wrongOnly).toBe(true);
  });

  it('この周は周回数に数えない', () => {
    const index = makeIndex();
    let state = startDrill(index, { grade: 1, from: 1, to: 10 }, null, seededRng(15));
    state = nextRound(index, playRound(state, () => true).state, seededRng(16)); // 2周目
    expect(state.round).toBe(2);

    const missed = state.queue.slice(0, 2);
    state = wrongOnlyRound(index, playRound(state, (id) => !missed.includes(id)).state, seededRng(17));
    expect(state.round).toBe(2); // 増えない

    state = nextRound(index, playRound(state, () => true).state, seededRng(18));
    expect(state.round).toBe(2); // 特別な周のあとも、そのまま2周目の続き扱い
    expect(state.wrongOnly).toBe(false);
  });
});

describe('成績の記録と再開', () => {
  it('正解・不正解・連続正解数が正しく積み上がる', () => {
    const index = makeIndex();
    let state = startDrill(index, { grade: 1, from: 1, to: 5 }, null, seededRng(19));
    const id = state.queue[0];

    state = recordDrillAnswer(state, id, true);
    expect(state.stats[id]).toMatchObject({ asked: 1, correct: 1, wrong: 0, streak: 1, last: 'correct' });

    state = recordDrillAnswer(state, id, true);
    expect(state.stats[id].streak).toBe(2);

    state = recordDrillAnswer(state, id, false);
    expect(state.stats[id]).toMatchObject({ asked: 3, correct: 2, wrong: 1, streak: 0, last: 'wrong' });
  });

  it('同じ範囲を選び直したら、途中経過がそのまま残る', () => {
    const index = makeIndex();
    const range = { grade: 1 as const, from: 1, to: 20 };
    let state = startDrill(index, range, null, seededRng(20));
    state = recordDrillAnswer(state, state.queue[0], true);
    state = recordDrillAnswer(state, state.queue[0], false);

    const resumed = startDrill(index, range, state, seededRng(21));
    expect(resumed.queue).toEqual(state.queue);
    expect(resumed.stats).toEqual(state.stats);
    expect(answeredInRound(resumed)).toBe(2);
  });

  it('範囲を変えたら、新しい範囲に残る単語の成績だけ引き継ぐ', () => {
    const index = makeIndex();
    let state = startDrill(index, { grade: 1, from: 1, to: 20 }, null, seededRng(22));
    state = recordDrillAnswer(state, 'g1-0', true); // 1番
    state = recordDrillAnswer(state, 'g1-15', true); // 16番

    // 11〜30番に変更 → 1番は範囲外に、16番は範囲内に残る
    const moved = startDrill(index, { grade: 1, from: 11, to: 30 }, state, seededRng(23));
    expect(moved.stats['g1-0']).toBeUndefined();
    expect(moved.stats['g1-15']).toBeDefined();
    expect(moved.round).toBe(1);
    expect(moved.queue).toHaveLength(20);
  });

  it('学年をまたいで範囲を変えても壊れない', () => {
    const index = makeIndex();
    const state = startDrill(index, { grade: 1, from: 1, to: 20 }, null, seededRng(24));
    const moved = startDrill(index, { grade: 2, from: 1, to: 10 }, state, seededRng(25));
    expect(moved.range.grade).toBe(2);
    expect(moved.queue).toHaveLength(10);
    expect(moved.queue.every((id) => id.startsWith('g2-'))).toBe(true);
  });
});

describe('範囲全体のまとめ', () => {
  it('未出題・正解・不正解・仕上がりを数える', () => {
    const index = makeIndex();
    let state = startDrill(index, { grade: 1, from: 1, to: 10 }, null, seededRng(26));

    state = recordDrillAnswer(state, 'g1-0', true);
    state = recordDrillAnswer(state, 'g1-0', true); // 2連続正解＝仕上がり
    state = recordDrillAnswer(state, 'g1-1', false);
    state = recordDrillAnswer(state, 'g1-2', true);

    const s = summarize(index, state);
    expect(s.total).toBe(10);
    expect(s.seen).toBe(3);
    expect(s.untouched).toBe(7);
    expect(s.solid).toBe(1);
    expect(s.wrongNow).toBe(1);
    expect(s.correctNow).toBe(2);
    expect(s.accuracy).toBeCloseTo(3 / 4);
  });

  it('まだ何もしていないときは0で返る', () => {
    const index = makeIndex();
    expect(summarize(index, null).total).toBe(0);
  });
});

describe('大きい範囲でも速い', () => {
  it('1000語の周を組み立てるのに16ms以内', () => {
    const index = makeIndex(1200, 10);
    const start = performance.now();
    startDrill(index, { grade: 1, from: 1, to: 1000 }, null, seededRng(27));
    expect(performance.now() - start).toBeLessThan(16);
  });

  it('重みづけありの2周目でも16ms以内', () => {
    const index = makeIndex(1200, 10);
    const words = wordsInRange(index, { grade: 1, from: 1, to: 1000 });
    const stats: Record<string, DrillStat> = {};
    for (const w of words) {
      stats[w.id] = { asked: 1, correct: 0, wrong: 1, streak: 0, last: 'wrong' };
    }
    const start = performance.now();
    const queue = buildQueue(words, stats, 2, seededRng(28));
    expect(performance.now() - start).toBeLessThan(16);
    expect(queue).toHaveLength(3000); // 全部まちがい＝3回ずつ
  });
});
