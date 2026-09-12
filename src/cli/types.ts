export type CommandCategory =
  | "monitor"
  | "mock"
  | "guardian"
  | "onchain"
  | "audit"
  | "system";

export type RoutingTier =
  | "rpc-read"
  | "rpc-write"
  | "keeperhub-workflow"
  | "local-only"
  | "simulation";

export type FallbackStrategy = "no-fallback" | "keepers-fail-local" | "local-fail-keepers";

export interface ParsedArgs {
  positional: string[];
  flags: Record<string, string>;
}

export interface CommandResult {
  output: string;
  eventLogEntry?: { level: "info" | "warn" | "error" | "trigger"; message: string };
  shouldUpdatePosition?: boolean;
  shouldRefreshAudit?: boolean;
  error?: string;
}

export interface GuardianState {
  enabled: boolean;
  blocked: boolean;
  threshold: number;
  target: number;
}

export interface CommandDefinition {
  name: string;
  syntax: string;
  description: string;
  category: CommandCategory;
  routing: RoutingTier;
  fallback?: {
    strategy: FallbackStrategy;
    altRouting: RoutingTier;
  };
  confirmRequired?: boolean;
  handler: (ctx: CommandContext, args: ParsedArgs) => Promise<CommandResult>;
  examples?: string[];
  aliases?: string[];
}

export interface Snapshot {
  id: string;
  timestamp: number;
  label?: string;
  position: {
    hf: bigint;
    totalCollateralUSD: bigint;
    totalDebtUSD: bigint;
    availableBorrowsUSD: bigint;
  };
  oracle: {
    wethPrice: bigint;
    usdcPrice: bigint;
  };
  blockNumber: number;
}

export interface ExecutionRecord {
  id: string;
  command: string;
  timestamp: number;
  txHashes: string[];
  status: "triggered" | "verified-onchain" | "failed";
}

export interface HistoryEntry {
  raw: string;
  parsed: { name: string; args: ParsedArgs } | null;
  timestamp: number;
  duration: number;
  result: CommandResult | null;
  success: boolean;
}

export type ErrorType =
  | "command-not-found"
  | "missing-arg"
  | "invalid-flag"
  | "rpc-error"
  | "keeperhub-error"
  | "execution-failed"
  | "network-error"
  | "timeout"
  | "guardian-blocked"
  | "internal-error"
  | "needs-confirmation";

export interface CliError {
  type: ErrorType;
  message: string;
  suggestion?: string;
  command?: string;
}

export interface CommandContext {
  rpc: <T>(method: string, params: unknown[]) => Promise<T>;
  position: () => {
    healthFactor: bigint;
    totalCollateralUSD: bigint;
    totalDebtUSD: bigint;
    availableBorrowsUSD: bigint;
    blockNumber: bigint;
  } | null;
  config: typeof import("./lax-config").LAX_CONFIG;
  appendLog: (level: "info" | "warn" | "error" | "trigger", message: string) => void;
  refreshPosition: () => Promise<void>;
  setGuardianState: (state: Partial<GuardianState>) => void;
  getGuardianState: () => GuardianState;
  setMockMode: (active: boolean) => void;
  getMockMode: () => boolean;
  clearLogs: () => void;
  engageProtection: () => void;
  emit: (event: CliEvent) => void;
  getSnapshot: (id: string) => Snapshot | undefined;
  addSnapshot: (snap: Snapshot) => void;
  listSnapshots: () => Snapshot[];
  addExecutionRecord: (rec: ExecutionRecord) => void;
  getExecutionRecords: () => ExecutionRecord[];
  /** Persisted mitigation-log access (node contexts). Browser contexts omit
   *  these — `lax runs` then falls back to session-local records. */
  readMitigations?: (limit?: number) => import("../mitigation-record").MitigationRecord[];
  mitigationLogPath?: () => string;
}

export type CliEvent = {
  type: "log" | "position-update" | "oracle-update" | "guardian-toggle" | "mock-mode" | "error" | "clear";
  payload: unknown;
};
