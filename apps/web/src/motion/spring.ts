/**
 * A tiny, dependency-free spring integrator.
 *
 * Springs are used instead of CSS transitions for anything a gesture can grab:
 * they animate from the live value, keep their velocity when the target
 * changes, and can be interrupted at any frame. Parameters follow Apple's
 * vocabulary — `response` (how quickly it reaches the target) and `damping`
 * (whether it overshoots) — rather than mass/stiffness/damping.
 */

export type SpringConfig = {
  /** Seconds until the value has essentially reached its target. */
  response: number;
  /** 1 = critically damped (no overshoot), < 1 = bouncier. */
  damping: number;
};

export const springs = {
  /** Default UI motion: graceful, no overshoot. */
  ui: { response: 0.4, damping: 1 },
  /** Sheets and drawers: a little bounce, because a throw preceded it. */
  sheet: { response: 0.3, damping: 0.8 },
} satisfies Record<string, SpringConfig>;

const MAX_STEP_SECONDS = 1 / 240;
const REST_VELOCITY = 6;
const REST_DISTANCE = 0.35;

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Progressive resistance past a boundary: the further the user drags, the less
 * the element follows. Real objects slow before they stop.
 */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

/** Signed velocity in px/s from a short pointer history. A pointer that came to
 * rest before release carries no momentum, so a stale history reads as zero. */
export function readVelocity(
  samples: { y: number; t: number }[],
  releasedAt = samples[samples.length - 1]?.t ?? 0,
): number {
  if (samples.length < 2) return 0;
  const last = samples[samples.length - 1];
  if (releasedAt - last.t > 100) return 0;
  const window = samples.find((sample) => last.t - sample.t <= 100) ?? samples[0];
  const elapsed = last.t - window.t;
  if (elapsed <= 0) return 0;
  return ((last.y - window.y) / elapsed) * 1000;
}

export type SpringHandle = {
  /** Change the target. The current position and velocity are kept, so a
   * reversal blends instead of hitting a brick wall. */
  retarget(nextTarget: number, nextVelocity?: number): void;
  stop(): void;
};

export function createSpring({
  from,
  to,
  velocity = 0,
  config,
  onUpdate,
  onRest,
}: {
  from: number;
  to: number;
  velocity?: number;
  config: SpringConfig;
  onUpdate: (value: number) => void;
  onRest?: () => void;
}): SpringHandle {
  const stiffness = (2 * Math.PI / config.response) ** 2;
  const dampingCoefficient = 2 * config.damping * Math.sqrt(stiffness);

  let position = from;
  let speed = velocity;
  let target = to;
  let frame = 0;
  let last = 0;
  let stopped = false;

  function step(now: number) {
    if (stopped) return;
    if (!last) last = now;
    // Cap the step at 20 fps worth of motion so a background tab cannot explode
    // the integration, then integrate in small fixed sub-steps.
    let remaining = Math.min((now - last) / 1000, 1 / 20);
    last = now;

    while (remaining > 0) {
      const dt = Math.min(remaining, MAX_STEP_SECONDS);
      const acceleration = -stiffness * (position - target) - dampingCoefficient * speed;
      speed += acceleration * dt;
      position += speed * dt;
      remaining -= dt;
    }

    if (Math.abs(speed) < REST_VELOCITY && Math.abs(position - target) < REST_DISTANCE) {
      position = target;
      speed = 0;
      onUpdate(position);
      stopped = true;
      onRest?.();
      return;
    }

    onUpdate(position);
    frame = requestAnimationFrame(step);
  }

  onUpdate(position);
  frame = requestAnimationFrame(step);

  return {
    retarget(nextTarget, nextVelocity) {
      target = nextTarget;
      if (nextVelocity !== undefined) speed = nextVelocity;
      if (stopped) {
        stopped = false;
        last = 0;
        frame = requestAnimationFrame(step);
      }
    },
    stop() {
      stopped = true;
      cancelAnimationFrame(frame);
    },
  };
}
