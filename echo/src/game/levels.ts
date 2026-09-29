import { Level } from './types';

export const L1: Level = {
  id: 'door',
  name: 'Дверь',
  roundSec: 20,
  maxEchoes: 1,
  startLane: 3,
  objects: [
    { type: 'lever', id: 'lv1', lane: 2, hand: 'any' },
    { type: 'door', id: 'd1', lane: 4, openedBy: ['lv1'], mode: 'all' },
    { type: 'exit', lane: 4, door: 'd1', holdSec: 1 },
  ],
};

export const L2: Level = {
  id: 'laser_plate',
  name: 'Луч и плита',
  roundSec: 25,
  maxEchoes: 2,
  startLane: 3,
  objects: [
    { type: 'laser', id: 'lsr1', path: [1, 2, 3], toLane: 3, patternOn: () => true },
    { type: 'plate', id: 'p1', lane: 2 },
    { type: 'lever', id: 'lv2', lane: 4, hand: 'right' },
    { type: 'door', id: 'd2', lane: 5, openedBy: ['p1', 'lv2'], mode: 'all' },
    { type: 'exit', lane: 5, door: 'd2', holdSec: 1 },
  ],
};

export const LEVELS = [L1, L2];
