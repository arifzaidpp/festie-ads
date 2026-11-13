/** How a media file sits inside the fixed frame of its placement. Pure maths shared by the editor, the canvas and serve. */
import type { Placement } from "./placements";

export interface MediaLayout {
  background: string;
  /** 1 = the whole file fits inside the frame (contain); above 1 it grows past it. */
  scale: number;
  /** Centre of the file relative to the frame centre, as a fraction of the frame width / height. */
  x: number;
  y: number;
}

export const SCALE_RANGE = { min: 0.1, max: 4 } as const;
export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/** The size the baked image has and the aspect of the preview frame, per placement. */
export const FRAME: Record<Placement, { width: number; height: number }> = {
  POSTER_FOOTER: { width: 1800, height: 300 },
  SCREEN_FOOTER: { width: 1920, height: 270 },
  SCREEN_FULLSCREEN: { width: 1920, height: 1080 },
};

export function defaultLayout(placement: Placement): MediaLayout {
  return { background: placement === "POSTER_FOOTER" ? "#ffffff" : "#000000", scale: 1, x: 0, y: 0 };
}

export function clampLayout(l: MediaLayout): MediaLayout {
  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(v) ? v : 0));
  return {
    background: HEX_COLOR.test(l.background) ? l.background.toLowerCase() : "#000000",
    scale: clamp(l.scale, SCALE_RANGE.min, SCALE_RANGE.max),
    x: clamp(l.x, -1, 1),
    y: clamp(l.y, -1, 1),
  };
}

/** Scale at which the file covers the whole frame (no background visible). */
export function coverScale(frame: { width: number; height: number }, media: { width: number; height: number }): number {
  const f = frame.width / frame.height;
  const a = media.width / media.height;
  return a >= f ? a / f : f / a;
}

/** The media rectangle as fractions of the frame: `left`/`top` are the top-left corner, may be outside 0..1. */
export function mediaBox(
  frame: { width: number; height: number },
  media: { width: number; height: number },
  layout: MediaLayout,
) {
  const f = frame.width / frame.height;
  const a = media.width / media.height;
  // Contain: the file touches the frame on its limiting side.
  const containW = a >= f ? 1 : a / f;
  const containH = a >= f ? f / a : 1;
  const width = containW * layout.scale;
  const height = containH * layout.scale;
  return { width, height, left: 0.5 + layout.x - width / 2, top: 0.5 + layout.y - height / 2 };
}

/** Zoom by `factor` keeping the point `at` (fractions of the frame) fixed under the pointer. */
export function zoomAbout(
  layout: MediaLayout,
  factor: number,
  at: { x: number; y: number },
): MediaLayout {
  const scale = Math.min(SCALE_RANGE.max, Math.max(SCALE_RANGE.min, layout.scale * factor));
  const k = scale / layout.scale;
  return clampLayout({
    ...layout,
    scale,
    x: (0.5 + layout.x - at.x) * k + at.x - 0.5,
    y: (0.5 + layout.y - at.y) * k + at.y - 0.5,
  });
}

/**
 * Resize by dragging a corner (`sx`/`sy` are -1 left/top, 1 right/bottom) with the opposite corner staying put.
 * `start` is the layout when the drag began, `to` the pointer in frame fractions. The aspect ratio is kept.
 */
export function resizeFromCorner(
  frame: { width: number; height: number },
  media: { width: number; height: number },
  start: MediaLayout,
  corner: { sx: -1 | 1; sy: -1 | 1 },
  to: { x: number; y: number },
): MediaLayout {
  const b = mediaBox(frame, media, start);
  const anchor = { x: corner.sx === 1 ? b.left : b.left + b.width, y: corner.sy === 1 ? b.top : b.top + b.height };
  const ratio = b.height / b.width;
  // Take the larger of the two pointer distances so both axes feel responsive.
  const wFromX = Math.abs(to.x - anchor.x);
  const wFromY = Math.abs(to.y - anchor.y) / ratio;
  const width = Math.max(wFromX, wFromY);
  const scale = Math.min(SCALE_RANGE.max, Math.max(SCALE_RANGE.min, start.scale * (width / b.width)));
  const w = b.width * (scale / start.scale);
  const h = w * ratio;
  return clampLayout({
    ...start,
    scale,
    x: anchor.x + (corner.sx * w) / 2 - 0.5,
    y: anchor.y + (corner.sy * h) / 2 - 0.5,
  });
}

/** Pulls x / y to 0 when within `threshold` so the file snaps to the frame centre. */
export function snapToCenter(layout: MediaLayout, threshold = 0.012): { layout: MediaLayout; snapX: boolean; snapY: boolean } {
  const snapX = Math.abs(layout.x) < threshold;
  const snapY = Math.abs(layout.y) < threshold;
  return { layout: { ...layout, x: snapX ? 0 : layout.x, y: snapY ? 0 : layout.y }, snapX, snapY };
}
