import { Actor, Level, WorldState, Lever, Plate, Door, Laser, Exit } from './types';

export function createInitialState(t: number = 0): WorldState {
  return {
    levers: {},
    plates: {},
    doors: {},
    laserStops: {},
    hits: [],
    exitProgress: 0,
    won: false,
    time: t,
  };
}

export function evaluate(
  level: Level,
  actors: Actor[],
  t: number,
  prev: WorldState
): WorldState {
  // Clamp dt to avoid huge jumps on first frame or after pause
  const dt = Math.max(0, Math.min(t - prev.time, 0.1));

  const next: WorldState = {
    levers: {},
    plates: {},
    doors: {},
    laserStops: {},
    hits: [],
    exitProgress: 0,
    won: false,
    time: t,
  };

  let activeActors = actors.filter(a => a.state.visible && a.stunnedUntil <= t);

  // 1. Process lasers
  const lasers = level.objects.filter((o): o is Laser => o.type === 'laser');
  for (const laser of lasers) {
    if (laser.patternOn && !laser.patternOn(t)) {
      continue;
    }

    let stopLane = laser.toLane;
    // Find the first lane in the path that has a shield
    for (const lane of laser.path) {
      const hasShield = activeActors.some(a => a.state.lane === lane && a.state.shield);
      if (hasShield) {
        stopLane = lane;
        break;
      }
    }

    next.laserStops[laser.id] = stopLane;

    // Check hits up to stopLane (inclusive)
    for (const lane of laser.path) {
      for (const a of activeActors) {
        if (a.state.lane === lane) {
          if (!a.state.crouch && !a.state.shield) {
            a.stunnedUntil = t + 2.0; // Stun for 2 seconds
            next.hits.push(a.id);
          }
        }
      }
      if (lane === stopLane) {
        break;
      }
    }
  }

  // Update activeActors since some might have been stunned by lasers
  activeActors = actors.filter(a => a.state.visible && a.stunnedUntil <= t);

  // 2. Process levers
  const levers = level.objects.filter((o): o is Lever => o.type === 'lever');
  for (const lever of levers) {
    next.levers[lever.id] = activeActors.some(a => {
      if (a.state.lane !== lever.lane) return false;
      if (lever.hand === 'left') return a.state.armUp.left;
      if (lever.hand === 'right') return a.state.armUp.right;
      return a.state.armUp.left || a.state.armUp.right; // 'any'
    });
  }

  // 3. Process plates
  const plates = level.objects.filter((o): o is Plate => o.type === 'plate');
  for (const plate of plates) {
    next.plates[plate.id] = activeActors.some(a => a.state.lane === plate.lane && a.state.crouch);
  }

  // 4. Process doors
  const doors = level.objects.filter((o): o is Door => o.type === 'door');
  for (const door of doors) {
    const isOpened = (id: string) => next.levers[id] || next.plates[id];
    if (door.mode === 'all') {
      next.doors[door.id] = door.openedBy.length > 0 && door.openedBy.every(isOpened);
    } else {
      next.doors[door.id] = door.openedBy.some(isOpened);
    }
  }

  // 5. Process exit
  const exit = level.objects.find((o): o is Exit => o.type === 'exit');
  if (exit) {
    const player = actors.find(a => a.id === 'player');
    if (player && player.state.lane === exit.lane && next.doors[exit.door]) {
      next.exitProgress = prev.exitProgress + (dt / exit.holdSec);
    } else {
      next.exitProgress = 0;
    }

    if (next.exitProgress >= 1) {
      next.won = true;
      next.exitProgress = 1;
    }
  }

  return next;
}
