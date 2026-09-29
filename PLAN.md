# Plan: Implement 4th Gesture (Index Finger Pointing) Tutorial

> ✅ **СТАТУС: ВЫПОЛНЕНО.** Реализация завершена, ревью APPROVED (31/31 тестов).
> Два пункта ниже (поле `tutorialGesture` в `types.ts` и `hintTutorialStep4` в `levels.ts`) **сознательно отклонены** как неиспользуемые — финальное решение чище: жест живёт в `utils.isPointing`, инструкция шага 4 — константа в `main.ts`.

## Overview
Add a 4th tutorial step for index finger pointing gesture, update README documentation, and ensure code review readiness.

## Current State
- **3 tutorial steps exist**: Open palm (Step 1), Pinch (Step 2), Fist/Reset (Step 3)
- **README documents 3 steps** under "🎓 Интерактивный туториал (3 шага)"
- **Level switcher** has options for levels 1, 2, 3 plus "Обучение"
- **Code in main.ts** handles tutorial steps 1-3, with step 4 being level-switching hint

## Changes Required

### 1. Update `echo/src/types.ts`
- Add `indexFingerPointing` or similar flag to `GameState` interface
- May need to track tutorial progress through 4 steps

### 2. Update `echo/src/levels.ts`
- Add hint configurations for 4th tutorial step
- Possibly add `hintTutorialStep4` or similar

### 3. Update `echo/src/main.ts`
- Extend tutorial logic to handle step 4 (index finger pointing)
- Add detection for `isIndexFingerPointing` gesture
- Update modeIndicator and instruction for 4/4 step
- Connect to level selection flow

### 4. Update `README.md`
- Change "🎓 Интерактивный туториал (3 шага)" to "(4 шага)"
- Add new gesture table row for "Указательный палец" (Index finger)
- Update the gesture matrix to include 4th gesture

### 5. Code Review Checklist
- [ ] Gesture detection logic is correct
- [ ] Tutorial flow is sequential and logical
- [ ] No regressions in existing 3 steps
- [ ] README accurately documents changes
- [ ] Type safety maintained

## Implementation Details

### Gesture: Index Finger Pointing
- **Visual**: 指向 пальцем (pointing with index finger)
- **Detection**: Extended index finger while other fingers are curled
- **Purpose**: Advance to next level/tutorial or select action
- **Position**: Index finger tip extended, other fingers closed

### Tutorial Flow (4 steps)
1. **Step 1**: Show open palm 🖐️ - Start calibration
2. **Step 2**: Pinch to grab cube 🤏 - Object capture
3. **Step 3**: Fist to reset loop ✊ - Emergency reset
4. **Step 4**: Point with index finger 👆 - Advance/select level

### README Updates
- Update level counter from 3 to 4 steps
- Add new gesture visualization and description
- Update gesture matrix with 4th row

## Files to Modify
1. `echo/src/types.ts` - Add tutorial step tracking
2. `echo/src/levels.ts` - Add step 4 hint configuration  
3. `echo/src/main.ts` - Extend tutorial logic for step 4
4. `README.md` - Update documentation and gesture table