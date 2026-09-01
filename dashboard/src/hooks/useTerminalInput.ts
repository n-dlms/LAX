import { useRef, useCallback, useState } from "react";
import { execute } from "../cli/executor";
import { navigateHistory, resetHistoryIndex } from "../cli/history";
import { getAutocompleteSuggestions } from "../cli/registry";
import type { CommandResult } from "../cli/types";

export interface OutputEntry {
  raw: string;
  result: CommandResult;
  timestamp: number;
  duration: number;
}

interface TerminalInputState {
  input: string;
  cursorPos: number;
  tempBuffer: string;
  suggestions: string[];
  selectedSuggestion: number;
}

export function useTerminalInput() {
  const [state, setState] = useState<TerminalInputState>({
    input: "",
    cursorPos: 0,
    tempBuffer: "",
    suggestions: [],
    selectedSuggestion: -1,
  });

  const [executing, setExecuting] = useState(false);
  const [lastCommand, setLastCommand] = useState<{ success: boolean; duration: number } | null>(null);
  const scrollbackRef = useRef<OutputEntry[]>([]);
  const [, forceUpdate] = useState(0);

  const scrollback = scrollbackRef.current;

  const addToScrollback = useCallback((entry: OutputEntry) => {
    scrollbackRef.current = [...scrollbackRef.current.slice(-199), entry];
    forceUpdate((n) => n + 1);
  }, []);

  const setInputState = useCallback((updates: Partial<TerminalInputState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  }, []);

  const handleInputChange = useCallback((value: string) => {
    setInputState({ input: value, cursorPos: value.length, suggestions: [], selectedSuggestion: -1 });
    setLastCommand(null);
  }, [setInputState]);

  const executeCommand = useCallback(async (raw: string) => {
    if (!raw.trim() || executing) return;
    setExecuting(true);
    setInputState({ input: "", cursorPos: 0, suggestions: [], selectedSuggestion: -1 });
    setLastCommand(null);
    resetHistoryIndex();

    const start = performance.now();
    const result = await execute(raw);
    const duration = Math.round(performance.now() - start);

    addToScrollback({ raw, result, timestamp: Date.now(), duration });
    setLastCommand({ success: !result.error, duration });
    setExecuting(false);
  }, [executing, addToScrollback, setInputState]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const { input, suggestions, selectedSuggestion } = state;

    switch (e.key) {
      case "Enter": {
        e.preventDefault();
        executeCommand(input);
        break;
      }

      case "ArrowUp": {
        e.preventDefault();
        const prev = navigateHistory("up");
        if (prev !== null) {
          if (state.tempBuffer === "") {
            setInputState({ tempBuffer: input, input: prev, cursorPos: prev.length });
          } else {
            setInputState({ input: prev, cursorPos: prev.length });
          }
        }
        break;
      }

      case "ArrowDown": {
        e.preventDefault();
        const next = navigateHistory("down");
        if (next !== null) {
          setInputState({ input: next, cursorPos: next.length });
        } else {
          setInputState({ input: state.tempBuffer, cursorPos: state.tempBuffer.length, tempBuffer: "" });
        }
        break;
      }

      case "Tab": {
        e.preventDefault();
        if (suggestions.length > 0) {
          const nextIdx = (selectedSuggestion + 1) % suggestions.length;
          const cmd = suggestions[nextIdx];
          setInputState({ input: cmd, cursorPos: cmd.length, selectedSuggestion: nextIdx });
        } else {
          const prefix = input.split(" ").pop() || "";
          const cmds = getAutocompleteSuggestions(prefix);
          if (cmds.length === 1) {
            const parts = input.split(" ");
            parts[parts.length - 1] = cmds[0];
            const completed = parts.join(" ");
            setInputState({ input: completed, cursorPos: completed.length });
          } else if (cmds.length > 1) {
            setInputState({ suggestions: cmds, selectedSuggestion: 0 });
          }
        }
        break;
      }

      case "Escape": {
        setInputState({ suggestions: [], selectedSuggestion: -1 });
        break;
      }

      case "l": {
        if (e.ctrlKey) {
          e.preventDefault();
          scrollbackRef.current = [];
          forceUpdate((n) => n + 1);
        }
        break;
      }

      default: {
        setInputState({ suggestions: [], selectedSuggestion: -1 });
        break;
      }
    }
  }, [state, executeCommand, setInputState]);

  return {
    input: state.input,
    cursorPos: state.cursorPos,
    suggestions: state.suggestions,
    selectedSuggestion: state.selectedSuggestion,
    executing,
    lastCommand,
    scrollback,
    handleKeyDown,
    handleInputChange,
    executeCommand,
    setInput: (val: string) => setInputState({ input: val, cursorPos: val.length }),
  };
}
