import { afterEach, describe, expect, it, vi } from "vitest";
import { qc } from "../../../api/src/test-support/qase-case";
import { createSpring, readVelocity, rubberband, springs } from "./spring";

let frames: ((now: number) => void)[] = [];

function stubAnimationFrames(): void {
  frames = [];
  vi.stubGlobal("requestAnimationFrame", (callback: (now: number) => void) => {
    frames.push(callback);

    return frames.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
}

/** Runs the callbacks the spring scheduled and returns how many there were. */
function pumpFrame(now: number): number {
  const scheduled = frames;

  frames = [];
  for (const callback of scheduled) callback(now);

  return scheduled.length;
}

afterEach(() => {
  vi.unstubAllGlobals();
  frames = [];
});

describe("Web", () => {
  describe("Motion", () => {
    it(
      qc("web.motion.rubberband", "resists progressively the further a gesture is dragged past its limit"),
      () => {
        expect(rubberband(0, 400)).toBe(0);

        const small = rubberband(100, 400);
        const large = rubberband(200, 400);

        expect(small).toBeGreaterThan(0);
        expect(large).toBeGreaterThan(small);
        expect(large - small).toBeLessThan(small);

        expect(Math.abs(rubberband(-100, 400))).toBeCloseTo(small, 10);
        expect(rubberband(100, 400)).toBeLessThan(100);
        expect(rubberband(1000, 400)).toBeLessThan(1000);

        const wide = rubberband(100, 800);

        expect(wide).toBeGreaterThan(small);
        expect(wide).toBeLessThan(100);
      },
    );

    it(
      qc("web.motion.release-velocity", "reads the throw velocity from a pointer history and drops a stale one"),
      () => {
        const movingDown = [
          { y: 0, t: 0 },
          { y: 100, t: 100 },
        ];

        expect(readVelocity(movingDown)).toBeCloseTo(1000, 10);
        expect(readVelocity([{ y: 100, t: 0 }, { y: 0, t: 100 }])).toBeCloseTo(-1000, 10);
        expect(readVelocity(movingDown, 150)).toBeCloseTo(1000, 10);

        expect(readVelocity(movingDown, 250)).toBe(0);
        expect(readVelocity([{ y: 42, t: 100 }])).toBe(0);
        expect(readVelocity([])).toBe(0);
        expect(readVelocity([{ y: 0, t: 10 }, { y: 50, t: 10 }])).toBe(0);
      },
    );

    it(
      qc("web.motion.spring-settles", "settles on its target and reports rest instead of oscillating forever"),
      () => {
        stubAnimationFrames();

        const onUpdate = vi.fn<(value: number) => void>();
        const onRest = vi.fn();
        createSpring({ from: 0, to: 1, config: springs.ui, onUpdate, onRest });

        expect(onUpdate).toHaveBeenLastCalledWith(0);

        let now = 0;
        for (let frame = 0; frame < 600 && onRest.mock.calls.length === 0; frame += 1) {
          now += 16;
          expect(pumpFrame(now)).toBeGreaterThan(0);
        }

        expect(onRest).toHaveBeenCalledTimes(1);
        expect(onUpdate).toHaveBeenLastCalledWith(1);
        expect(frames).toHaveLength(0);

        pumpFrame(now + 16);

        expect(onRest).toHaveBeenCalledTimes(1);

        const retargetUpdate = vi.fn<(value: number) => void>();
        const retargetRest = vi.fn();
        const handle = createSpring({
          from: 0,
          to: 1000,
          config: springs.ui,
          onUpdate: retargetUpdate,
          onRest: retargetRest,
        });

        for (let frame = 0; frame < 3; frame += 1) {
          now += 16;
          pumpFrame(now);
        }

        const before = retargetUpdate.mock.calls[retargetUpdate.mock.calls.length - 1][0];

        expect(before).toBeGreaterThan(0);
        expect(before).toBeLessThan(1000);
        expect(retargetRest).not.toHaveBeenCalled();

        handle.retarget(0, 0);

        now += 16;
        pumpFrame(now);

        const after = retargetUpdate.mock.calls[retargetUpdate.mock.calls.length - 1][0];

        expect(after).toBeLessThan(before);
        expect(after).toBeGreaterThan(0);
        expect(Math.abs(before - after)).toBeLessThan(before / 2);
      },
    );
  });
});
