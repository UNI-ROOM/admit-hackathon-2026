import { Level, Actor, WorldState, Recording, Laser } from './types';

export interface Hint {
  id: string;
  text: string;
  severity: 'error' | 'warn' | 'tip';
  priority: number;
  anchor?: 'player' | 'lever' | 'door' | 'laser' | `echo${number}`;
}

export interface HintContext {
  level: Level;
  actors: Actor[];
  world: WorldState;
  recordings: Recording[];
  t: number;
}

type Rule = (ctx: HintContext) => Hint | null;

const rules: Rule[] = [
  // Rule A (not_visible)
  (ctx) => {
    const player = ctx.actors.find(a => a.id === 'player');
    if (player && !player.state.visible) {
      return {
        id: 'not_visible',
        text: 'Тебя не видно. Встань перед камерой в 2 м, чтобы поместиться целиком',
        severity: 'error',
        priority: 100,
        anchor: 'player'
      };
    }
    return null;
  },

  // Rule B (arm_low)
  (ctx) => {
    const player = ctx.actors.find(a => a.id === 'player');
    if (!player) return null;

    // Check if in or near a lever's lane
    const nearLever = ctx.level.objects.some(
      o => o.type === 'lever' && Math.abs(o.lane - player.state.lane) <= 1
    );

    if (nearLever) {
      const wristAboveHead = Math.min(
        player.state.raw.wristAboveHead.left,
        player.state.raw.wristAboveHead.right
      );

      if (wristAboveHead > -0.6 && wristAboveHead < 0.05) {
        const cm = Math.round(Math.abs(wristAboveHead) * 50);
        const handStr = player.state.raw.wristAboveHead.left < player.state.raw.wristAboveHead.right ? 'левую' : 'правую';
        
        return {
          id: 'arm_low',
          text: `Подними ${handStr} руку выше — ещё ${cm} см до рычага`,
          severity: 'warn',
          priority: 80,
          anchor: 'player'
        };
      }
    }
    return null;
  },

  // Rule C (crouch_shallow)
  (ctx) => {
    const player = ctx.actors.find(a => a.id === 'player');
    if (!player) return null;

    const inPlateLane = ctx.level.objects.some(
      o => o.type === 'plate' && o.lane === player.state.lane
    );

    const inLaserPath = ctx.level.objects.some(
      o => o.type === 'laser' && (o as Laser).path.includes(player.state.lane)
    );

    if (inPlateLane || inLaserPath) {
      const crouchDepth = player.state.raw.crouchDepth;
      if (crouchDepth > 0.1 && crouchDepth < 0.35) {
        const cm = Math.round(Math.abs(crouchDepth) * 50);
        const textSuffix = inPlateLane ? 'кнопка не нажата' : 'луч задевает голову';
        
        return {
          id: 'crouch_shallow',
          text: `Присядь глубже — ещё ${cm} см, ${textSuffix}`,
          severity: 'warn',
          priority: 80,
          anchor: 'player'
        };
      }
    }
    return null;
  },

  // Rule D (shield_gap)
  (ctx) => {
    const player = ctx.actors.find(a => a.id === 'player');
    if (!player) return null;

    const wristGap = player.state.raw.wristGap;
    const wristsBelowHead = player.state.raw.wristAboveHead.left > 0 && player.state.raw.wristAboveHead.right > 0;
    
    if (wristGap > 0.9 && wristsBelowHead) {
      return {
        id: 'shield_gap',
        text: 'Сведи руки плотнее — в щите дыра',
        severity: 'warn',
        priority: 85,
        anchor: 'player'
      };
    }
    return null;
  }
];

interface HintEngineState {
  conditionStartT: Map<string, number>;
  activeHint: Hint | null;
  activeHintStartT: number;
  lastShownT: Map<string, number>;
}

const state: HintEngineState = {
  conditionStartT: new Map(),
  activeHint: null,
  activeHintStartT: 0,
  lastShownT: new Map()
};

export function evaluate(
  level: Level,
  actors: Actor[],
  world: WorldState,
  recordings: Recording[],
  t: number
): Hint | null {
  const ctx: HintContext = { level, actors, world, recordings, t };
  
  const candidates: Hint[] = [];
  for (const rule of rules) {
    const hint = rule(ctx);
    if (hint) {
      candidates.push(hint);
    }
  }

  candidates.sort((a, b) => b.priority - a.priority);

  const currentConditionIds = new Set(candidates.map(c => c.id));
  for (const id of state.conditionStartT.keys()) {
    if (!currentConditionIds.has(id)) {
      state.conditionStartT.delete(id);
    }
  }

  let bestHint: Hint | null = null;

  for (const candidate of candidates) {
    if (!state.conditionStartT.has(candidate.id)) {
      state.conditionStartT.set(candidate.id, t);
    }

    const holdTime = t - state.conditionStartT.get(candidate.id)!;
    
    if (holdTime >= 0.6) {
      if (candidate.severity !== 'error') {
        const lastShown = state.lastShownT.get(candidate.id) || -Infinity;
        if (t - lastShown < 8 && state.activeHint?.id !== candidate.id) {
          continue; 
        }
      }
      bestHint = candidate;
      break; 
    }
  }

  if (state.activeHint) {
    const displayTime = t - state.activeHintStartT;
    const isCurrentError = state.activeHint.severity === 'error';
    
    if (!isCurrentError && displayTime < 2.5) {
      if (bestHint && bestHint.severity === 'error') {
        // Error overrides minimum display time
      } else {
        const currentCandidate = candidates.find(c => c.id === state.activeHint!.id);
        if (currentCandidate) {
          state.activeHint = currentCandidate;
        }
        return state.activeHint;
      }
    }
  }

  if (bestHint) {
    if (state.activeHint?.id !== bestHint.id) {
      state.activeHint = bestHint;
      state.activeHintStartT = t;
      state.lastShownT.set(bestHint.id, t);
    } else {
      state.activeHint = bestHint;
    }
  } else {
    if (state.activeHint) {
      const displayTime = t - state.activeHintStartT;
      const isError = state.activeHint.severity === 'error';
      if (!isError && displayTime < 2.5) {
        // Keep active hint until 2.5s pass
      } else {
        state.activeHint = null;
      }
    }
  }

  return state.activeHint;
}
