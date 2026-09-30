import { LevelConfig } from './types';
import { t } from './i18n';

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
        hintIdle: t('level1.hintIdle'),
        hintRecording: t('level1.hintRecording'),
        hintPlaying: t('level1.hintPlaying')
    },
    {
        id: 2,
        title: t('level2.title'),
        man: { x: 0.8, y: 0.8 },
        door: { x: 0.2, y: 0.8, width: 0.15, height: 0.15 },
        laser: { x: 0.5, y: 0.0, width: 0.02, height: 1.0, active: true, minX: 0.38, maxX: 0.62, speed: 1.5 },
        plate: { x: 0.65, y: 0.2, width: 0.15, height: 0.05 },
        maxEchoes: 1,
        hintRecording: t('level2.hintRecording'),
        hintPlaying: t('level2.hintPlaying')
    },
    {
        id: 3,
        title: t('level3.title'),
        man: { x: 0.85, y: 0.8 },
        lever: { x: 0.85, y: 0.3 },
        door: { x: 0.15, y: 0.8, width: 0.15, height: 0.15 },
        laser: { x: 0.5, y: 0.0, width: 0.02, height: 1.0, active: true, minX: 0.38, maxX: 0.62, speed: 1.2 },
        plate: { x: 0.65, y: 0.3, width: 0.18, height: 0.05 },
        maxEchoes: 2,
        hintRecording: [
            t('level3.hintRecording0'),
            t('level3.hintRecording1')
        ],
        hintPlaying: t('level3.hintPlaying')
    }
];
