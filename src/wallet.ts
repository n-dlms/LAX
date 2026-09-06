// Wallet resolution — LAX works with any Turnkey agentic wallet.
// Priority (wallet): env LAX_WALLET_ADDRESS > ~/.keeperhub/wallet.json > CONFIG.
// The borrower (position owner) defaults to the agentic wallet itself
// ("self-defense": the wallet monitors and protects its own position);
// override with LAX_BORROWER_ADDRESS to defend any other address.
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { CONFIG } from "./config";

const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;

export interface WalletInfo {
  walletAddress: string;
  source: "env" | "wallet-file" | "config";
}

function walletFilePath(): string {
  return process.env.KEEPERHUB_WALLET_PATH || join(homedir(), ".keeperhub", "wallet.json");
}

/** Reads the active Turnkey wallet address from ~/.keeperhub/wallet.json. */
export function readWalletFileAddress(): string | null {
  try {
    const path = walletFilePath();
    if (!existsSync(path)) return null;
    const parsed = JSON.parse(readFileSync(path, "utf8")) as { walletAddress?: string };
    const addr = parsed.walletAddress;
    return addr && ADDR_RE.test(addr) ? addr : null;
  } catch {
    return null;
  }
}

export function getWalletAddress(): WalletInfo {
  const fromEnv = process.env.LAX_WALLET_ADDRESS;
  if (fromEnv && ADDR_RE.test(fromEnv.trim())) {
    return { walletAddress: fromEnv.trim(), source: "env" };
  }
  const fromFile = readWalletFileAddress();
  if (fromFile) {
    return { walletAddress: fromFile, source: "wallet-file" };
  }
  return { walletAddress: CONFIG.WALLET_ADDRESS, source: "config" };
}

export function getBorrowerAddress(cliArg?: string | undefined): string {
  if (cliArg && cliArg.trim()) return cliArg.trim();
  const fromEnv = process.env.LAX_BORROWER_ADDRESS || "";
  if (fromEnv.trim()) return fromEnv.trim();
  // Self-defense mode: LAX_SELF_DEFENSE=true makes the agentic wallet protect
  // its own position. Otherwise the configured demo borrower is used (the fork
  // position belongs to an Anvil account).
  if (process.env.LAX_SELF_DEFENSE === "true") return getWalletAddress().walletAddress;
  return CONFIG.BORROWER_ADDRESS;
}
