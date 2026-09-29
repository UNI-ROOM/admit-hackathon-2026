export interface LevelConfig {
    id: number;
    title: string;
    man: { x: number, y: number };
    lever?: { x: number, y: number };
    door: { x: number, y: number, width: number, height: number };
    laser?: { 
        x: number; 
        y: number; 
        width: number; 
        height: number; 
        active: boolean;
        minX?: number;
        maxX?: number;
        speed?: number;
    };
    plate?: { x: number, y: number, width: number, height: number };
    maxEchoes?: number;
}

export const LEVELS: LevelConfig[] = [
    {
        id: 1,
        title: "Уровень 1: Простая прогулка",
        man: { x: 0.5, y: 0.8 },
        lever: { x: 0.7, y: 0.5 },
        door: { x: 0.3, y: 0.6, width: 0.15, height: 0.15 },
        maxEchoes: 1
    },
    {
        id: 2,
        title: "Уровень 2: Луч и щит",
        man: { x: 0.8, y: 0.8 },
        door: { x: 0.2, y: 0.8, width: 0.15, height: 0.15 },
        laser: { x: 0.5, y: 0.0, width: 0.02, height: 1.0, active: true, minX: 0.38, maxX: 0.62, speed: 1.5 },
        plate: { x: 0.65, y: 0.2, width: 0.15, height: 0.05 },
        maxEchoes: 1
    },
    {
        id: 3,
        title: "Уровень 3: Мульти-Эхо",
        man: { x: 0.85, y: 0.8 },
        lever: { x: 0.85, y: 0.3 },
        door: { x: 0.15, y: 0.8, width: 0.15, height: 0.15 },
        laser: { x: 0.5, y: 0.0, width: 0.02, height: 1.0, active: true, minX: 0.38, maxX: 0.62, speed: 1.2 },
        plate: { x: 0.65, y: 0.3, width: 0.18, height: 0.05 },
        maxEchoes: 2
    }
];
