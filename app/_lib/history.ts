import type { Stroke } from "./artboard";

export type History = {
  past: Stroke[][];
  present: Stroke[];
  future: Stroke[][];
};

export type HistoryEvent =
  | { type: "add"; stroke: Stroke }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "clear" }
  | { type: "reset" };

export const EMPTY_HISTORY: History = { past: [], present: [], future: [] };

export function historyReducer(state: History, event: HistoryEvent): History {
  switch (event.type) {
    case "add":
      return {
        past: [...state.past, state.present],
        present: [...state.present, event.stroke],
        future: [],
      };
    case "undo": {
      const previous = state.past.at(-1);
      if (!previous) return state;
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future],
      };
    }
    case "redo": {
      const [next, ...rest] = state.future;
      if (!next) return state;
      return {
        past: [...state.past, state.present],
        present: next,
        future: rest,
      };
    }
    case "clear":
      if (state.present.length === 0) return state;
      return { past: [...state.past, state.present], present: [], future: [] };
    case "reset":
      return EMPTY_HISTORY;
  }
}
