// Artboard geometry and rendering shared by the drawing canvas and exports.
// Everything is in artboard units: a fixed-width coordinate space with the
// pasted chart centered on blank paper. The chart is only ever drawn as the
// bottom layer; strokes live on a separate layer above it, so neither drawing
// nor erasing can change the chart itself.

export const ARTBOARD_WIDTH = 1600;
const CHART_MAX_SIZE = 1000;
const PAPER_MARGIN = 300;

export type Point = [x: number, y: number];

export type Tool = "pen" | "eraser";

export type Stroke = {
  tool: Tool;
  color: string;
  width: number;
  points: Point[];
};

export type Rect = { x: number; y: number; width: number; height: number };

export type Layout = { width: number; height: number; chart: Rect };

export function computeLayout(imageWidth: number, imageHeight: number): Layout {
  const scale = Math.min(
    CHART_MAX_SIZE / imageWidth,
    CHART_MAX_SIZE / imageHeight,
  );
  const width = Math.round(imageWidth * scale);
  const height = Math.round(imageHeight * scale);
  return {
    width: ARTBOARD_WIDTH,
    height: height + PAPER_MARGIN * 2,
    chart: {
      x: Math.round((ARTBOARD_WIDTH - width) / 2),
      y: PAPER_MARGIN,
      width,
      height,
    },
  };
}

export function drawPaper(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  chart: CanvasImageSource,
) {
  const { x, y, width, height } = layout.chart;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, layout.width, layout.height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(chart, x, y, width, height);
}

export function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  const [first] = stroke.points;
  if (!first) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = stroke.width;
  if (stroke.tool === "eraser") {
    ctx.globalCompositeOperation = "destination-out";
    ctx.strokeStyle = ctx.fillStyle = "#000000";
  } else {
    ctx.strokeStyle = ctx.fillStyle = stroke.color;
  }

  ctx.beginPath();
  if (stroke.points.length === 1) {
    ctx.arc(first[0], first[1], stroke.width / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Smooth the raw pointer samples by curving through their midpoints.
    const { points } = stroke;
    ctx.moveTo(first[0], first[1]);
    for (let i = 1; i < points.length - 1; i++) {
      const [x, y] = points[i];
      const [nx, ny] = points[i + 1];
      ctx.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
    }
    const [lx, ly] = points[points.length - 1];
    ctx.lineTo(lx, ly);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawStrokes(ctx: CanvasRenderingContext2D, strokes: Stroke[]) {
  for (const stroke of strokes) drawStroke(ctx, stroke);
}

/** Paper + chart with the stroke layer composited on top, at `scale`× artboard size. */
export function renderArtwork(
  layout: Layout,
  chart: CanvasImageSource,
  strokes: Stroke[],
  scale: number,
): HTMLCanvasElement {
  const output = createCanvas(layout, scale);
  const ctx = output.getContext("2d")!;
  ctx.scale(scale, scale);
  drawPaper(ctx, layout, chart);

  // Strokes render on their own layer so the eraser only removes ink.
  const ink = createCanvas(layout, scale);
  const inkCtx = ink.getContext("2d")!;
  inkCtx.scale(scale, scale);
  drawStrokes(inkCtx, strokes);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(ink, 0, 0);
  return output;
}

function createCanvas(layout: Layout, scale: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(layout.width * scale);
  canvas.height = Math.round(layout.height * scale);
  return canvas;
}
