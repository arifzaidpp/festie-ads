"use client";

import { Maximize2, RotateCcw, Scan } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { clampLayout, coverScale, defaultLayout, FRAME, mediaBox, resizeFromCorner, snapToCenter, zoomAbout, type MediaLayout } from "@/lib/media-layout";
import { PLACEMENT_LABEL, type MediaType, type Placement } from "@/lib/placements";

export interface EditorSource {
  kind: MediaType;
  /** Where the file can be shown from: an object URL for a new file, our file route for an earlier upload. */
  url: string;
  width: number;
  height: number;
}

const SWATCHES = ["#000000", "#ffffff", "#f5f5f5", "#111827", "#dc2626", "#2563eb"];

/** Filled when the file already has the frame's shape, so it needs no background. */
export function initialLayout(placement: Placement, media: { width: number; height: number }): MediaLayout {
  const base = defaultLayout(placement);
  const cover = coverScale(FRAME[placement], media);
  return cover < 1.04 ? { ...base, scale: cover } : base;
}

/** JPEG of the frame size: the background colour, then the file drawn with the layout. Under 5 MB. */
export async function bakeImage(img: HTMLImageElement, placement: Placement, layout: MediaLayout): Promise<Blob> {
  const frame = FRAME[placement];
  const canvas = document.createElement("canvas");
  canvas.width = frame.width;
  canvas.height = frame.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser cannot edit images.");
  ctx.fillStyle = layout.background;
  ctx.fillRect(0, 0, frame.width, frame.height);
  const box = mediaBox(frame, { width: img.naturalWidth, height: img.naturalHeight }, layout);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, box.left * frame.width, box.top * frame.height, box.width * frame.width, box.height * frame.height);
  for (const quality of [0.92, 0.82, 0.7]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= 5 * 1024 * 1024) return blob;
  }
  throw new Error("The edited image is too large.");
}

type Corner = { sx: -1 | 1; sy: -1 | 1 };
const CORNERS: Corner[] = [
  { sx: -1, sy: -1 },
  { sx: 1, sy: -1 },
  { sx: -1, sy: 1 },
  { sx: 1, sy: 1 },
];
type Gesture =
  | { mode: "move"; x: number; y: number; layout: MediaLayout }
  | { mode: "resize"; corner: Corner; layout: MediaLayout }
  | { mode: "pinch"; dist: number; at: { x: number; y: number }; layout: MediaLayout }
  | null;

/**
 * Places the file inside the fixed frame of the placement, directly on the preview: drag to move, wheel / pinch
 * to zoom, corner handles to resize, double-click for Fit / Fill, arrow keys and + / - from the keyboard.
 * Images are baked to the exact frame size on apply; a video keeps its file and the layout travels with the ad.
 */
export function MediaEditor({
  placement,
  source,
  initial,
  busy,
  onApply,
  onCancel,
}: {
  placement: Placement;
  source: EditorSource;
  initial: MediaLayout;
  busy: boolean;
  onApply: (layout: MediaLayout, image: HTMLImageElement | null) => void;
  onCancel: () => void;
}) {
  const frame = FRAME[placement];
  const [layout, setLayoutState] = useState<MediaLayout>(clampLayout(initial));
  const [guides, setGuides] = useState({ x: false, y: false });
  const [colorOpen, setColorOpen] = useState(false);
  const layoutRef = useRef(layout);
  const imgRef = useRef<HTMLImageElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());

  const setLayout = (next: MediaLayout) => {
    layoutRef.current = next;
    setLayoutState(next);
  };
  const update = (patch: Partial<MediaLayout>) => setLayout(clampLayout({ ...layoutRef.current, ...patch }));
  const box = mediaBox(frame, source, layout);
  const cover = coverScale(frame, source);

  /** Pointer position as fractions of the frame. */
  function toFrame(clientX: number, clientY: number) {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0.5, y: 0.5 };
    return { x: (clientX - rect.left) / rect.width, y: (clientY - rect.top) / rect.height };
  }

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const at = { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      setLayout(zoomAbout(layoutRef.current, factor, at));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  function startPinch() {
    const [a, b] = [...pointers.current.values()];
    if (!a || !b) return;
    gesture.current = {
      mode: "pinch",
      dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      at: toFrame((a.x + b.x) / 2, (a.y + b.y) / 2),
      layout: layoutRef.current,
    };
  }
  function down(e: PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) startPinch();
    else gesture.current = { mode: "move", x: e.clientX, y: e.clientY, layout: layoutRef.current };
  }
  function downCorner(e: PointerEvent<HTMLElement>, corner: Corner) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    gesture.current = { mode: "resize", corner, layout: layoutRef.current };
  }
  function move(e: PointerEvent<HTMLElement>) {
    const g = gesture.current;
    if (!g || !pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return;
    if (g.mode === "move") {
      const next = clampLayout({ ...g.layout, x: g.layout.x + (e.clientX - g.x) / rect.width, y: g.layout.y + (e.clientY - g.y) / rect.height });
      const snapped = snapToCenter(next);
      setGuides({ x: snapped.snapX, y: snapped.snapY });
      setLayout(snapped.layout);
    } else if (g.mode === "resize") {
      setLayout(resizeFromCorner(frame, source, g.layout, g.corner, toFrame(e.clientX, e.clientY)));
    } else if (pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      if (a && b) setLayout(zoomAbout(g.layout, (Math.hypot(a.x - b.x, a.y - b.y) || 1) / g.dist, g.at));
    }
  }
  function up(e: PointerEvent<HTMLElement>) {
    pointers.current.delete(e.pointerId);
    gesture.current = null;
    setGuides({ x: false, y: false });
  }
  function key(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? 0.05 : 0.01;
    const l = layoutRef.current;
    const at = { x: 0.5 + l.x, y: 0.5 + l.y };
    if (e.key === "ArrowLeft") update({ x: l.x - step });
    else if (e.key === "ArrowRight") update({ x: l.x + step });
    else if (e.key === "ArrowUp") update({ y: l.y - step });
    else if (e.key === "ArrowDown") update({ y: l.y + step });
    else if (e.key === "+" || e.key === "=") setLayout(zoomAbout(l, 1.1, at));
    else if (e.key === "-") setLayout(zoomAbout(l, 1 / 1.1, at));
    else return;
    e.preventDefault();
  }
  const fit = () => update({ scale: 1, x: 0, y: 0 });
  const fill = () => update({ scale: cover, x: 0, y: 0 });
  const toggleFitFill = () => (Math.abs(layoutRef.current.scale - cover) < 0.01 ? fit() : fill());

  const pct = (v: number) => `${Math.min(100, Math.max(0, v * 100))}%`;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {PLACEMENT_LABEL[placement]}: {frame.width} x {frame.height}. Drag to move, scroll or pinch to zoom, drag a corner to resize.
      </p>

      <div className="relative">
        <div
          ref={frameRef}
          tabIndex={0}
          aria-label="Media position. Arrow keys move, plus and minus zoom."
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onKeyDown={key}
          onDoubleClick={toggleFitFill}
          className="relative w-full cursor-grab touch-none overflow-hidden rounded-xl outline-none select-none focus-visible:ring-[3px] focus-visible:ring-ring/50 active:cursor-grabbing"
          style={{ aspectRatio: `${frame.width} / ${frame.height}`, backgroundColor: layout.background }}
        >
          <div
            className="pointer-events-none absolute"
            style={{ left: `${box.left * 100}%`, top: `${box.top * 100}%`, width: `${box.width * 100}%`, height: `${box.height * 100}%` }}
          >
            {source.kind === "IMAGE" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img ref={imgRef} src={source.url} alt="Ad being edited" draggable={false} className="size-full" />
            ) : (
              <video src={source.url} muted loop autoPlay playsInline className="size-full" />
            )}
          </div>
          {guides.x ? <span className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-primary" aria-hidden /> : null}
          {guides.y ? <span className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-primary" aria-hidden /> : null}
          <span className="pointer-events-none absolute right-2 bottom-2 rounded-md bg-black/60 px-1.5 py-0.5 text-2xs font-medium text-white">{Math.round(layout.scale * 100)}%</span>
          <span className="pointer-events-none absolute" style={{ left: `${box.left * 100}%`, top: `${box.top * 100}%`, width: `${box.width * 100}%`, height: `${box.height * 100}%`, boxShadow: "inset 0 0 0 1px var(--primary)" }} aria-hidden />
        </div>
        {CORNERS.map((c) => (
          <span
            key={`${c.sx}${c.sy}`}
            role="presentation"
            onPointerDown={(e) => downCorner(e, c)}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            className="absolute z-10 size-3 -translate-x-1/2 -translate-y-1/2 touch-none rounded-full border-2 border-primary bg-background"
            style={{ left: pct(c.sx === -1 ? box.left : box.left + box.width), top: pct(c.sy === -1 ? box.top : box.top + box.height), cursor: c.sx === c.sy ? "nwse-resize" : "nesw-resize" }}
          />
        ))}
      </div>

      <div className="relative flex flex-wrap items-center gap-2">
        <Button compact variant="outline" icon={<Scan />} onClick={fit}>
          Fit
        </Button>
        <Button compact variant="outline" icon={<Maximize2 />} onClick={fill}>
          Fill
        </Button>
        <Button compact variant="outline" onClick={() => setColorOpen((o) => !o)} aria-expanded={colorOpen} aria-label="Background colour">
          <span className="size-4 rounded-full border border-border/80" style={{ backgroundColor: layout.background }} aria-hidden />
          Background
        </Button>
        {colorOpen ? (
          <div className="absolute bottom-full left-0 z-20 mb-2 w-64 space-y-2 rounded-xl border border-border/80 bg-background p-3 shadow-lg">
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label="Background colour"
                value={layout.background}
                onChange={(e) => update({ background: e.target.value })}
                className="h-control w-12 shrink-0 cursor-pointer rounded-xl border-0 bg-shell-control p-1"
              />
              <Input value={layout.background} onChange={(e) => setLayout({ ...layoutRef.current, background: e.target.value })} onBlur={() => update({})} maxLength={7} className="w-28 font-mono" />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SWATCHES.map((c) => (
                <button key={c} type="button" aria-label={`Use ${c}`} onClick={() => update({ background: c })} className="size-6 rounded-full border border-border/80" style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col-reverse gap-2 border-t border-border/40 pt-3 sm:flex-row sm:justify-end">
        <Button variant="ghost-muted" icon={<RotateCcw />} onClick={() => setLayout(initialLayout(placement, source))} className="sm:mr-auto">
          Reset
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button loading={busy} onClick={() => onApply(layoutRef.current, imgRef.current)}>
          Use this
        </Button>
      </div>
    </div>
  );
}

/** The ad's media in its frame, as it will look: the saved layout for a video, the baked image as is. */
export function FramePreview({
  placement,
  kind,
  url,
  media,
  layout,
}: {
  placement: Placement;
  kind: MediaType;
  url: string | null;
  media: { width: number; height: number };
  layout: MediaLayout | null;
}) {
  const frame = FRAME[placement];
  const l = layout ?? defaultLayout(placement);
  const box = mediaBox(frame, media, kind === "VIDEO" ? l : { ...l, scale: 1, x: 0, y: 0 });
  return (
    <div
      className="relative w-full max-w-xl overflow-hidden rounded-xl bg-shell"
      style={{ aspectRatio: `${frame.width} / ${frame.height}`, backgroundColor: kind === "VIDEO" ? l.background : undefined }}
    >
      {url ? (
        <div className="absolute" style={{ left: `${box.left * 100}%`, top: `${box.top * 100}%`, width: `${box.width * 100}%`, height: `${box.height * 100}%` }}>
          {kind === "IMAGE" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="Ad preview" className="size-full" />
          ) : (
            <video src={url} controls muted className="size-full" />
          )}
        </div>
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">No media yet</span>
      )}
    </div>
  );
}
