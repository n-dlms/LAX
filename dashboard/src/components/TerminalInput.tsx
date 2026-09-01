import { useRef, useEffect } from "react";

interface TerminalInputProps {
  value: string;
  executing: boolean;
  suffix?: string;
  className?: string;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onChange: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
}

export default function TerminalInput({
  value,
  executing,
  suffix,
  className = "",
  onKeyDown,
  onChange,
  onFocus,
  onBlur,
}: TerminalInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current && !executing) {
      inputRef.current.focus();
    }
  }, [executing]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (executing && e.key !== "Escape") return;
    onKeyDown(e);
  };

  return (
    <div className={`flex items-center gap-0 w-full ${className}`}>
      <span className="text-green font-bold whitespace-nowrap shrink-0">
        lax@keeperhub
      </span>
      <span className="text-secondary whitespace-nowrap shrink-0"> ~ $ </span>
      {executing ? (
        <span className="text-secondary animate-pulse pl-1">
          {suffix || "running..."}
          <span className="cursor-blink text-green">▍</span>
        </span>
      ) : (
        <div className="relative flex-1 min-w-0 pl-1">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onFocus={onFocus}
            onBlur={onBlur}
            spellCheck={false}
            autoComplete="off"
            className="w-full bg-transparent outline-none border-none text-primary caret-green font-mono"
          />
        </div>
      )}
    </div>
  );
}
