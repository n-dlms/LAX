import type { CliEvent } from "./types";

export type CliEventListener = (event: CliEvent) => void;

export class CliEventDispatcher {
  private listeners: Set<CliEventListener> = new Set();

  subscribe(fn: CliEventListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  dispatch(event: CliEvent): void {
    for (const fn of this.listeners) fn(event);
  }

  log(level: "info" | "warn" | "error" | "trigger", message: string): void {
    this.dispatch({ type: "log", payload: { ts: Date.now(), level, message } });
  }

  positionUpdate(position: unknown): void {
    this.dispatch({ type: "position-update", payload: position });
  }

  guardianToggle(state: boolean): void {
    this.dispatch({ type: "guardian-toggle", payload: state });
  }

  mockMode(active: boolean): void {
    this.dispatch({ type: "mock-mode", payload: active });
  }

  error(message: string): void {
    this.dispatch({ type: "error", payload: { ts: Date.now(), level: "error" as const, message } });
  }

  clear(): void {
    this.dispatch({ type: "clear", payload: null });
  }
}

export const cliDispatcher = new CliEventDispatcher();
