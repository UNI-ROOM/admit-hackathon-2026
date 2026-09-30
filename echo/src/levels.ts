import { LevelConfig } from './types';

export const LEVELS: LevelConfig[] = [
    {
        id: 1,
        title: "Уровень 1: Призма и Кристалл",
        man: { x: 0.85, y: 0.8 },
        door: { x: 0.15, y: 0.8, width: 0.15, height: 0.15 },
        laser: { x: 0.5, y: 0.0, width: 0.02, height: 1.0, active: true },
        prism: { x: 0.7, y: 0.45, width: 0.09, height: 0.09, direction: 'left' },
        crystal: { x: 0.2, y: 0.45, width: 0.08, height: 0.1 },
        maxEchoes: 1,
        hintIdle: "Поставь <b class='text-cyan-400'>ПРИЗМУ</b> под лазер, чтобы направить луч в кристалл! (10 сек)",
        hintRecording: "Клон направит луч в кристалл. А ТЫ хватай человечка и беги к двери!",
        hintPlaying: "Клон заряжает кристалл! А ТЫ веди человечка в открытую <b class='text-green-400'>ДВЕРЬ</b>!"
    },
    {
        id: 2,
        title: "Уровень 2: Луч и щит",
        man: { x: 0.8, y: 0.8 },
        door: { x: 0.2, y: 0.8, width: 0.15, height: 0.15 },
        laser: { x: 0.5, y: 0.0, width: 0.02, height: 1.0, active: true, minX: 0.38, maxX: 0.62, speed: 1.5 },
        plate: { x: 0.65, y: 0.2, width: 0.15, height: 0.05 },
        maxEchoes: 1,
        hintRecording: "Держи <b class='text-red-400'>ЩИТ</b> под лазером и двигай за ним! (10 сек)",
        hintPlaying: "Клон держит щит. А ТЫ хватай человечка и тащи к <b class='text-green-400'>ДВЕРИ</b>!"
    },
    {
        id: 3,
        title: "Уровень 3: Мульти-Эхо",
        man: { x: 0.85, y: 0.8 },
        lever: { x: 0.85, y: 0.3 },
        door: { x: 0.15, y: 0.8, width: 0.15, height: 0.15 },
        laser: { x: 0.5, y: 0.0, width: 0.02, height: 1.0, active: true, minX: 0.38, maxX: 0.62, speed: 1.2 },
        plate: { x: 0.65, y: 0.3, width: 0.18, height: 0.05 },
        maxEchoes: 2,
        hintRecording: [
            "ЭХО 1/2: Потяни <b class='text-red-400'>РЫЧАГ</b> вниз и держи его! (10 сек)",
            "ЭХО 2/2: Клон 1 держит рычаг. А ты держи <b class='text-blue-400'>ЩИТ</b> и двигай за лазером! (10 сек)"
        ],
        hintPlaying: "Клоны держат рычаг и щит! А ТЫ хватай человечка и спасай его к <b class='text-green-400'>ДВЕРИ</b>!"
    },
    {
        id: 4, title: 'Уровень 4: Пропасть и мост',
        man: { x: 0.2, y: 0.8 }, door: { x: 0.8, y: 0.8, width: 0.15, height: 0.15 },
        pit: { minX: 0.4, maxX: 0.6 }, plate: { x: 0.7, y: 0.5, width: 0.26, height: 0.05 }, maxEchoes: 1,
        hintIdle: 'Над пропастью человечек падает даже в руке. Нужен мост! Ладонь — начать.',
        hintRecording: 'Держи мост по центру пропасти на уровне земли до конца записи.',
        hintPlaying: 'Клон держит мост. Проведи человечка через пропасть к двери!'
    },
    {
        id: 5, title: 'Уровень 5: Два ключа',
        man: { x: 0.5, y: 0.8 }, door: { x: 0.5, y: 0.2, width: 0.15, height: 0.15 },
        levers: [{ x: 0.15, y: 0.3 }, { x: 0.85, y: 0.3 }], maxEchoes: 2,
        hintIdle: 'Два рычага должны быть нажаты одновременно. Запиши двух клонов!',
        hintRecording: ['Клон 1: потяни рычаг A вниз и держи 10 секунд.', 'Клон 2: потяни рычаг B вниз и держи 10 секунд.'],
        hintPlaying: 'Оба клона держат рычаги. Подними человечка к верхней двери!'
    }
];
