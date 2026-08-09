// 乱数まわりの小さな道具。
// テストで結果を再現できるように、乱数生成器を差し替えられる形にしてある。

/** 配列をランダムに並べ替える（Fisher-Yates法）。元の配列は変更しない */
export function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 配列から1つ選ぶ。空なら undefined */
export function pick<T>(arr: T[], rng: () => number = Math.random): T | undefined {
  if (arr.length === 0) return undefined;
  return arr[Math.floor(rng() * arr.length)];
}

/**
 * 種（seed）から作る擬似乱数。同じ種なら毎回同じ順番の数が出るので、
 * テストで「この並びになるはず」と確かめられる。
 */
export function seededRng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    // xorshift32
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}
