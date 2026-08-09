import { describe, expect, it } from 'vitest';
import { editDistance, judge, normalize, splitForArrange, makeArrangePieces } from '../judge';
import { seededRng } from '../random';

describe('normalize（表記のゆれをそろえる）', () => {
  it('小文字にする', () => {
    expect(normalize('Beautiful')).toBe('beautiful');
  });

  it('〜 と ~ を取り除く', () => {
    expect(normalize('look for 〜')).toBe('look for');
    expect(normalize('look for ~')).toBe('look for');
  });

  it('[ ] と ( ) を中身ごと取り除く', () => {
    expect(normalize('[be] going to')).toBe('going to');
    expect(normalize('go (to) school')).toBe('go school');
  });

  it('記号（. , ! ? アポストロフィ）を取り除く', () => {
    expect(normalize("I'm")).toBe('im');
    expect(normalize('Oh, no!')).toBe('oh no');
    expect(normalize('I’m')).toBe('im');
  });

  it('前後の空白と連続空白をそろえる', () => {
    expect(normalize('  go   to  school  ')).toBe('go to school');
  });
});

describe('editDistance（何文字直せば同じか）', () => {
  it('同じなら0', () => {
    expect(editDistance('beautiful', 'beautiful')).toBe(0);
  });

  it('1文字違いなら1', () => {
    expect(editDistance('beautiful', 'beatiful')).toBe(1);
    expect(editDistance('quiet', 'quite')).toBe(2);
  });

  it('limit を超えたら打ち切って limit+1 を返す', () => {
    expect(editDistance('beautiful', 'bad', 2)).toBeGreaterThan(2);
  });
});

describe('judge（採点）', () => {
  it('"look for 〜" に対して "look for" は正解', () => {
    expect(judge('look for', 'look for 〜').result).toBe('correct');
  });

  it('"I\'m" に対して "im" は正解', () => {
    expect(judge('im', "I'm").result).toBe('correct');
  });

  it('"beautiful" に対して "beatiful" は「おしい」', () => {
    const outcome = judge('beatiful', 'beautiful');
    expect(outcome.result).toBe('close');
    expect(outcome.normalizedAnswer).toBe('beautiful');
  });

  it('"beautiful" に対して "bad" は不正解', () => {
    expect(judge('bad', 'beautiful').result).toBe('wrong');
  });

  it('空欄は不正解（「おしい」にしない）', () => {
    expect(judge('   ', 'go').result).toBe('wrong');
  });

  it('大文字小文字は区別しない', () => {
    expect(judge('Japan', 'japan').result).toBe('correct');
  });
});

describe('splitForArrange（並べ替えパネルの分解）', () => {
  it('1語は1文字ずつに分ける', () => {
    expect(splitForArrange('cat')).toEqual({ pieces: ['c', 'a', 't'], mode: 'char' });
  });

  it('連語は単語のかたまりに分ける（タップ回数を減らすため）', () => {
    expect(splitForArrange('look for 〜')).toEqual({ pieces: ['look', 'for'], mode: 'word' });
  });
});

describe('makeArrangePieces（ダミー入りパネル）', () => {
  it('正解の文字＋ダミー2つが入る', () => {
    const { pieces, answerPieces } = makeArrangePieces('cat', seededRng(1));
    expect(answerPieces).toEqual(['c', 'a', 't']);
    expect(pieces).toHaveLength(5);
    for (const p of answerPieces) {
      expect(pieces).toContain(p);
    }
  });

  it('ダミーは正解に含まれない文字から選ばれる', () => {
    const { pieces, answerPieces } = makeArrangePieces('cat', seededRng(7));
    const extra = [...pieces];
    for (const p of answerPieces) extra.splice(extra.indexOf(p), 1);
    expect(extra).toHaveLength(2);
    for (const e of extra) {
      expect(answerPieces).not.toContain(e);
    }
  });
});
