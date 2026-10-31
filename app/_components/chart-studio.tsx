"use client";

import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  computeLayout,
  renderArtwork,
  type Layout,
  type Stroke,
  type Tool,
} from "../_lib/artboard";
import { EMPTY_HISTORY, historyReducer } from "../_lib/history";
import { DrawingCanvas, type Brush } from "./drawing-canvas";

type Chart = { image: HTMLImageElement; layout: Layout };

const INKS = [
  { name: "Black", value: "#111111" },
  { name: "Red", value: "#e5484d" },
  { name: "Blue", value: "#3e63dd" },
  { name: "Green", value: "#30a46c" },
  { name: "White", value: "#ffffff" },
];

const HINT =
  "Draw around or over the chart. The eraser only removes ink, never the chart.";

export function ChartStudio() {
  const [chart, setChart] = useState<Chart | null>(null);
  const [history, dispatch] = useReducer(historyReducer, EMPTY_HISTORY);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(INKS[0].value);
  const [size, setSize] = useState(4);
  const [message, setMessage] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const strokes = history.present;
  const hasInk = strokes.length > 0;
  const brush: Brush = {
    tool,
    color,
    width: tool === "eraser" ? size * 3 : size,
  };

  const loadChart = useCallback(
    async (file: Blob) => {
      if (!file.type.startsWith("image/")) {
        setMessage("That file isn't an image.");
        return;
      }
      if (
        hasInk &&
        !window.confirm("Replace the chart? This clears the current drawing.")
      ) {
        return;
      }
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.src = url;
      try {
        await image.decode();
      } catch {
        setMessage("Couldn't read that image.");
        return;
      } finally {
        URL.revokeObjectURL(url);
      }
      setChart({
        image,
        layout: computeLayout(image.naturalWidth, image.naturalHeight),
      });
      dispatch({ type: "reset" });
      setMessage(null);
    },
    [hasInk],
  );

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.items ?? [])
        .find((item) => item.kind === "file" && item.type.startsWith("image/"))
        ?.getAsFile();
      if (!file) return;
      event.preventDefault();
      void loadChart(file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [loadChart]);

  useEffect(() => {
    if (!chart) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditable(event.target)) return;
      const key = event.key.toLowerCase();
      const mod = event.metaKey || event.ctrlKey;
      if (mod && key === "z") {
        event.preventDefault();
        dispatch({ type: event.shiftKey ? "redo" : "undo" });
      } else if (mod && key === "y") {
        event.preventDefault();
        dispatch({ type: "redo" });
      } else if (!mod && !event.altKey && (key === "b" || key === "e")) {
        setTool(key === "b" ? "pen" : "eraser");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [chart]);

  const addStroke = useCallback((stroke: Stroke) => {
    dispatch({ type: "add", stroke });
  }, []);

  function exportPng(): Promise<Blob> {
    const current = chart!;
    // Export at the chart's native resolution (up to 2x) so it stays sharp.
    const scale = Math.min(
      Math.max(current.image.naturalWidth / current.layout.chart.width, 1),
      2,
    );
    const canvas = renderArtwork(current.layout, current.image, strokes, scale);
    return new Promise((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Export failed."))),
        "image/png",
      ),
    );
  }

  async function download() {
    const url = URL.createObjectURL(await exportPng());
    const link = document.createElement("a");
    link.href = url;
    link.download = "unicorn-chart.png";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function copy() {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": exportPng() }),
      ]);
      flash("Copied to clipboard.");
    } catch {
      flash("Couldn't copy here. Use Download instead.");
    }
  }

  function flash(text: string) {
    setMessage(text);
    setTimeout(
      () => setMessage((current) => (current === text ? null : current)),
      2500,
    );
  }

  const dropHandlers = {
    onDragOver: (event: React.DragEvent) => {
      if (!event.dataTransfer.types.includes("Files")) return;
      event.preventDefault();
      setDragging(true);
    },
    onDragLeave: (event: React.DragEvent) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
        setDragging(false);
      }
    },
    onDrop: (event: React.DragEvent) => {
      event.preventDefault();
      setDragging(false);
      const file = event.dataTransfer.files[0];
      if (file) void loadChart(file);
    },
  };

  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept="image/*"
      hidden
      onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (file) void loadChart(file);
      }}
    />
  );

  if (!chart) {
    return (
      <section
        {...dropHandlers}
        className={`flex w-full max-w-3xl flex-col items-center gap-3 rounded-xl border-2 border-dashed px-6 py-20 text-center transition-colors ${
          dragging
            ? "border-blue-500 bg-blue-500/5"
            : "border-black/15 dark:border-white/20"
        }`}
      >
        <p className="text-lg font-medium">Paste a chart to start</p>
        <p className="max-w-sm text-sm text-black/60 dark:text-white/60">
          Copy a chart screenshot and press{" "}
          <kbd className="font-mono">⌘V</kbd> /{" "}
          <kbd className="font-mono">Ctrl+V</kbd>, drop an image here, or
        </p>
        <button
          type="button"
          className={buttonClass}
          onClick={() => fileInputRef.current?.click()}
        >
          Choose an image
        </button>
        {message && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {message}
          </p>
        )}
        {fileInput}
      </section>
    );
  }

  return (
    <section
      {...dropHandlers}
      className="flex flex-col items-center gap-3"
      style={{
        // Toolbar and artboard share one width: as wide as fits, but short
        // enough that the whole artboard stays on screen below the toolbar.
        width: `min(100%, max(44rem, calc((100dvh - 13rem) * ${chart.layout.width / chart.layout.height})))`,
      }}
    >
      <div className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <div
            role="group"
            aria-label="Tool"
            className="inline-flex rounded-lg border border-black/10 p-0.5 dark:border-white/15"
          >
            <Segment
              selected={tool === "pen"}
              onClick={() => setTool("pen")}
              title="Pen (B)"
            >
              Pen
            </Segment>
            <Segment
              selected={tool === "eraser"}
              onClick={() => setTool("eraser")}
              title="Eraser (E)"
            >
              Eraser
            </Segment>
          </div>
          <div
            className={`flex items-center gap-1.5 ${tool === "eraser" ? "opacity-40" : ""}`}
            role="radiogroup"
            aria-label="Ink color"
          >
            {INKS.map((ink) => (
              <button
                key={ink.value}
                type="button"
                role="radio"
                aria-checked={color === ink.value}
                aria-label={ink.name}
                title={ink.name}
                onClick={() => {
                  setColor(ink.value);
                  setTool("pen");
                }}
                className={`size-7 rounded-full border border-black/20 ring-offset-2 ring-offset-background dark:border-white/30 ${
                  color === ink.value && tool === "pen"
                    ? "ring-2 ring-blue-500"
                    : ""
                }`}
                style={{ backgroundColor: ink.value }}
              />
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm text-black/70 dark:text-white/70">
            Size
            <input
              type="range"
              min={1}
              max={24}
              value={size}
              onChange={(event) => setSize(Number(event.target.value))}
              className="w-24 accent-blue-500"
            />
            <span className="w-5 tabular-nums">{size}</span>
          </label>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className={buttonClass}
            disabled={history.past.length === 0}
            onClick={() => dispatch({ type: "undo" })}
            title="Undo (⌘Z)"
          >
            Undo
          </button>
          <button
            type="button"
            className={buttonClass}
            disabled={history.future.length === 0}
            onClick={() => dispatch({ type: "redo" })}
            title="Redo (⇧⌘Z)"
          >
            Redo
          </button>
          <button
            type="button"
            className={buttonClass}
            disabled={!hasInk}
            onClick={() => dispatch({ type: "clear" })}
          >
            Clear
          </button>
        </div>
      </div>

      <DrawingCanvas
        layout={chart.layout}
        chart={chart.image}
        strokes={strokes}
        brush={brush}
        onStroke={addStroke}
      >
        {dragging && (
          <div className="absolute inset-0 flex items-center justify-center bg-blue-500/10 text-sm font-medium text-blue-700">
            Drop to replace the chart
          </div>
        )}
      </DrawingCanvas>

      <div className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p role="status" className="text-sm text-black/60 dark:text-white/60">
          {message ?? HINT}
        </p>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className={buttonClass}
            onClick={() => fileInputRef.current?.click()}
          >
            New chart
          </button>
          <button type="button" className={buttonClass} onClick={copy}>
            Copy
          </button>
          <button type="button" className={primaryButtonClass} onClick={download}>
            Download
          </button>
        </div>
      </div>
      {fileInput}
    </section>
  );
}

function Segment({
  selected,
  onClick,
  title,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      title={title}
      onClick={onClick}
      className={`h-8 rounded-md px-3 text-sm font-medium transition-colors ${
        selected
          ? "bg-foreground text-background"
          : "text-black/70 hover:bg-black/5 dark:text-white/70 dark:hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}

function isEditable(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT")
  );
}

const buttonClass =
  "inline-flex h-9 items-center rounded-md border border-black/10 px-3 text-sm font-medium text-black/80 transition-colors hover:bg-black/5 disabled:pointer-events-none disabled:opacity-40 dark:border-white/15 dark:text-white/85 dark:hover:bg-white/10";

const primaryButtonClass =
  "inline-flex h-9 items-center rounded-md bg-foreground px-4 text-sm font-medium text-background transition-opacity hover:opacity-90";
