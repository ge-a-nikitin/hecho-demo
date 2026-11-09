import {
  createSpring,
  prefersReducedMotion,
  readVelocity,
  rubberband,
  springs,
  type SpringHandle,
} from "./spring";

/**
 * Sheet motion controller.
 *
 * On touch layouts the order detail is a bottom sheet the user can throw away:
 * the gesture tracks the pointer 1:1 from the moment it commits to a direction,
 * resists past the open position, and hands its release velocity to the spring.
 * On wider layouts the same surface is a centred dialog that materialises with
 * a short scale/opacity spring and can still be interrupted.
 */

const SHEET_LAYOUT = "(max-width: 640px)";
const DRAG_HYSTERESIS = 10;
const DISMISS_FRACTION = 0.3;
const FLICK_VELOCITY = 600;
const DESKTOP_TRAVEL = 16;
const INTERACTIVE = "button, a, input, select, textarea";

export type SheetMotion = {
  /** Animate in from the current layout's closed position. */
  enter(): void;
  /** Animate out; resolves once the surface is off-screen. */
  exit(): Promise<void>;
  /** Make an element the drag handle. Returns a detach function. */
  attachDragSurface(surface: HTMLElement): () => void;
  destroy(): void;
};

export function createSheetMotion({
  sheet,
  scrim,
  onDismissed,
}: {
  sheet: HTMLElement;
  scrim: HTMLElement;
  onDismissed: () => void;
}): SheetMotion {
  const reduced = prefersReducedMotion();
  let current = 0;
  let spring: SpringHandle | null = null;
  let exitPromise: Promise<void> | null = null;

  const isSheetLayout = () => window.matchMedia(SHEET_LAYOUT).matches;
  const travel = () => (isSheetLayout() ? sheet.offsetHeight || window.innerHeight : DESKTOP_TRAVEL);

  function paint(value: number) {
    const distance = Math.max(1, travel());
    const progress = Math.min(1, Math.max(0, value / distance));
    const offset = value.toFixed(2);

    if (isSheetLayout()) {
      sheet.style.transform = `translate3d(0, ${offset}px, 0)`;
      scrim.style.opacity = String(1 - progress);
      return;
    }

    sheet.style.transform =
      `translate3d(0, ${offset}px, 0) scale(${(1 - progress * 0.04).toFixed(4)})`;
    sheet.style.opacity = String(1 - progress * 0.92);
    scrim.style.opacity = String(1 - progress);
  }

  function stopSpring() {
    spring?.stop();
    spring = null;
  }

  function animateTo(target: number, velocity = 0, onRest?: () => void) {
    stopSpring();
    if (reduced) {
      current = target;
      paint(target);
      onRest?.();
      return;
    }
    spring = createSpring({
      from: current,
      to: target,
      velocity,
      config: springs.sheet,
      onUpdate: (value) => {
        current = value;
        paint(value);
      },
      onRest: () => {
        spring = null;
        onRest?.();
      },
    });
  }

  function enter() {
    current = reduced ? 0 : travel();
    paint(current);
    if (!reduced) animateTo(0);
  }

  function exit(): Promise<void> {
    if (exitPromise) return exitPromise;
    sheet.removeAttribute("data-dragging");
    exitPromise = new Promise<void>((resolve) => {
      animateTo(travel(), 0, resolve);
    });
    return exitPromise;
  }

  function attachDragSurface(surface: HTMLElement): () => void {
    let pointerId: number | null = null;
    let startY = 0;
    let startX = 0;
    let dragging = false;
    let samples: { y: number; t: number }[] = [];

    function release() {
      if (pointerId === null) return;
      if (surface.hasPointerCapture(pointerId)) surface.releasePointerCapture(pointerId);
      pointerId = null;
      dragging = false;
      sheet.removeAttribute("data-dragging");
    }

    function onPointerDown(event: PointerEvent) {
      if (reduced || exitPromise || !isSheetLayout()) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const target = event.target as HTMLElement | null;
      // Controls inside the handle keep their own behaviour.
      if (target?.closest(INTERACTIVE)) return;

      pointerId = event.pointerId;
      startY = event.clientY;
      startX = event.clientX;
      dragging = false;
      samples = [{ y: event.clientY, t: event.timeStamp }];
      surface.setPointerCapture(event.pointerId);
    }

    function onPointerMove(event: PointerEvent) {
      if (event.pointerId !== pointerId) return;
      const dy = event.clientY - startY;
      const dx = event.clientX - startX;

      if (!dragging) {
        // Commit to a vertical drag only after a small, deliberate movement.
        if (Math.abs(dy) < DRAG_HYSTERESIS || Math.abs(dx) > Math.abs(dy)) return;
        dragging = true;
        stopSpring();
        sheet.setAttribute("data-dragging", "true");
      }

      event.preventDefault();
      samples.push({ y: event.clientY, t: event.timeStamp });
      if (samples.length > 8) samples.shift();

      current = dy >= 0 ? dy : -rubberband(-dy, travel());
      paint(current);
    }

    function onPointerUp(event: PointerEvent) {
      if (event.pointerId !== pointerId) return;
      if (exitPromise) {
        // A close was already requested (button or Esc); let it finish.
        release();
        return;
      }
      const wasDragging = dragging;
      const velocity = readVelocity(samples, event.timeStamp);
      release();
      if (!wasDragging) return;

      // Decide by velocity first, position second: a flick downwards dismisses
      // even from a short distance, a flick upwards always returns.
      const passed = current > travel() * DISMISS_FRACTION;
      const flickedDown = velocity > FLICK_VELOCITY;
      const flickedUp = velocity < -FLICK_VELOCITY;

      if (flickedDown || (passed && !flickedUp)) {
        animateTo(travel(), Math.max(velocity, 0), onDismissed);
        return;
      }
      animateTo(0, Math.min(velocity, 0));
    }

    function onPointerCancel(event: PointerEvent) {
      if (event.pointerId !== pointerId) return;
      const wasDragging = dragging;
      release();
      if (wasDragging) animateTo(0, 0);
    }

    surface.addEventListener("pointerdown", onPointerDown);
    surface.addEventListener("pointermove", onPointerMove);
    surface.addEventListener("pointerup", onPointerUp);
    surface.addEventListener("pointercancel", onPointerCancel);

    return () => {
      surface.removeEventListener("pointerdown", onPointerDown);
      surface.removeEventListener("pointermove", onPointerMove);
      surface.removeEventListener("pointerup", onPointerUp);
      surface.removeEventListener("pointercancel", onPointerCancel);
    };
  }

  return {
    enter,
    exit,
    attachDragSurface,
    destroy() {
      stopSpring();
      sheet.removeAttribute("data-dragging");
    },
  };
}

