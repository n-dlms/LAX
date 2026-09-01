import type { HistoryEntry, ParsedArgs, CommandResult } from "./types";

const MAX_HISTORY = 200;
const history: HistoryEntry[] = [];
let historyIndex = -1;

export function pushHistory(raw: string, parsed: { name: string; args: ParsedArgs } | null, result: CommandResult | null, duration: number): void {
  history.push({
    raw,
    parsed,
    timestamp: Date.now(),
    duration,
    result,
    success: !result?.error,
  });
  if (history.length > MAX_HISTORY) history.shift();
  historyIndex = history.length;
}

export function navigateHistory(direction: "up" | "down"): string | null {
  if (history.length === 0) return null;
  if (direction === "up") {
    historyIndex = Math.max(0, historyIndex - 1);
  } else {
    historyIndex = Math.min(history.length, historyIndex + 1);
  }
  if (historyIndex >= history.length) return null;
  return history[historyIndex].raw;
}

export function resetHistoryIndex(): void {
  historyIndex = history.length;
}

export function getHistory(): HistoryEntry[] {
  return [...history];
}

export function historySearch(prefix: string): string[] {
  return history
    .filter((h) => h.raw.startsWith(prefix))
    .slice(-5)
    .map((h) => h.raw);
}
