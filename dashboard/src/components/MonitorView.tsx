import { useRef, useEffect, useState, useCallback } from "react";
import type {
  UserPosition,
  LogEntry,
  MitigationEvent,
} from "../types";
import { LAX_CONFIG, APP_NAME } from "../cli/lax-config";
import { usePositionPoller, POLL_INTERVAL_MS } from "../hooks/usePositionPoller";
import { useTerminalInput } from "../hooks/useTerminalInput";
import { rpcRequest } from "../utils/rpc";
import { setCommandContext, cliDispatcher, getGuardianState, setGuardianState as setCliGuardianState, setMockMode, isMockMode, addSnapshot, listSnapshots, getSnapshot, addExecutionRecord, getExecutionRecords } from "../cli";
import type { CommandContext } from "../cli";
import TerminalInput from "./TerminalInput";
import TerminalOverlay from "./TerminalOverlay";
import OutputRenderer from "./OutputRenderer";
import type { OutputEntry } from "../hooks/useTerminalInput";
import { fmtDollars as fmt$, fmtHf, fmtHfShort, fmtTime, fmtTimeShort, fmtBlock, hfToNumber, MAX_HF, calcLiquidationPct, logLevelClass, decodeAddress, encodeAddressParam, encodeUintParam } from "../utils/format";

const LOG_CAP = 200;

// ---- Helpers local ----
function fmtUSDC(amount: bigint): string {
  const whole = amount / 1_000_000n;
  const frac = amount % 1_000_000n;
  return `${whole.toString()}.${frac.toString().padStart(6, "0")} USDC`;
}

function computeRepayAmount(totalDebtBase: bigint, hfCurrent: bigint, hfTarget: bigint): bigint {
  const hfDelta = hfTarget - hfCurrent;
  if (hfDelta <= 0n) return 0n;
  const debt18 = totalDebtBase * 10n ** 10n;
  const repay18 = (debt18 * hfDelta) / hfTarget;
  return repay18 / 10n ** 12n;
}

function triggerToBigint(trigger: number): bigint {
  return BigInt(Math.round(trigger * 1e18));
}

function isValidAddress(addr: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(addr);
}

function getWatchedAddressKey(): string {
  return `${APP_NAME.toLowerCase().replace(/\s+/g, "_")}_watched_address`;
}
function getRpcUrlKey(): string {
  return `${APP_NAME.toLowerCase().replace(/\s+/g, "_")}_rpc_url`;
}
function getProtectedKey(): string {
  return `${APP_NAME.toLowerCase().replace(/\s+/g, "_")}_protected_positions`;
}

function loadWatchedAddress(): string {
  try {
    const v = localStorage.getItem(getWatchedAddressKey());
    if (v && isValidAddress(v)) return v;
  } catch {}
  return LAX_CONFIG.BORROWER_ADDRESS;
}
function loadRpcUrl(): string {
  try {
    const v = localStorage.getItem(getRpcUrlKey());
    if (v && v.startsWith("http")) return v;
  } catch {}
  return LAX_CONFIG.FORK_RPC;
}

// ---- Poll Countdown ----
function PollCountdown({ lastReadAt, pollMs, listenerAlive }: { lastReadAt: number | null; pollMs: number; listenerAlive: boolean }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!listenerAlive || lastReadAt == null) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [listenerAlive, lastReadAt]);
  if (!listenerAlive) {
    return <span>Retrying connection…</span>;
  }
  if (lastReadAt == null) {
    return <span>Awaiting first poll…</span>;
  }
  const next = lastReadAt + pollMs;
  const remainingMs = Math.max(0, next - now);
  const secs = (remainingMs / 1000).toFixed(1);
  return <span>Next poll in {secs}s</span>;
}

// ---- Watch Config Panel (M1/M2/M3) ----
function WatchConfigPanel({
  watchedAddress,
  rpcUrl,
  onWatchedAddressChange,
  onRpcUrlChange,
  onConnectWallet,
}: {
  watchedAddress: string;
  rpcUrl: string;
  onWatchedAddressChange: (addr: string) => void;
  onRpcUrlChange: (url: string) => void;
  onConnectWallet: () => void;
}) {
  const [addrInput, setAddrInput] = useState(watchedAddress);
  const [rpcInput, setRpcInput] = useState(rpcUrl);
  const [addrError, setAddrError] = useState<string | null>(null);
  const [walletStatus, setWalletStatus] = useState<string | null>(null);

  useEffect(() => { setAddrInput(watchedAddress); }, [watchedAddress]);
  useEffect(() => { setRpcInput(rpcUrl); }, [rpcUrl]);

  const handleWatch = () => {
    if (!isValidAddress(addrInput)) {
      setAddrError("Invalid address — must be 0x + 40 hex chars");
      return;
    }
    setAddrError(null);
    onWatchedAddressChange(addrInput);
  };

  const handleRpcSave = () => {
    if (!rpcInput.startsWith("http")) {
      return;
    }
    onRpcUrlChange(rpcInput);
  };

  const handleWalletClick = async () => {
    setWalletStatus(null);
    await onConnectWallet();
  };

  const networkLabel = rpcUrl.includes("127.0.0.1") || rpcUrl.includes("localhost") ? "Base fork · local" : rpcUrl.includes("base.org") ? "Base" : "Custom";
  let host = rpcUrl;
  try { host = new URL(rpcUrl).host; } catch {}

  return (
    <div className="bg-surface border border-bordercol p-4 animate-slide-up">
      <div className="text-xs text-secondary uppercase tracking-widest mb-3">{APP_NAME} — Watch Position</div>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1">
            <div className="text-[10px] text-secondary uppercase">Borrower Address</div>
            <input
              value={addrInput}
              onChange={(e) => setAddrInput(e.target.value)}
              placeholder="0x..."
              className="w-full bg-bgcol border border-bordercol px-2 py-1.5 text-xs font-mono text-primary placeholder:text-secondary focus:border-cyan outline-none"
            />
            {addrError && <div className="text-[10px] text-red mt-1">{addrError}</div>}
            <div className="text-[10px] text-secondary mt-1 truncate">Watching: <span className="text-cyan font-mono">{watchedAddress.slice(0,10)}...{watchedAddress.slice(-6)}</span> · {networkLabel} · {host}</div>
          </div>
          <div className="flex flex-col gap-1 justify-end">
            <button type="button" onClick={handleWatch} className="border border-cyan text-cyan px-3 py-1.5 text-xs font-bold hover:bg-cyan hover:text-bgcol transition-colors">Watch this position</button>
            <button type="button" onClick={handleWalletClick} className="border border-bordercol text-secondary px-3 py-1 text-[10px] hover:border-cyan hover:text-cyan transition-colors">Connect wallet</button>
            {walletStatus && <div className="text-[10px] text-secondary">{walletStatus}</div>}
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1">
            <div className="text-[10px] text-secondary uppercase">RPC Endpoint</div>
            <input
              value={rpcInput}
              onChange={(e) => setRpcInput(e.target.value)}
              placeholder="https://mainnet.base.org"
              className="w-full bg-bgcol border border-bordercol px-2 py-1.5 text-xs font-mono text-primary placeholder:text-secondary focus:border-cyan outline-none"
            />
            <div className="text-[10px] text-secondary mt-1">Fork: {LAX_CONFIG.FORK_RPC} · Public: {LAX_CONFIG.PUBLIC_RPC}</div>
          </div>
          <div className="flex flex-col gap-1 justify-end">
            <div className="flex gap-1">
              <button type="button" onClick={() => { setRpcInput(LAX_CONFIG.FORK_RPC); onRpcUrlChange(LAX_CONFIG.FORK_RPC); }} className="border border-bordercol text-secondary px-2 py-1 text-[10px] hover:border-cyan hover:text-cyan">Use Fork</button>
              <button type="button" onClick={() => { setRpcInput(LAX_CONFIG.PUBLIC_RPC); onRpcUrlChange(LAX_CONFIG.PUBLIC_RPC); }} className="border border-bordercol text-secondary px-2 py-1 text-[10px] hover:border-cyan hover:text-cyan">Use Public</button>
            </div>
            <button type="button" onClick={handleRpcSave} className="border border-cyan text-cyan px-3 py-1 text-xs hover:bg-cyan hover:text-bgcol">Save RPC</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Protected Positions Panel (M5) ----
function ProtectedPositionsPanel({ currentAddress, currentHf, rpcUrl }: { currentAddress: string; currentHf: bigint; rpcUrl: string }) {
  const [positions, setPositions] = useState<Array<{ address: string; network: string; hf: string; lastAction: string }>>(() => {
    try {
      const raw = localStorage.getItem(getProtectedKey());
      if (raw) return JSON.parse(raw);
    } catch {}
    return [];
  });

  // Update on current address/hf change — record current as protected if HF known
  useEffect(() => {
    if (!currentAddress || currentHf === 0n) return;
    const hfStr = currentHf >= MAX_HF/2n ? "∞" : (Number(currentHf)/1e18).toFixed(2);
    const net = rpcUrl.includes("127.0.0.1") || rpcUrl.includes("localhost") ? "Base fork" : rpcUrl.includes("base.org") ? "Base" : "Custom";
    const entry = { address: currentAddress, network: net, hf: hfStr, lastAction: new Date().toLocaleTimeString() };
    setPositions((prev) => {
      const filtered = prev.filter(p => p.address.toLowerCase() !== currentAddress.toLowerCase());
      const next = [entry, ...filtered].slice(0, 5);
      try { localStorage.setItem(getProtectedKey(), JSON.stringify(next)); } catch {}
      return next;
    });
  }, [currentAddress, currentHf, rpcUrl]);

  if (positions.length === 0) return null;
  return (
    <div className="bg-surface border border-bordercol p-3 animate-slide-up">
      <div className="text-xs text-secondary uppercase tracking-widest mb-2">{APP_NAME} — Protected Positions</div>
      <div className="text-[10px] text-secondary mb-2">Your position protects itself while you sleep. It already does for these addresses.</div>
      <div className="space-y-1">
        {positions.map((p) => {
          const isLive = p.address.toLowerCase() === currentAddress.toLowerCase();
          return (
            <div key={p.address} className="flex justify-between text-xs border border-bordercol px-2 py-1 bg-bgcol">
              <span className="font-mono text-cyan">{p.address.slice(0,6)}...{p.address.slice(-4)}</span>
              <span className="text-secondary">
                {(p.network === "Anvil" ? "Base fork" : p.network)} · HF {p.hf}{" "}
                {isLive
                  ? <span className="text-green">· live</span>
                  : <span className="text-secondary text-[10px]">· as of {p.lastAction}</span>}
              </span>
              <span className="text-secondary text-[10px]">{isLive ? "watching" : p.lastAction}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- Liquidation Distance Gauge ----
function LiquidationGauge({ hf, listenerAlive }: { hf: bigint; listenerAlive: boolean }) {
  const isInfinite = hf >= MAX_HF / 2n;
  const rawVal = isInfinite ? 2.0 : hfToNumber(hf);

  const distancePct = calcLiquidationPct(hf);
  const gaugeMax = 25;
  const gaugePct = distancePct === null ? 100 : Math.min(distancePct / gaugeMax, 1.0) * 100;

  let hfColor = "text-green";
  let hfLabel = "Safe";
  let pulseClass = "";

  if (rawVal < 1.05) {
    hfColor = "text-red";
    hfLabel = "Critical";
    pulseClass = "heartbeat-pulse";
  } else if (rawVal < 1.1) {
    hfColor = "text-red";
    hfLabel = "Danger";
    pulseClass = "heartbeat-pulse";
  } else if (rawVal < 1.5) {
    hfColor = "text-yellow";
    hfLabel = "Warning";
  }

  // Gauge bar color based on distance
  let gaugeColor = "bg-green";
  if (distancePct !== null) {
    if (distancePct < 5) gaugeColor = "bg-red";
    else if (distancePct < 10) gaugeColor = "bg-orange";
    else if (distancePct < 20) gaugeColor = "bg-yellow";
  }

  return (
    <div className="animate-fade-in">
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-sm text-secondary">Liquidation Distance</span>
        <div className="flex items-center gap-2">
          <span className={`text-xs border px-1.5 py-0.5 ${hfColor} border-current ${pulseClass}`}>
            {hfLabel}
          </span>
          <span className={`text-2xl font-mono leading-none transition-colors duration-500 ${hfColor} ${pulseClass}`}>
            {listenerAlive ? fmtHf(hf) : "---"}
          </span>
        </div>
      </div>
      <div className="relative w-full h-3 bg-bordercol overflow-hidden">
        <div
          className={`h-full transition-all duration-700 ease-out ${gaugeColor} ${!listenerAlive ? "opacity-30" : ""}`}
          style={{ width: listenerAlive ? `${gaugePct}%` : "0%" }}
        />
      </div>
      <div className="flex justify-between text-xs text-secondary mt-1">
        <span>0%</span>
        <span className="text-red">5%</span>
        <span className="text-orange">10%</span>
        <span className="text-yellow">20%</span>
        <span>{distancePct === null ? "∞" : "25%+"}</span>
      </div>
      {distancePct !== null && (
        <div className={`text-xs mt-1 ${hfColor}`}>
          {distancePct < 1
            ? "At liquidation threshold — immediate risk"
            : `${distancePct.toFixed(1)}% price drop to liquidation`}
        </div>
      )}
      {distancePct === null && (
        <div className="text-xs mt-1 text-green">No liquidation risk</div>
      )}
    </div>
  );
}

// ---- Collateral / Debt Card ----
function ValueCard({
  label,
  value,
  subtitle,
  loading,
  semantic = "primary",
}: {
  label: string;
  value: bigint;
  subtitle?: string;
  loading?: boolean;
  semantic?: "primary" | "positive" | "negative" | "warning";
}) {
  const semanticColor = semantic === "positive" ? "text-green" : semantic === "negative" ? "text-red" : semantic === "warning" ? "text-yellow" : "text-primary";
  return (
    <div className={`bg-surface border border-bordercol p-4 flex-1 min-w-[140px] animate-slide-up ${loading ? "opacity-40" : ""}`}>
      <div className="text-xs text-secondary mb-1">{label}</div>
      <div className={`text-2xl leading-none ${semanticColor} truncate font-mono`}>
        {loading ? "----" : fmt$(value)}
      </div>
      {subtitle != null && (
        <div className="text-[10px] text-secondary mt-1">{subtitle}</div>
      )}
    </div>
  );
}

// ---- Agent Insights ----
function AgentInsights({
  position,
  listenerAlive,
  loading,
  armed,
  blocked,
}: {
  position: UserPosition | null;
  listenerAlive: boolean;
  loading: boolean;
  armed: boolean;
  blocked: boolean;
}) {
  if (loading) {
    return (
      <div className="bg-surface border border-bordercol p-4 animate-slide-up h-full">
        <div className="text-xs text-secondary mb-2">Agent Insights</div>
        <div className="text-xs text-cyan heartbeat-pulse">Initializing...</div>
      </div>
    );
  }

  if (!position) {
    return (
      <div className="bg-surface border border-bordercol p-4 animate-slide-up h-full">
        <div className="text-xs text-secondary mb-2">Agent Insights</div>
        <div className="text-xs text-secondary">No position data</div>
      </div>
    );
  }

  const hf = position.healthFactor;
  const hfVal = hf >= MAX_HF / 2n ? Infinity : hfToNumber(hf);
  const isInfinite = hfVal === Infinity;
  const connected = listenerAlive;

  let stateLabel: string;
  let stateColor: string;
  let thought: string;

  if (!connected) {
    stateLabel = "DISCONNECTED";
    stateColor = "text-yellow";
    thought = "RPC connection lost. Waiting for Anvil fork to become available.";
  } else if (isInfinite) {
    stateLabel = "SAFE";
    stateColor = "text-green";
    thought = "Health factor is infinite — no debt or fully collateralized. No action needed.";
  } else if (hfVal <= LAX_CONFIG.HF_TRIGGER) {
    stateLabel = "TRIGGERED";
    stateColor = "text-red heartbeat-pulse";
    if (armed && !blocked) {
      thought = `HF ${hfVal.toFixed(4)} dropped below trigger ${LAX_CONFIG.HF_TRIGGER}. Executing mitigation: repay debt to restore HF above ${LAX_CONFIG.HF_TARGET}.`;
    } else if (blocked) {
      thought = `HF ${hfVal.toFixed(4)} is below trigger ${LAX_CONFIG.HF_TRIGGER}. Protection already executed — standing by. Use Re-arm Autopilot to resume coverage.`;
    } else {
      thought = `HF ${hfVal.toFixed(4)} is below trigger ${LAX_CONFIG.HF_TRIGGER}, but the autopilot is not armed — nothing will execute on its own. Arm the autopilot to defend automatically, or use Execute Protection to repay manually.`;
    }
  } else if (hfVal < LAX_CONFIG.HF_TARGET) {
    stateLabel = "DANGER";
    stateColor = "text-red heartbeat-pulse";
    thought = `HF ${hfVal.toFixed(4)} is between trigger (${LAX_CONFIG.HF_TRIGGER}) and target (${LAX_CONFIG.HF_TARGET}). Monitoring closely — next poll in ${POLL_INTERVAL_MS/1000}s.`;
  } else if (hfVal < 1.5) {
    stateLabel = "WARNING";
    stateColor = "text-yellow";
    thought = `HF ${hfVal.toFixed(4)} above target (${LAX_CONFIG.HF_TARGET}) but below 1.5. Position is safe but elevated. No action needed.`;
  } else {
    stateLabel = "SAFE";
    stateColor = "text-green";
    thought = `HF ${hfVal.toFixed(4)} well above safe threshold. Position is healthy. No action needed.`;
  }

  const distance = calcLiquidationPct(hf);

  return (
    <div className="bg-surface border border-bordercol p-4 animate-slide-up h-full">
      <div className="text-xs text-secondary mb-2">Agent Insights</div>
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-2 h-2 rounded-full ${connected ? "bg-green heartbeat-pulse" : "bg-yellow"}`} />
        <span className={`text-xs font-bold ${stateColor}`}>{stateLabel}</span>
      </div>
      <div className="text-xs text-primary leading-relaxed border-l-2 border-bordercol pl-3">
        {thought}
      </div>
      {distance !== null && (
        <div className="text-xs mt-2 text-secondary flex gap-1">
          <PollCountdown lastReadAt={position.lastReadAt} pollMs={POLL_INTERVAL_MS} listenerAlive={listenerAlive} />
          <span>· Distance to liquidation: {distance.toFixed(1)}%</span>
        </div>
      )}
      {distance === null && (
        <div className="text-xs mt-2 text-secondary flex gap-1">
          <PollCountdown lastReadAt={position.lastReadAt} pollMs={POLL_INTERVAL_MS} listenerAlive={listenerAlive} />
          <span>· No liquidation risk.</span>
        </div>
      )}
    </div>
  );
}

// ---- Execution Panel ----
function ExecutionPanel({
  position,
  listenerAlive,
  loading,
  onExecute,
  onStressEvent,
  stressRunning,
}: {
  position: UserPosition | null;
  listenerAlive: boolean;
  loading: boolean;
  onExecute: () => void;
  onStressEvent: () => void;
  stressRunning: boolean;
}) {
  const hf = position?.healthFactor ?? 0n;
  const hfVal = position ? hfToNumber(hf) : 0;
  const repayAmount = position
    ? computeRepayAmount(
      position.totalDebtBase,
      position.healthFactor,
      triggerToBigint(LAX_CONFIG.HF_TARGET),
    )
    : 0n;
  const needsAction = position ? hfVal <= LAX_CONFIG.HF_TRIGGER : false;
  const elevatedRisk = position ? hfVal < LAX_CONFIG.HF_TARGET : false;
  const disabled = !listenerAlive || !position || loading;

  let buttonLabel = "Execute Protection";
  if (loading) buttonLabel = "Awaiting Position";
  else if (!listenerAlive) buttonLabel = "Live RPC Required";
  else if (!needsAction) buttonLabel = "Force Protection Run";

  let executeTitle = "";
  if (disabled) {
    if (loading) executeTitle = "Waiting for first position read";
    else if (!listenerAlive) executeTitle = "RPC offline — waiting for fork";
    else if (!position) executeTitle = "No position data";
  }
  let shockTitle = "";
  if (disabled || stressRunning) {
    if (!listenerAlive) shockTitle = "RPC offline — waiting for fork";
    else if (loading) shockTitle = "Waiting for first position read";
  }

  return (
    <div className="bg-surface border border-bordercol p-4 animate-slide-up">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="text-xs text-secondary uppercase tracking-widest">KeeperHub Execution</div>
          <div className={`text-lg font-bold mt-1 ${needsAction ? "text-red" : elevatedRisk ? "text-yellow" : "text-green"}`}>
            {needsAction ? "Trigger condition met" : elevatedRisk ? "Guarded watch mode" : "Ready for protected run"}
          </div>
          <div className="text-xs text-secondary mt-1">
            Repay target: {fmtUSDC(repayAmount)} · Target HF {LAX_CONFIG.HF_TARGET.toFixed(2)}
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={onStressEvent}
            disabled={disabled || stressRunning}
            title={shockTitle}
            className={`px-5 py-3 text-sm font-bold border transition-colors ${
              disabled || stressRunning
                ? "border-bordercol text-secondary bg-bordercol/30 cursor-not-allowed"
                : "border-yellow text-yellow bg-yellow/10 hover:bg-yellow hover:text-bgcol cursor-pointer"
            }`}
          >
            {stressRunning ? "Triggering Event" : "Trigger Price Shock"}
          </button>
          <button
            type="button"
            onClick={onExecute}
            disabled={disabled}
            title={executeTitle}
            className={`px-5 py-3 text-sm font-bold border transition-colors ${
              disabled
                ? "border-bordercol text-secondary bg-bordercol/30 cursor-not-allowed"
                : needsAction
                  ? "border-red text-red bg-red/10 hover:bg-red hover:text-bgcol cursor-pointer"
                  : "border-cyan text-cyan bg-cyan/10 hover:bg-cyan hover:text-bgcol cursor-pointer"
            }`}
          >
            {buttonLabel}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mt-4">
        <div className="border border-bordercol p-3 min-h-20">
          <div className="text-[10px] text-secondary uppercase">Preflight</div>
          <div className={`text-xs mt-1 ${listenerAlive ? "text-green" : "text-yellow"}`}>
            {listenerAlive ? "RPC call fresh" : "Blocked offline"}
          </div>
        </div>
        <div className="border border-bordercol p-3 min-h-20">
          <div className="text-[10px] text-secondary uppercase">Gas Strategy</div>
          <div className="text-xs text-cyan mt-1">Smart gas + backoff</div>
        </div>
        <div className="border border-bordercol p-3 min-h-20">
          <div className="text-[10px] text-secondary uppercase">Route</div>
          <div className="text-xs text-cyan mt-1">KeeperHub private path</div>
        </div>
        <div className="border border-bordercol p-3 min-h-20">
          <div className="text-[10px] text-secondary uppercase">Audit</div>
          <div className="text-xs text-cyan mt-1">Execution ID + tx hashes</div>
        </div>
      </div>
    </div>
  );
}

// ---- Log Panel ----
function LogPanel({ logs, loading, position }: { logs: LogEntry[]; loading: boolean; position: UserPosition | null }) {
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <div
      className="bg-surface border border-bordercol p-4 overflow-y-auto overflow-x-hidden scroll-smooth animate-slide-up animate-stagger-2 relative max-h-52 min-h-[8rem]"
      style={{ maskImage: "linear-gradient(to bottom, transparent 4%, black 12%, black 92%, transparent 100%)" }}
    >
      <div className="text-xs text-secondary mb-2">Event Log</div>
      {position && (
        <div className="text-xs border border-cyan/20 bg-cyan/5 px-2 py-1 mb-2 flex gap-2 items-center">
          <span className="w-2 h-2 bg-cyan rounded-full heartbeat-pulse inline-block" />
          <span className="text-cyan font-mono">LIVE</span>
          <span className="text-primary">HF {fmtHfShort(position.healthFactor)} · {fmtBlock(position.blockNumber)} · {position.readLatencyMs}ms</span>
        </div>
      )}
      {logs.length === 0 && loading && (
        <div className="text-xs text-cyan heartbeat-pulse">Initializing {APP_NAME} monitor...</div>
      )}
      {logs.length === 0 && !loading && (
        <div className="text-xs text-secondary">Waiting for events...</div>
      )}
      {logs.map((entry, i) => (
        <div key={i} className="flex gap-2 text-xs leading-4 py-0.5 animate-log-entry min-w-0">
          <span className="text-secondary shrink-0">[{fmtTime(entry.ts)}]</span>
          <span className={`${logLevelClass(entry.level)} break-words min-w-0`} title={entry.message}>{entry.message}</span>
        </div>
      ))}
      <div ref={logEndRef} />
    </div>
  );
}

function AutopilotStrip({
  guardian,
  mockMode,
  listenerAlive,
  terminalCount,
  onRearm,
  onArmToggle,
  terminalExecuting,
}: {
  guardian: { enabled: boolean; blocked: boolean; threshold: number; target: number };
  mockMode: boolean;
  listenerAlive: boolean;
  terminalCount: number;
  onRearm?: () => void;
  onArmToggle: () => void;
  terminalExecuting: boolean;
}) {
  const state = guardian.blocked ? "STANDBY" : guardian.enabled ? "PROTECTING" : "MANUAL";
  const stateColor = guardian.blocked ? "text-yellow border-yellow bg-yellow/10" : guardian.enabled ? "text-green border-green bg-green/10" : "text-yellow border-yellow bg-yellow/10";
  const stateTitle = guardian.blocked ? "Protection executed — standing by" : guardian.enabled ? "Actively protecting your position" : "You control when protection runs";

  return (
    <div className="animate-slide-up">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className={`border p-3 ${stateColor}`} title={stateTitle}>
          <div className="text-[10px] text-secondary uppercase">Autopilot</div>
          <div className="text-sm font-bold mt-1">{state}</div>
          {guardian.blocked && <div className="text-[10px] text-secondary">action taken</div>}
          {guardian.blocked && onRearm && (
            <button
              type="button"
              onClick={onRearm}
              className="mt-2 text-xs border border-yellow text-yellow px-2 py-1 bg-yellow/10 hover:bg-yellow hover:text-bgcol transition-colors"
            >
              Re-arm Autopilot
            </button>
          )}
          {!guardian.blocked && (
            <button
              type="button"
              onClick={onArmToggle}
              disabled={terminalExecuting}
              title={guardian.enabled ? "Disable auto-protection (lax guardian off)" : "Enable auto-protection (lax guardian on)"}
              className={`mt-2 text-xs border px-2 py-1 transition-colors ${
                guardian.enabled
                  ? "border-bordercol text-secondary bg-transparent hover:border-yellow hover:text-yellow"
                  : "border-green text-green bg-green/10 hover:bg-green hover:text-bgcol"
              } ${terminalExecuting ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              {guardian.enabled ? "Disarm Autopilot" : "Arm Autopilot"}
            </button>
          )}
        </div>
        <div className="border border-bordercol p-3 bg-surface">
          <div className="text-[10px] text-secondary uppercase">Policy</div>
          <div className="text-sm text-primary mt-1">{"HF <= "}{guardian.threshold.toFixed(2)} {"->"} {guardian.target.toFixed(2)}</div>
        </div>
        <div className="border border-bordercol p-3 bg-surface">
          <div className="text-[10px] text-secondary uppercase">Mode</div>
          <div className={`text-sm mt-1 ${mockMode ? "text-yellow" : "text-cyan"}`}>
            {mockMode ? "SIMULATION" : "LIVE FORK"}
          </div>
        </div>
        <div className="border border-bordercol p-3 bg-surface">
          <div className="text-[10px] text-secondary uppercase">Terminal</div>
          <div className={`text-sm mt-1 ${listenerAlive ? "text-green" : "text-yellow"}`}>
            {terminalCount} commands · {listenerAlive ? "ready" : "read-only"}
          </div>
        </div>
      </div>
    </div>
  );
}

function CommandRail({
  disabled,
  onRun,
}: {
  disabled: boolean;
  onRun: (cmd: string) => void;
}) {
  const commands = [
    "guide",
    "status",
    "guardian on",
    "autopilot",
    "shock weth -50%",
    "runs",
  ];

  return (
    <div className="bg-surface border border-bordercol p-3 animate-slide-up">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="text-xs text-secondary uppercase tracking-widest">Autopilot Commands</div>
        <div className="text-[10px] text-secondary">Click to run, or use the prompt below.</div>
      </div>
      <div className="flex flex-wrap gap-2">
        {commands.map((cmd) => (
          <button
            key={cmd}
            type="button"
            disabled={disabled}
            onClick={() => onRun(cmd)}
            className={`border px-3 py-2 text-xs font-mono transition-colors ${
              disabled
                ? "border-bordercol text-secondary bg-bordercol/30 cursor-not-allowed"
                : "border-cyan text-cyan hover:bg-cyan hover:text-bgcol cursor-pointer"
            }`}
          >
            lax {cmd}
          </button>
        ))}
      </div>
    </div>
  );
}

function TerminalActivity({
  entries,
  executing,
  onOpen,
}: {
  entries: OutputEntry[];
  executing: boolean;
  onOpen: () => void;
}) {
  const recent = entries.slice(-3).reverse();

  return (
    <div className="bg-surface border border-bordercol p-3 animate-slide-up">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="text-xs text-secondary uppercase tracking-widest">Terminal Activity</div>
        <button
          type="button"
          onClick={onOpen}
          className="text-[10px] text-cyan border border-cyan px-2 py-1 hover:bg-cyan hover:text-bgcol transition-colors cursor-pointer"
        >
          Open terminal
        </button>
      </div>
      {executing && (
        <div className="text-xs text-yellow animate-pulse mb-2">Executing command...</div>
      )}
      {recent.length === 0 ? (
        <div className="text-xs text-secondary leading-5">
          Run `lax guide`, `lax status`, or click a command above. Output will appear here and in the full terminal.
        </div>
      ) : (
        <div className="space-y-2">
          {recent.map((entry) => (
            <div key={`${entry.timestamp}-${entry.raw}`} className="border border-bordercol bg-bgcol p-2">
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="text-xs text-green font-mono break-words min-w-0 flex-1">$ {entry.raw}</div>
                <div className={`text-[10px] shrink-0 ${entry.result.error ? "text-red" : "text-green"}`}>
                  {entry.result.error ? "error" : "ok"} · {entry.duration}ms
                </div>
              </div>
              <OutputRenderer result={entry.result} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Offline Banner ----
function OfflineBanner({ cached }: { cached: boolean }) {
  let host: string;
  try {
    host = new URL(LAX_CONFIG.FORK_RPC).host;
  } catch {
    host = LAX_CONFIG.FORK_RPC.replace(/^https?:\/\//, "");
  }
  return (
    <div className="bg-yellow/10 border border-yellow p-3 text-xs text-yellow animate-slide-up flex items-center gap-2 break-words">
      <span className="w-2 h-2 bg-yellow rounded-full heartbeat-pulse inline-block shrink-0" />
      <span className="break-words">
        Fork unreachable — showing {cached ? "cached position data" : "last known data"}.
        Run <code className="bg-yellow/20 px-1">./scripts/start-fork.sh</code> to reconnect (expects {host}).
      </span>
    </div>
  );
}

// ---- Confirmation Modal ----
function ConfirmExecuteModal({
  open,
  onConfirm,
  onCancel,
  position,
  needsAction,
}: {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  position: UserPosition | null;
  needsAction: boolean;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    // focus Cancel (safe action) on open
    cancelRef.current?.focus();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
      if (e.key === "Tab") {
        const focusable = [cancelRef.current, confirmRef.current].filter(Boolean) as HTMLElement[];
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onCancel]);

  if (!open || !position) return null;
  const repayAmount = computeRepayAmount(position.totalDebtBase, position.healthFactor, triggerToBigint(LAX_CONFIG.HF_TARGET));
  const hfVal = hfToNumber(position.healthFactor);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === overlayRef.current) onCancel(); }}
    >
      <div className="bg-bgcol border border-bordercol max-w-md w-full p-6 animate-scale-in" style={{ border: "2px solid #ffffff", boxShadow: "0 0 20px rgba(255,255,255,0.15)" }}>
        <div className="font-projector-title text-primary tracking-widest text-sm mb-3">CONFIRM PROTECTION</div>
        <div className="text-xs text-secondary space-y-2 mb-4 border-l-2 border-bordercol pl-3">
          <div>Current HF: <span className="text-primary font-bold">{hfVal.toFixed(4)}</span></div>
          <div>Repay amount: <span className="text-cyan font-mono">{fmtUSDC(repayAmount)}</span></div>
          <div>Target HF: <span className="text-green">{LAX_CONFIG.HF_TARGET.toFixed(2)}</span></div>
          <div>Borrower: <span className="text-primary font-mono break-all text-[11px]">{LAX_CONFIG.BORROWER_ADDRESS}</span></div>
          <div className="text-yellow">This will move real funds on the fork (repay USDC to Aave).</div>
        </div>
        <div className="flex gap-2 justify-end">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="border border-bordercol px-4 py-2 text-xs text-primary hover:border-primary transition-colors bg-surface"
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className={`border px-4 py-2 text-xs font-bold transition-colors ${
              needsAction
                ? "border-red text-red bg-red/10 hover:bg-red hover:text-bgcol"
                : "border-cyan text-cyan bg-cyan/10 hover:bg-cyan hover:text-bgcol"
            }`}
          >
            Confirm — Repay & Restore HF
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Main Component ----
interface MonitorViewProps {
  onTrigger: (ev: MitigationEvent) => void;
  autoTriggerBlocked: { current: boolean };
}

export default function MonitorView({ onTrigger, autoTriggerBlocked }: MonitorViewProps) {
  const [watchedAddress, setWatchedAddress] = useState(() => loadWatchedAddress());
  const [rpcUrl, setRpcUrl] = useState(() => loadRpcUrl());
  const { position, cachedPosition, listenerAlive, error } = usePositionPoller(rpcUrl, watchedAddress);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [stressRunning, setStressRunning] = useState(false);
  const [mockMode, setMockModeState] = useState(false);
  const [guardianState, setGuardianStateView] = useState(() => getGuardianState());
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [showReconnected, setShowReconnected] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const prevAliveRef = useRef<boolean>(listenerAlive);
  const hasSeenOfflineRef = useRef(false);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevTriggeredRef = useRef(false);
  const executeBtnRef = useRef<HTMLButtonElement | null>(null);

  // HF band tracking for log noise reduction
  const lastLoggedHfRef = useRef<bigint | null>(null);
  const lastBandRef = useRef<string | null>(null);
  function getBand(hfVal: number): string {
    if (hfVal <= LAX_CONFIG.HF_TRIGGER) return "critical";
    if (hfVal < LAX_CONFIG.HF_TARGET) return "danger";
    if (hfVal < 1.5) return "warning";
    return "safe";
  }

  // M1/M2 handlers — persist watched address / RPC, throttle writes
  const handleWatchedAddressChange = useCallback((addr: string) => {
    if (!isValidAddress(addr)) return;
    setWatchedAddress(addr);
    try { localStorage.setItem(getWatchedAddressKey(), addr); } catch {}
    setLogs((prev) => [...prev, { ts: Date.now(), level: "info" as const, message: `Watching ${addr.slice(0,6)}...${addr.slice(-4)}` }].slice(-LOG_CAP));
  }, []);
  const handleRpcUrlChange = useCallback((url: string) => {
    if (!url.startsWith("http")) return;
    setRpcUrl(url);
    try { localStorage.setItem(getRpcUrlKey(), url); } catch {}
    setLogs((prev) => [...prev, { ts: Date.now(), level: "info" as const, message: `RPC switched to ${url}` }].slice(-LOG_CAP));
  }, []);
  const handleConnectWallet = useCallback(async () => {
    try {
      const eth = (window as unknown as { ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum;
      if (!eth) {
        setLogs((prev) => [...prev, { ts: Date.now(), level: "error" as const, message: "No injected wallet — install MetaMask/Rabby" }].slice(-LOG_CAP));
        return;
      }
      const accounts = await eth.request({ method: "eth_requestAccounts" }) as string[];
      const addr = accounts?.[0];
      if (addr && isValidAddress(addr)) {
        handleWatchedAddressChange(addr);
        setLogs((prev) => [...prev, { ts: Date.now(), level: "info" as const, message: `Wallet connected: ${addr.slice(0,6)}...${addr.slice(-4)}` }].slice(-LOG_CAP));
      }
    } catch (err) {
      setLogs((prev) => [...prev, { ts: Date.now(), level: "error" as const, message: `Wallet connect failed: ${err instanceof Error ? err.message : String(err)}` }].slice(-LOG_CAP));
    }
  }, [handleWatchedAddressChange]);

  const {
    input: terminalInput,
    executing: terminalExecuting,
    scrollback: terminalScrollback,
    suggestions: terminalSuggestions,
    selectedSuggestion: terminalSelectedSuggestion,
    handleKeyDown: terminalKeyDown,
    handleInputChange: terminalChange,
    executeCommand,
    setInput: setTerminalInput,
  } = useTerminalInput();

  // Backtick toggle for full-screen terminal - P1-4 fix
  const toggleOverlay = useCallback(() => {
    setOverlayVisible((v) => !v);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const active = document.activeElement as HTMLElement | null;
      const isInput = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target && target.isContentEditable) || active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || (active && active.isContentEditable);
      if (isInput) return;
      if (e.key === "`" && !terminalExecuting) {
        e.preventDefault();
        toggleOverlay();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggleOverlay, terminalExecuting]);

  // Track offline -> online transition for banner
  useEffect(() => {
    if (!listenerAlive) {
      hasSeenOfflineRef.current = true;
    }
    if (prevAliveRef.current === false && listenerAlive === true && hasSeenOfflineRef.current) {
      setShowReconnected(true);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = setTimeout(() => setShowReconnected(false), 5000);
    }
    if (prevAliveRef.current === true && listenerAlive === false) {
      setShowReconnected(false);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    }
    prevAliveRef.current = listenerAlive;
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, [listenerAlive]);

  // Wire CLI dispatcher into terminal scrollback
  useEffect(() => {
    const unsub = cliDispatcher.subscribe(() => {});
    return unsub;
  }, []);

  const buildMitigationEvent = useCallback((sourcePosition: UserPosition): MitigationEvent => {
    const hf = hfToNumber(sourcePosition.healthFactor);
    const exactRepayAmount = computeRepayAmount(
      sourcePosition.totalDebtBase,
      sourcePosition.healthFactor,
      triggerToBigint(LAX_CONFIG.HF_TARGET),
    );

    return {
      executionId: "",
      triggeredAt: Date.now(),
      hfAtTrigger: hf,
      debtBase: sourcePosition.totalDebtBase,
      exactRepayAmount,
      steps: [],
      finalHF: null,
      status: "pending",
      failureReason: null,
      borrowerAddress: watchedAddress,
      rpcUrl,
    };
  }, [watchedAddress, rpcUrl]);

  // Wire CLI command context
  useEffect(() => {
    const cliCtx: CommandContext = {
      rpc: <T,>(method: string, params: unknown[]) => rpcRequest<T>(method, params, rpcUrl),
      position: () => {
        if (!position) return null;
        return {
          healthFactor: position.healthFactor,
          totalCollateralUSD: position.totalCollateralBase,
          totalDebtUSD: position.totalDebtBase,
          availableBorrowsUSD: position.totalCollateralBase > position.totalDebtBase
            ? position.totalCollateralBase - position.totalDebtBase
            : 0n,
          blockNumber: position.blockNumber,
        };
      },
      config: LAX_CONFIG,
      appendLog: (level, message) => {
        setLogs((prev) => [...prev, { ts: Date.now(), level, message }].slice(-LOG_CAP));
      },
      refreshPosition: () => Promise.resolve(),
      setGuardianState: (state) => {
        if (state.blocked !== undefined) autoTriggerBlocked.current = state.blocked;
        setCliGuardianState(state);
        setGuardianStateView((prev) => ({ ...prev, ...state }));
      },
      getGuardianState: () => ({ ...getGuardianState(), blocked: autoTriggerBlocked.current }),
      setMockMode: (active) => { setMockModeState(active); setMockMode(active); },
      getMockMode: () => mockMode || isMockMode(),
      clearLogs: () => setLogs([]),
      engageProtection: () => {
        if (!position || !listenerAlive) return;
        autoTriggerBlocked.current = true;
        setGuardianStateView((prev) => ({ ...prev, blocked: true }));
        onTrigger(buildMitigationEvent(position));
      },
      emit: (event) => cliDispatcher.dispatch(event),
      getSnapshot: (id) => getSnapshot(id),
      addSnapshot: (snap) => addSnapshot(snap),
      listSnapshots: () => listSnapshots(),
      addExecutionRecord: (rec) => addExecutionRecord(rec),
      getExecutionRecords: () => getExecutionRecords(),
    };
    setCommandContext(cliCtx);
  }, [position, mockMode, autoTriggerBlocked, listenerAlive, onTrigger, buildMitigationEvent, rpcUrl, watchedAddress]);

  // Subscribe CLI dispatcher to dashboard state
  useEffect(() => {
    const unsub = cliDispatcher.subscribe((event) => {
      switch (event.type) {
        case "log": {
          const entry = event.payload as LogEntry;
          setLogs((prev) => [...prev, entry].slice(-LOG_CAP));
          break;
        }
        case "clear":
          setLogs([]);
          break;
        case "mock-mode": {
          const { active } = event.payload as { active: boolean };
          setMockModeState(active);
          break;
        }
        case "guardian-toggle": {
          const next = event.payload as Partial<typeof guardianState>;
          setGuardianStateView((prev) => ({ ...prev, ...next }));
          break;
        }
      }
    });
    return unsub;
  }, []);

  // Initial info log
  useEffect(() => {
    const initial: LogEntry[] = [
      { ts: Date.now(), level: "info", message: `${APP_NAME} monitor initialized` },
      {
        ts: Date.now(),
        level: "info",
        message: `Polling Aave V3 at ${LAX_CONFIG.AAVE_POOL.slice(0, 10)}..., borrower ${watchedAddress.slice(0, 10)}... via ${rpcUrl}`,
      },
      {
        ts: Date.now(),
        level: "info",
        message: `HF trigger ≤ ${LAX_CONFIG.HF_TRIGGER}, target ≥ ${LAX_CONFIG.HF_TARGET}`,
      },
    ];
    setLogs(initial);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Add log entries reactively - collapsed periodic reads (P1-2)
  useEffect(() => {
    const newLogs: LogEntry[] = [];

    if (position && listenerAlive) {
      const hfVal = position.healthFactor >= MAX_HF/2n ? Infinity : hfToNumber(position.healthFactor);
      const band = position.healthFactor >= MAX_HF/2n ? "safe" : getBand(hfVal as number);
      let shouldLogHf = false;
      if (lastLoggedHfRef.current === null) {
        shouldLogHf = true;
      } else if (lastBandRef.current !== band) {
        shouldLogHf = true;
      } else if (hfVal !== Infinity && lastLoggedHfRef.current !== null) {
        const lastHfNum = hfToNumber(lastLoggedHfRef.current);
        if (lastHfNum !== Infinity) {
          const change = Math.abs((hfVal as number) - lastHfNum) / lastHfNum;
          if (change > 0.01) shouldLogHf = true;
        } else if (hfVal === Infinity) {
          // no log if stays infinite
          shouldLogHf = false;
        }
      }
      if (shouldLogHf) {
        lastLoggedHfRef.current = position.healthFactor;
        lastBandRef.current = band;
        newLogs.push({
          ts: position.lastReadAt,
          level: band === "critical" ? "trigger" : band === "danger" ? "warn" : "info",
          message: `HF ${fmtHfShort(position.healthFactor)} · ${fmtBlock(position.blockNumber)} · ${position.readLatencyMs}ms · ${band}`,
        });
      }
    }

    if (position && listenerAlive) {
      const hf = hfToNumber(position.healthFactor);
      if (prevTriggeredRef.current === false && hf <= LAX_CONFIG.HF_TRIGGER && !autoTriggerBlocked.current) {
        if (!guardianState.enabled) {
          newLogs.push({
            ts: Date.now(),
            level: "warn",
            message: `HF ${hf.toFixed(4)} ≤ trigger ${LAX_CONFIG.HF_TRIGGER} — guardian DISARMED, not auto-triggering (use lax arm)`,
          });
          prevTriggeredRef.current = true;
        } else {
          prevTriggeredRef.current = true;
          newLogs.push({
            ts: Date.now(),
            level: "trigger",
            message: `HF dropped to ${hf.toFixed(4)} — TRIGGERED (≤ ${LAX_CONFIG.HF_TRIGGER})`,
          });

          onTrigger(buildMitigationEvent(position));
        }
      }
    }

    // Log reconnection - only once per transition
    if (listenerAlive && logs.length > 0 && logs[logs.length - 1].level === "error") {
      newLogs.push({
        ts: Date.now(),
        level: "info",
          message: "Fork reconnected",
      });
    }

    if (newLogs.length > 0) {
      setLogs((prev) => [...prev, ...newLogs].slice(-LOG_CAP));
    }
  }, [buildMitigationEvent, position, listenerAlive, logs, onTrigger, guardianState.enabled]);

  const confirmNeedsAction = position ? hfToNumber(position.healthFactor) <= LAX_CONFIG.HF_TRIGGER : false;

  const handleExecuteClick = useCallback(() => {
    if (!position || !listenerAlive) return;
    setShowConfirm(true);
  }, [position, listenerAlive]);

  const handleConfirmExecute = useCallback(() => {
    if (!position || !listenerAlive) return;
    setShowConfirm(false);
    setLogs((prev) => [
      ...prev,
      {
        ts: Date.now(),
        level: "trigger" as const,
        message: `Manual trigger @ HF ${fmtHfShort(position.healthFactor)}`,
      },
    ].slice(-LOG_CAP));
    onTrigger(buildMitigationEvent(position));
    // restore focus to execute button after modal close
    setTimeout(() => executeBtnRef.current?.focus(), 0);
  }, [buildMitigationEvent, listenerAlive, onTrigger, position]);

  const handleCancelConfirm = useCallback(() => {
    setShowConfirm(false);
    setTimeout(() => executeBtnRef.current?.focus(), 0);
  }, []);

  const handleRearm = useCallback(() => {
    autoTriggerBlocked.current = false;
    setCliGuardianState({ blocked: false });
    setGuardianStateView((prev) => ({ ...prev, blocked: false }));
    prevTriggeredRef.current = false;
    setLogs((prev) => [...prev, { ts: Date.now(), level: "warn" as const, message: "Autopilot re-armed by user" }].slice(-LOG_CAP));
  }, [autoTriggerBlocked]);

  // Arm/disarm the autopilot from the UI by reusing the same CLI command the
  // terminal runs — one code path for state, logs, and dispatcher events.
  const handleArmToggle = useCallback(() => {
    const enable = !guardianState.enabled;
    void executeCommand(enable ? "lax guardian on" : "lax guardian off");
    // If the user arms while the position is already in the trigger zone,
    // re-evaluate now instead of waiting for the next HF band change.
    if (enable) prevTriggeredRef.current = false;
  }, [executeCommand, guardianState.enabled]);

  const handleStressEvent = useCallback(async () => {
    if (!position || !listenerAlive || stressRunning) return;

    setStressRunning(true);
    setLogs((prev) => [
      ...prev,
      {
        ts: Date.now(),
        level: "trigger" as const,
        message: "Price shock: WETH -50% on fork",
      },
    ].slice(-LOG_CAP));

    try {
      const oracleRaw = await rpcRequest<string>("eth_call", [
        { to: LAX_CONFIG.POOL_ADDRESSES_PROVIDER, data: "0xfca513a8" },
        "latest",
      ], rpcUrl);
      const oracle = decodeAddress(oracleRaw);
      const priceRaw = await rpcRequest<string>("eth_call", [
        {
          to: oracle,
          data: `0xb3596f07${encodeAddressParam(LAX_CONFIG.WETH)}`,
        },
        "latest",
      ], rpcUrl);
      const currentPrice = BigInt(priceRaw);
      const nextPrice = currentPrice / 2n;
      const txHash = await rpcRequest<string>("eth_sendTransaction", [
        {
          from: LAX_CONFIG.ANVIL_SIGNER,
          to: oracle,
          gas: "0x186a0",
          data: `0x51323f72${encodeAddressParam(LAX_CONFIG.WETH)}${encodeUintParam(nextPrice)}`,
        },
      ], rpcUrl);

      setLogs((prev) => [
        ...prev,
        {
          ts: Date.now(),
          level: "info" as const,
          message: `Price shock tx ${txHash.slice(0, 10)}...${txHash.slice(-6)}`,
        },
      ].slice(-LOG_CAP));
    } catch (err) {
      setLogs((prev) => [
        ...prev,
        {
          ts: Date.now(),
          level: "error" as const,
          message: `Price shock failed: ${err instanceof Error ? err.message : String(err)}`,
        },
      ].slice(-LOG_CAP));
    } finally {
      setStressRunning(false);
    }
  }, [listenerAlive, position, stressRunning, rpcUrl]);

  const runRailCommand = useCallback((cmd: string) => {
    const raw = `lax ${cmd}`;
    setOverlayVisible(true);
    setTerminalInput(raw);
    void executeCommand(raw);
  }, [executeCommand, setTerminalInput]);

  const hf = position?.healthFactor ?? (cachedPosition?.healthFactor ?? 0n);
  const collateral = position?.totalCollateralBase ?? (cachedPosition?.totalCollateralBase ?? 0n);
  const debt = position?.totalDebtBase ?? (cachedPosition?.totalDebtBase ?? 0n);
  const loading = position === null && cachedPosition === null;
  const showingCached = !listenerAlive && cachedPosition !== null;

  const isStale = position !== null && (Date.now() - position.lastReadAt) > 5000;

  let hostPort: string;
  try { hostPort = new URL(rpcUrl).host; } catch { hostPort = rpcUrl.replace(/^https?:\/\//, ""); }
  const networkLabel = rpcUrl.includes("127.0.0.1") || rpcUrl.includes("localhost") ? "Anvil" : rpcUrl.includes("base.org") ? "Base" : "Custom";

  return (
    <div className="flex flex-col gap-4 p-6 max-w-4xl mx-auto w-full min-h-screen animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-bordercol pb-4 animate-slide-up">
        <div>
          <div className="font-projector-title text-primary tracking-widest">
            {APP_NAME.toUpperCase()}
          </div>
          <div className="text-xs text-secondary tracking-widest uppercase">
            Liquidation Autopilot
          </div>
          <div className="text-[10px] text-secondary mt-1">{networkLabel} · {hostPort} · Watching {watchedAddress.slice(0,6)}...{watchedAddress.slice(-4)}</div>
        </div>
        <div className="flex items-center gap-3">
          {/* Listener status */}
          <div className="flex items-center gap-2">
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                listenerAlive ? "bg-green heartbeat-pulse" : "bg-yellow"
              }`}
            />
            <span
              className={`text-xs ${listenerAlive ? "text-green" : "text-yellow"}`}
            >
              {listenerAlive ? "RPC LIVE" : "RPC OFFLINE"}
            </span>
          </div>
          {/* Last updated */}
          {position && (
            <div className={`text-[10px] ${isStale ? "text-yellow heartbeat-pulse" : "text-secondary"}`}>
              {isStale ? "Syncing..." : fmtTimeShort(position.lastReadAt)}
            </div>
          )}
        </div>
      </div>

      {/* Offline banner */}
      {!listenerAlive && position === null && cachedPosition !== null && (
        <OfflineBanner cached={true} />
      )}
      {!listenerAlive && position === null && cachedPosition === null && (
        <OfflineBanner cached={false} />
      )}
      {showReconnected && (
        <div className="bg-green/10 border border-green p-2 text-xs text-green animate-slide-up">
          Fork connected — live data resumed.
        </div>
      )}

      {/* Error banner - P2-2 */}
      {error && listenerAlive === false && (
        <div className="bg-red/10 border border-red p-2 text-xs text-red animate-slide-up break-words">
          RPC Error: {error}. Is Anvil running at {hostPort}?
        </div>
      )}

      {/* Watch Config Panel — M1/M2/M3 */}
      <WatchConfigPanel
        watchedAddress={watchedAddress}
        rpcUrl={rpcUrl}
        onWatchedAddressChange={handleWatchedAddressChange}
        onRpcUrlChange={handleRpcUrlChange}
        onConnectWallet={handleConnectWallet}
      />

      <ProtectedPositionsPanel currentAddress={watchedAddress} currentHf={hf} rpcUrl={rpcUrl} />

      {/* Liquidation Gauge */}
      <div className={isStale ? "opacity-60 transition-opacity duration-500" : ""}>
        <LiquidationGauge hf={hf} listenerAlive={listenerAlive} />
      </div>

      <AutopilotStrip
        guardian={{ ...guardianState, blocked: autoTriggerBlocked.current }}
        mockMode={mockMode}
        listenerAlive={listenerAlive}
        terminalCount={terminalScrollback.length}
        onRearm={guardianState.blocked || autoTriggerBlocked.current ? handleRearm : undefined}
        onArmToggle={handleArmToggle}
        terminalExecuting={terminalExecuting}
      />

      {/* Collateral / Debt Cards - P2-4 responsive */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <ValueCard
          label="Total Collateral"
          value={collateral}
          subtitle="WETH + USDC supplied"
          loading={loading}
        />
        <ValueCard
          label="Total Debt"
          value={debt}
          subtitle="USDC borrowed"
          loading={loading}
        />
        <ValueCard
          label="Net Position"
          value={collateral - debt}
          subtitle="Equity (collateral - debt)"
          loading={loading}
          semantic="positive"
        />
      </div>

      {/* Execution CTA - wrapped to capture ref for focus restore */}
      <div ref={(el) => { if (el) { const btn = el.querySelector('button:last-child') as HTMLButtonElement | null; if (btn) executeBtnRef.current = btn; } }}>
        <ExecutionPanel
          position={position}
          listenerAlive={listenerAlive}
          loading={loading}
          onExecute={handleExecuteClick}
          onStressEvent={handleStressEvent}
          stressRunning={stressRunning}
        />
      </div>

      <ConfirmExecuteModal
        open={showConfirm}
        onConfirm={handleConfirmExecute}
        onCancel={handleCancelConfirm}
        position={position}
        needsAction={confirmNeedsAction}
      />

      <CommandRail
        disabled={terminalExecuting}
        onRun={runRailCommand}
      />

      <TerminalActivity
        entries={terminalScrollback}
        executing={terminalExecuting}
        onOpen={() => setOverlayVisible(true)}
      />

      {/* Agent Insights + Log Panel */}
      <div className="flex gap-4 flex-col md:flex-row items-stretch min-w-0">
        <div className="flex-1 min-w-0 shrink-0">
          <AgentInsights position={position} listenerAlive={listenerAlive} loading={loading} armed={guardianState.enabled} blocked={autoTriggerBlocked.current} />
        </div>
        <div className="flex-1 min-w-0 shrink-0">
          <LogPanel logs={logs} loading={loading} position={position} />
        </div>
      </div>

      {/* Terminal prompt bar */}
      <div
        className="bg-bgcol p-4 box-border animate-fade-in"
        style={{ border: "4px double #ffffff", boxShadow: "0 0 10px rgba(255,255,255,0.1)" }}
      >
        <div className="flex items-center text-sm">
          <TerminalInput
            value={terminalInput}
            executing={terminalExecuting}
            suffix="running..."
            className="flex-1"
            onKeyDown={terminalKeyDown}
            onChange={terminalChange}
          />
          <span className="ml-2 text-secondary shrink-0 text-[10px]">
            {showingCached
              ? `Offline — last known read ${fmtTime(cachedPosition!.lastReadAt)}. Execution locked until RPC reconnects.`
              : loading
                ? "Awaiting position data..."
                : `Last read: ${fmtTime(position!.lastReadAt)} · block ${fmtBlock(position!.blockNumber)} · HF ${fmtHfShort(hf)}`}
          </span>
        </div>
      </div>

      {/* Terminal full-screen overlay */}
      <TerminalOverlay
        visible={overlayVisible}
        input={terminalInput}
        executing={terminalExecuting}
        scrollback={terminalScrollback}
        suggestions={terminalSuggestions}
        selectedSuggestion={terminalSelectedSuggestion}
        onClose={() => setOverlayVisible(false)}
        onKeyDown={terminalKeyDown}
        onChange={terminalChange}
      />
    </div>
  );
}
