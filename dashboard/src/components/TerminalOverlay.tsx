import { useRef, useEffect } from "react";
import TerminalInput from "./TerminalInput";
import OutputRenderer from "./OutputRenderer";
import type { OutputEntry } from "../hooks/useTerminalInput";
import { APP_NAME } from "../types";

interface TerminalOverlayProps {
  visible: boolean;
  input: string;
  executing: boolean;
  scrollback: OutputEntry[];
  suggestions: string[];
  selectedSuggestion: number;
  onClose: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onChange: (value: string) => void;
}

export default function TerminalOverlay({
  visible,
  input,
  executing,
  scrollback,
  suggestions,
  selectedSuggestion,
  onClose,
  onKeyDown,
  onChange,
}: TerminalOverlayProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [scrollback, input, visible]);

  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !executing) {
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [visible, executing, onClose]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-40 bg-bgcol/95 backdrop-blur-sm animate-fade-in">
      <div className="flex flex-col h-full max-w-4xl mx-auto p-4">
        <div className="flex items-center justify-between mb-2 shrink-0">
          <span className="text-xs text-secondary font-mono">
            {APP_NAME} Terminal — {scrollback.length} entries
          </span>
          <button
            onClick={onClose}
            className="text-xs text-secondary hover:text-primary border border-bordercol px-2 py-0.5 transition-colors cursor-pointer"
          >
            ESC to close
          </button>
        </div>

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto bg-surface border border-bordercol p-3 mb-2"
        >
          {scrollback.length === 0 ? (
            <div className="text-secondary text-xs leading-5 animate-fade-in">
              <div className="text-green mb-2">{APP_NAME} Terminal — Liquidation Autopilot</div>
              <div className="mb-2">Type <span className="text-cyan">help</span> for available commands.</div>
              <div className="text-secondary">lax@keeperhub ~ $ ▍</div>
            </div>
          ) : (
            scrollback.map((entry, i) => (
              <div key={i} className="mb-2 animate-log-entry">
                <div className="flex items-start gap-2">
                  <span className="text-green shrink-0 font-bold">❯</span>
                  <span className="text-primary whitespace-pre-wrap break-all">{entry.raw}</span>
                </div>
                <div className="ml-4 mt-0.5">
                  <div className="text-secondary text-[10px]">
                    {entry.result.error ? "error" : "success"} · {entry.duration}ms
                  </div>
                  <OutputRenderer result={entry.result} />
                </div>
              </div>
            ))
          )}
        </div>

        <div className="shrink-0 bg-surface border border-bordercol p-2">
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-1">
              {suggestions.map((s, i) => (
                <span
                  key={s}
                  className={`text-xs px-1.5 py-0.5 border cursor-pointer ${
                    i === selectedSuggestion
                      ? "border-amber text-amber"
                      : "border-bordercol text-secondary hover:text-primary"
                  }`}
                  onClick={() => onChange(s)}
                >
                  {s}
                </span>
              ))}
            </div>
          )}
          <TerminalInput
            value={input}
            executing={executing}
            onKeyDown={onKeyDown}
            onChange={onChange}
          />
        </div>
      </div>
    </div>
  );
}
