import type { HandLandmarks } from './hands';
import type { Difficulty } from '../../shared/score';

export type EchoFrame = { hands: [HandLandmarks | null, HandLandmarks | null]; timeMs?: number } | HandLandmarks | null;

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

export interface Crystal extends Entity {
    width: number;
    height: number;
    charge: number;      // 0.0 to 1.0
    charged: boolean;    // true when charge >= 1.0
    baseY?: number;
}

export interface Prism extends Entity {
    width: number;
    height: number;
    direction: 'left' | 'right';
}

export interface ReflectedLaser {
    active: boolean;
    startX: number;
    startY: number;
    endX: number;
    endY: number;
}

export interface GameState {
    difficulty: Difficulty;
    livePlay: boolean;
    winTimeLeftMs: number | null;
    winEchoesUsed: number;
    mode: 'TUTORIAL' | 'IDLE' | 'RECORDING' | 'PLAYING' | 'WON';
    tutorialStep: number;
    deaths: number;
    resets: number;
    attemptStart: number;
    frames: EchoFrame[];
    recordedEchoes: EchoFrame[][];
    echoIndex: number;
    recordingHands: 1 | 2;
    maxEchoes: number;
    playStartTime: number;
    currentFrame: number;
    recordStartTime: number;
    RECORD_DURATION: number;
    currentLevel: number;
    wonTimeoutSet?: boolean;
    baseInstruction: string;
}

export interface LevelConfig {
    id: number;
    title: string;
    man: { x: number, y: number };
    lever?: { x: number, y: number };
    levers?: { x: number, y: number }[];
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
    crystal?: { x: number, y: number, width: number, height: number };
    prism?: { x: number, y: number, width: number, height: number, direction: 'left' | 'right' };
    maxEchoes?: number;
    latchLevers?: boolean;
    hintIdle?: string;
    hintRecording?: string | string[];
    hintPlaying?: string;
}
