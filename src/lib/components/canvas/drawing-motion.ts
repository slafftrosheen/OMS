/**
 * OMS Draw motion: short, purposeful, interruptible. Everything here uses
 * transform and opacity only, stays under 240 ms, and is skipped entirely when
 * the user asks the system for reduced motion.
 */
export const DRAWING_EASE_OUT = 'cubic-bezier(.2,.8,.2,1)';
export const DRAWING_EASE_SPRING = 'cubic-bezier(.3,1.4,.5,1)';

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function drawingMotion(element: Element | null | undefined, keyframes: Keyframe[], options: KeyframeAnimationOptions = {}): Animation | null {
  if (!element || prefersReducedMotion() || typeof (element as HTMLElement).animate !== 'function') return null;
  return (element as HTMLElement).animate(keyframes, { duration: 180, easing: DRAWING_EASE_OUT, ...options });
}

/** Named moves so every surface speaks the same motion language. */
export const drawingMoves = {
  /** Docker content when switching dockers: slide in from the rail side. */
  dockerSwap: [{ opacity: 0, transform: 'translateX(10px)' }, { opacity: 1, transform: 'none' }] as Keyframe[],
  /** Property bar when the context changes (tool, selection type). */
  contextSwap: [{ opacity: 0, transform: 'translateY(-3px)' }, { opacity: 1, transform: 'none' }] as Keyframe[],
  /** A value that changed in the status bar. */
  valueTick: [{ opacity: .35, transform: 'translateY(2px)' }, { opacity: 1, transform: 'none' }] as Keyframe[],
  /** Pressed tool or applied command. */
  press: [{ transform: 'scale(.86)' }, { transform: 'scale(1.06)' }, { transform: 'none' }] as Keyframe[],
};
