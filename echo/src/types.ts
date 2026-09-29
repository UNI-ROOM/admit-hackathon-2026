export interface Point {
    x: number;
    y: number;
}

export interface Entity {
    x: number;
    y: number;
    grabbedBy: string | null;
}

export interface Man extends Entity {
    color: string;
}

export interface Lever extends Entity {
    handleY: number;
    active: boolean;
}

export interface Door {
    x: number;
    y: number;
    width: number;
    height: number;
    open: boolean;
}

export interface TutorialBox extends Entity {}

export interface TutorialTarget {
    x: number;
    y: number;
    radius: number;
}

export interface Plate extends Entity {
    width: number;
    height: number;
}

export interface Laser {
    x: number;
    y: number;
    width: number;
    height: number;
    active: boolean;
    minX?: number;
    maxX?: number;
    speed?: number;
}

export interface GameState {
    mode: 'TUTORIAL' | 'IDLE' | 'RECORDING' | 'PLAYING' | 'WON';
    tutorialStep: number;
    frames: any[];
    recordedEchoes: any[][];
    echoIndex: number;
    maxEchoes: number;
    playStartTime: number;
    currentFrame: number;
    recordStartTime: number;
    RECORD_DURATION: number;
    currentLevel: number;
    wonTimeoutSet?: boolean;
    baseInstruction: string;
}
