export interface ScoreInput { timeLeftMs: number; echoesUsed: number; maxEchoes: number; deaths: number; resets: number }
export function levelScore(p: ScoreInput): number {
  return Math.max(0, 1000 + Math.round(p.timeLeftMs / 10) + (p.maxEchoes - p.echoesUsed) * 300 - p.deaths * 150 - p.resets * 50);
}
export const LEVEL_ECHOES = [1, 2, 3] as const;
export type Difficulty = 'easy' | 'hard';
export const EASY_LEVEL_ECHOES = [1, 1, 2] as const;
export function maxEchoesForLevel(levelId: number, difficulty: Difficulty = 'hard'): number {
  return (difficulty === 'easy' ? EASY_LEVEL_ECHOES : LEVEL_ECHOES)[levelId - 1];
}
