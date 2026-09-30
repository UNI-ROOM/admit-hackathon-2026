import { LevelConfig } from './types';
import { t } from './i18n';
import type { Difficulty } from '../../shared/score';

export const LEVELS: LevelConfig[] = [
    {
        id: 1,
        title: t('level1.title'),
        man: { x: 0.85, y: 0.8 },
        door: { x: 0.15, y: 0.8, width: 0.15, height: 0.15 },
        laser: { x: 0.5, y: 0.0, width: 0.02, height: 1.0, active: true },
        prism: { x: 0.7, y: 0.45, width: 0.09, height: 0.09, direction: 'left' },
        crystal: { x: 0.2, y: 0.45, width: 0.08, height: 0.1 },
        maxEchoes: 1,
        minRecordings: 1,
        hintIdle: t('level1.hintIdle'),
        hintRecording: t('level1.hintRecording'),
        hintPlaying: t('level1.hintPlaying')
    },
    {
        id: 2,
        title: t('level2.title'),
        man: { x: 0.8, y: 0.8 },
        lever: { x: 0.85, y: 0.3 },
        door: { x: 0.2, y: 0.8, width: 0.15, height: 0.15 },
        laser: { x: 0.5, y: 0.0, width: 0.02, height: 1.0, active: true, minX: 0.38, maxX: 0.62, speed: 1.5 },
        plate: { x: 0.65, y: 0.2, width: 0.15, height: 0.05 },
        maxEchoes: 2,
        minRecordings: 1,
        hintIdle: t('level2.hintIdle'),
        hintRecording: [t('level2.hintRecording'), t('level2.hintRecording1')],
        hintPlaying: t('level2.hintPlaying')
    },
    {
        id: 3,
        title: t('level3.title'),
        man: { x: 0.85, y: 0.8 },
        levers: [{ x: 0.85, y: 0.3 }, { x: 0.2, y: 0.3 }],
        door: { x: 0.15, y: 0.8, width: 0.15, height: 0.15 },
        laser: { x: 0.5, y: 0.0, width: 0.02, height: 1.0, active: true, minX: 0.38, maxX: 0.62, speed: 1.2 },
        plate: { x: 0.65, y: 0.3, width: 0.18, height: 0.05 },
        maxEchoes: 3,
        minRecordings: 2,
        hintIdle: t('level3.hintIdle'),
        hintRecording: [
            t('level3.hintRecording0'),
            t('level3.hintRecording1'),
            t('level3.hintRecording2')
        ],
        hintPlaying: t('level3.hintPlaying')
    }
];

// The original one-hand campaign, alongside the expanded two-hand puzzles.
const EASY_LEVELS: LevelConfig[] = LEVELS.map(level => ({
    ...level,
    lever: level.id === 3 ? { x: 0.85, y: 0.3 } : undefined,
    levers: undefined,
    maxEchoes: level.id === 3 ? 2 : 1,
    minRecordings: level.id === 3 ? 2 : 1,
    hintIdle: t(`easy${level.id}.hintIdle`),
    hintRecording: level.id === 3
        ? [t('easy3.hintRecording0'), t('easy3.hintRecording1')]
        : t(`easy${level.id}.hintRecording`),
    hintPlaying: t(`easy${level.id}.hintPlaying`)
}));

export function getLevelConfig(levelId: number, difficulty: Difficulty): LevelConfig {
    return (difficulty === 'easy' ? EASY_LEVELS : LEVELS)[levelId - 1];
}
