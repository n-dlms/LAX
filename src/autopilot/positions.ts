// Multi-position, multi-network configuration.
// lax.config.json (repo root or LAX_CONFIG_PATH):
// {
//   "networks": {
//     "base-fork":    { "rpc": "http://127.0.0.1:18545", "aavePool": "0xA238...", "usdc": "0x8335...", "workflowId": "7gdt..." },
//     "base-sepolia": { "rpc": "https://sepolia.base.org", "aavePool": "0x8bAB...", "usdc": "0xba50...", "workflowId": "l4pb..." }
//   },
//   "positions": [
//     { "name": "main",    "borrower": "0x...", "network": "base-fork" },
//     { "name": "sepolia", "borrower": "0x...", "network": "base-sepolia", "threshold": 1.1 }
//   ]
// }
// Any Aave V3 network works — a position is (borrower, rpc, pool, usdc,
// workflow); nothing is hardcoded to a chain. Positions without a network
// use the default network from src/config.ts.
import { existsSync, readFileSync } from "node:fs";
import { CONFIG } from "../config";

const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;

export interface NetworkConfig {
  rpc: string;
  aavePool: string;
  usdc: string;
  workflowId?: string;
}

export interface Position {
  name: string;
  borrower: string;
  threshold: number;
  target: number;
}

/** A position joined with its network — everything the daemon needs to
 *  monitor and defend it. */
export interface ResolvedPosition extends Position {
  network: string;
  rpc: string;
  aavePool: string;
  usdc: string;
  workflowId: string;
}

interface RawConfig {
  networks?: Record<string, Partial<NetworkConfig>>;
  positions?: Array<Partial<Position> & { network?: string }>;
}

function defaultNetwork(): NetworkConfig {
  return {
    rpc: process.env.LAX_FORK_RPC || CONFIG.FORK_RPC_URL,
    aavePool: CONFIG.AAVE_POOL,
    usdc: CONFIG.USDC,
    workflowId: process.env.LAX_WORKFLOW_ID || CONFIG.WORKFLOW_ID,
  };
}

export function loadPositions(configPath?: string): {
  positions: ResolvedPosition[];
  errors: string[];
} {
  const path = configPath ?? process.env.LAX_CONFIG_PATH ?? "lax.config.json";
  const defaultNet: NetworkConfig = defaultNetwork();
  const networks: Record<string, NetworkConfig> = { default: defaultNet };
  const errors: string[] = [];

  if (existsSync(path)) {
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as RawConfig;
      for (const [name, net] of Object.entries(parsed.networks ?? {})) {
        if (!net || !net.rpc || !/^https?:\/\/.+/.test(net.rpc)) {
          errors.push(`network "${name}": rpc must be an http(s) URL`);
          continue;
        }
        if (!net.aavePool || !ADDR_RE.test(net.aavePool)) {
          errors.push(`network "${name}": invalid aavePool`);
          continue;
        }
        if (!net.usdc || !ADDR_RE.test(net.usdc)) {
          errors.push(`network "${name}": invalid usdc`);
          continue;
        }
        networks[name] = {
          rpc: net.rpc,
          aavePool: net.aavePool,
          usdc: net.usdc,
          workflowId: net.workflowId || defaultNet.workflowId,
        };
      }
    } catch (err) {
      errors.push(`failed to parse ${path}: ${(err as Error).message}`);
    }
  }

  const fallback: ResolvedPosition[] = [
    { name: "default", borrower: CONFIG.BORROWER_ADDRESS, threshold: CONFIG.HF.TRIGGER, target: CONFIG.HF.TARGET, ...resolvedNetwork("default", defaultNet) },
  ];

  let rawPositions: RawConfig["positions"] = [];
  let configFileExists = false;
  if (existsSync(path)) {
    configFileExists = true;
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as RawConfig;
      rawPositions = parsed.positions ?? [];
    } catch {
      /* parse failure already reported in the networks pass above */
    }
  }
  if (!Array.isArray(rawPositions) || rawPositions.length === 0) {
    if (configFileExists) errors.push("positions array empty — using default");
    return { positions: fallback, errors };
  }

  const seen = new Set<string>();
  const positions: ResolvedPosition[] = [];
  rawPositions.forEach((p, i) => {
    const name = (p.name ?? `position-${i + 1}`).trim();
    const borrower = p.borrower ?? "";
    if (!ADDR_RE.test(borrower)) {
      errors.push(`position "${name}": invalid borrower address`);
      return;
    }
    const key = borrower.toLowerCase();
    if (seen.has(key)) {
      errors.push(`position "${name}": duplicate borrower ${borrower}`);
      return;
    }
    seen.add(key);
    const threshold = p.threshold ?? CONFIG.HF.TRIGGER;
    const target = p.target ?? CONFIG.HF.TARGET;
    if (threshold <= 1.0 || target <= threshold) {
      errors.push(`position "${name}": need 1.0 < threshold < target`);
      return;
    }
    const netName = p.network ?? "default";
    const net = networks[netName];
    if (!net) {
      errors.push(`position "${name}": unknown network "${netName}"`);
      return;
    }
    positions.push({ name, borrower, threshold, target, ...resolvedNetwork(netName, net) });
  });

  if (positions.length === 0) return { positions: fallback, errors };
  return { positions, errors };
}

function resolvedNetwork(name: string, net: NetworkConfig): { network: string; rpc: string; aavePool: string; usdc: string; workflowId: string } {
  return {
    network: name,
    rpc: net.rpc,
    aavePool: net.aavePool,
    usdc: net.usdc,
    workflowId: net.workflowId ?? CONFIG.WORKFLOW_ID,
  };
}
