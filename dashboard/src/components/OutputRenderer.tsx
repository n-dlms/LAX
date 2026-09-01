import type { CommandResult } from "../cli/types";

interface OutputRendererProps {
  result: CommandResult;
}

const statusColor: Record<string, string> = {
  success: "text-green",
  error: "text-red",
  warning: "text-yellow",
  info: "text-cyan",
};

export default function OutputRenderer({ result }: OutputRendererProps) {
  const status: keyof typeof statusColor = result.error ? "error" : "success";

  if (!result.output) return null;

  return (
    <div className={`text-xs leading-5 ${statusColor[status] || "text-primary"}`}>
      {result.output.split("\n").map((line, i) => (
        <div key={i} className="whitespace-pre-wrap break-all">
          {line}
        </div>
      ))}
    </div>
  );
}
