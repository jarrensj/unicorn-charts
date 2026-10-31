"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  drawPaper,
  drawStroke,
  drawStrokes,
  type Layout,
  type Point,
  type Stroke,
} from "../_lib/artboard";

export type Brush = Omit<Stroke, "points">;

type Props = {
  layout: Layout;
  chart: HTMLImageElement;
  strokes: Stroke[];
  brush: Brush;
  onStroke: (stroke: Stroke) => void;
  /** Overlays positioned over the artboard. */
  children?: React.ReactNode;
};

type Scale = { css: number; device: number };

// Device pixels per artboard unit are capped so huge screens don't allocate
// enormous canvases.
const MAX_DEVICE_SCALE = 2.5;

export function DrawingCanvas({
  layout,
  chart,
  strokes,
  brush,
  onStroke,
  children,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLCanvasElement>(null);
  const inkRef = useRef<HTMLCanvasElement>(null);
  // Committed strokes, pre-rendered so live drawing only paints one stroke.
  const committedRef = useRef<HTMLCanvasElement | null>(null);
  const activeRef = useRef<{ pointerId: number; stroke: Stroke } | null>(null);
  const frameRef = useRef<number | null>(null);
  const [scale, setScale] = useState<Scale | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      const cssWidth = entry.contentRect.width;
      if (cssWidth === 0) return;
      setScale({
        css: cssWidth / layout.width,
        device: Math.min(
          (cssWidth * window.devicePixelRatio) / layout.width,
          MAX_DEVICE_SCALE,
        ),
      });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [layout.width]);

  const paintInk = useCallback(() => {
    const ink = inkRef.current;
    const committed = committedRef.current;
    if (!ink || !committed || !scale) return;
    const ctx = ink.getContext("2d")!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ink.width, ink.height);
    ctx.drawImage(committed, 0, 0);
    const active = activeRef.current;
    if (active) {
      ctx.setTransform(scale.device, 0, 0, scale.device, 0, 0);
      drawStroke(ctx, active.stroke);
    }
  }, [scale]);

  useEffect(() => {
    const paper = paperRef.current;
    if (!paper || !scale) return;
    fitCanvas(paper, layout, scale.device);
    const ctx = paper.getContext("2d")!;
    ctx.setTransform(scale.device, 0, 0, scale.device, 0, 0);
    drawPaper(ctx, layout, chart);
  }, [layout, chart, scale]);

  useEffect(() => {
    const ink = inkRef.current;
    if (!ink || !scale) return;
    const committed = (committedRef.current ??= document.createElement("canvas"));
    fitCanvas(committed, layout, scale.device);
    fitCanvas(ink, layout, scale.device);
    const ctx = committed.getContext("2d")!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, committed.width, committed.height);
    ctx.setTransform(scale.device, 0, 0, scale.device, 0, 0);
    drawStrokes(ctx, strokes);
    paintInk();
  }, [strokes, layout, scale, paintInk]);

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  const schedulePaint = () => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      paintInk();
    });
  };

  const toPoint = (event: { clientX: number; clientY: number }): Point => {
    const rect = inkRef.current!.getBoundingClientRect();
    return [
      round((event.clientX - rect.left) * (layout.width / rect.width)),
      round((event.clientY - rect.top) * (layout.height / rect.height)),
    ];
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (activeRef.current) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    activeRef.current = {
      pointerId: event.pointerId,
      stroke: { ...brush, points: [toPoint(event)] },
    };
    schedulePaint();
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const active = activeRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const coalesced = event.nativeEvent.getCoalescedEvents?.() ?? [];
    const samples = coalesced.length > 0 ? coalesced : [event.nativeEvent];
    const { points } = active.stroke;
    for (const sample of samples) {
      const point = toPoint(sample);
      const last = points[points.length - 1];
      if (Math.hypot(point[0] - last[0], point[1] - last[1]) >= 1) {
        points.push(point);
      }
    }
    schedulePaint();
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const active = activeRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    activeRef.current = null;
    // The committed layer repaints with this stroke once the parent re-renders;
    // painting before then would flash the stroke away for a frame.
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    onStroke(active.stroke);
  };

  const cursor = useMemo(
    () => (scale ? brushCursor(brush.width * scale.css) : "crosshair"),
    [brush, scale],
  );

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden rounded-lg border border-black/10 bg-white shadow-sm dark:border-white/15"
      style={{ aspectRatio: `${layout.width} / ${layout.height}` }}
    >
      <canvas ref={paperRef} className="absolute inset-0 h-full w-full" />
      <canvas
        ref={inkRef}
        aria-label="Drawing canvas"
        className="absolute inset-0 h-full w-full touch-none"
        style={{ cursor }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
      />
      {children}
    </div>
  );
}

function fitCanvas(canvas: HTMLCanvasElement, layout: Layout, scale: number) {
  const width = Math.round(layout.width * scale);
  const height = Math.round(layout.height * scale);
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
}

function round(n: number) {
  return Math.round(n * 10) / 10;
}

/** Outline of the brush tip at its on-screen size. */
function brushCursor(diameter: number) {
  const d = Math.min(Math.max(diameter, 4), 120);
  const size = Math.ceil(d + 4);
  const c = size / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${c}" cy="${c}" r="${d / 2}" fill="none" stroke="white" stroke-width="2.5"/><circle cx="${c}" cy="${c}" r="${d / 2}" fill="none" stroke="black" stroke-width="1"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${c} ${c}, crosshair`;
}
