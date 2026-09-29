export type Landmarks = Float32Array;

export interface Frame {
  t: number;
  lm: Landmarks;
}

export interface Recording {
  frames: Frame[];
  duration: number;
  echoIndex: number;
}

export interface Calibration {
  standHipY: number;
  torso: number;
  legsVisible: boolean;
}

export interface PoseState {
  visible: boolean;
  x: number;
  lane: number;
  armUp: { left: boolean; right: boolean };
  crouch: boolean;
  shield: boolean;
  bothUp: boolean;
  raw: {
    wristAboveHead: { left: number; right: number };
    crouchDepth: number;
    wristGap: number;
    wristsCrossed: boolean;
    distToLaneCenter: number;
  };
}

export interface Actor {
  id: 'player' | `echo${number}`;
  state: PoseState;
  stunnedUntil: number;
  color: string;
}

export interface WorldState {
  levers: Record<string, boolean>;
  plates: Record<string, boolean>;
  doors: Record<string, boolean>;
  laserStops: Record<string, number>;
  hits: string[];
  exitProgress: number;
  won: boolean;
  time: number;
}

export interface Lever {
  type: 'lever';
  id: string;
  lane: number;
  hand: 'left' | 'right' | 'any';
}

export interface Plate {
  type: 'plate';
  id: string;
  lane: number;
}

export interface Door {
  type: 'door';
  id: string;
  lane: number;
  openedBy: string[];
  mode: 'all' | 'any';
}

export interface Laser {
  type: 'laser';
  id: string;
  path: number[];
  toLane: number;
  patternOn?: (t: number) => boolean;
}

export interface Exit {
  type: 'exit';
  lane: number;
  door: string;
  holdSec: number;
}

export type LevelObject = Lever | Plate | Door | Laser | Exit;

export interface Level {
  id: string;
  name: string;
  roundSec: number;
  maxEchoes: number;
  startLane: number;
  objects: LevelObject[];
}
