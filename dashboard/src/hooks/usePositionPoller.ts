import { useEffect, useRef, useState } from "react";
import type { UserPosition } from "../types";
import { LAX_CONFIG, APP_NAME } from "../types";

export const POLL_INTERVAL_MS = 2000;

const GET_USER_ACCOUNT_DATA_SELECTOR = "0xbf92857c";

export function encodeGetUserAccountData(user: string): string {
  const cleanAddr = user.toLowerCase().replace(/^0x/, "");
  return GET_USER_ACCOUNT_DATA_SELECTOR + cleanAddr.padStart(64, "0");
}

export function decodeUint256Array(hex: string, count: number): bigint[] {
  const clean = hex.replace(/^0x/, "");
  const out: bigint[] = [];
  for (let i = 0; i < count; i++) {
    const chunk = clean.slice(i * 64, (i + 1) * 64);
    if (chunk.length !== 64) {
      throw new Error(`Truncated return data at index ${i}: got ${chunk.length} chars, expected 64`);
    }
    out.push(BigInt("0x" + chunk));
  }
  return out;
}

// ---- localStorage cache for offline resilience ----
const CACHE_KEY = `${APP_NAME.toLowerCase().replace(/\s+/g, "_")}_position_cache_v2`;

interface CachePayload {
  position: {
    walletAddress: string;
    totalCollateralBase: string;
    totalDebtBase: string;
    healthFactor: string;
    lastReadAt: number;
    readLatencyMs?: number;
    blockNumber?: string;
  };
}

function saveToCache(pos: UserPosition): void {
  try {
    const payload: CachePayload = {
      position: {
        walletAddress: pos.walletAddress,
        totalCollateralBase: pos.totalCollateralBase.toString(),
        totalDebtBase: pos.totalDebtBase.toString(),
        healthFactor: pos.healthFactor.toString(),
        lastReadAt: pos.lastReadAt,
        readLatencyMs: pos.readLatencyMs,
        blockNumber: pos.blockNumber.toString(),
      },
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // localStorage quota exceeded or disabled — non-fatal
  }
}

function loadFromCache(): UserPosition | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachePayload;
    return {
      walletAddress: parsed.position.walletAddress,
      totalCollateralBase: BigInt(parsed.position.totalCollateralBase),
      totalDebtBase: BigInt(parsed.position.totalDebtBase),
      healthFactor: BigInt(parsed.position.healthFactor),
      lastReadAt: parsed.position.lastReadAt,
      readLatencyMs: parsed.position.readLatencyMs ?? 0,
      blockNumber: BigInt(parsed.position.blockNumber ?? "0"),
    };
  } catch {
    return null;
  }
}

export interface UsePositionPollerResult {
  position: UserPosition | null;
  cachedPosition: UserPosition | null;
  listenerAlive: boolean;
  error: string | null;
}

export function usePositionPoller(
  rpcUrl: string = LAX_CONFIG.FORK_RPC,
  borrower: string = LAX_CONFIG.BORROWER_ADDRESS,
  pollMs: number = POLL_INTERVAL_MS,
): UsePositionPollerResult {
  const [livePosition, setLivePosition] = useState<UserPosition | null>(null);
  const [cachedPosition, setCachedPosition] = useState<UserPosition | null>(() => loadFromCache());
  const [listenerAlive, setListenerAlive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const consecutiveErrors = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    async function pollOnce() {
      try {
        const startedAt = performance.now();
        const data = encodeGetUserAccountData(borrower);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);

        const resp = await fetch(rpcUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify([
            {
              jsonrpc: "2.0",
              id: 1,
              method: "eth_blockNumber",
              params: [],
            },
            {
              jsonrpc: "2.0",
              id: 2,
              method: "eth_call",
              params: [
                { to: LAX_CONFIG.AAVE_POOL, data },
                "latest",
              ],
            },
          ]),
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (!resp.ok) {
          throw new Error(`RPC ${resp.status}: ${await resp.text()}`);
        }

        const json = (await resp.json()) as Array<{ id: number; result?: string; error?: { message: string } }>;
        const blockJson = json.find((entry) => entry.id === 1);
        const accountJson = json.find((entry) => entry.id === 2);

        if (blockJson?.error) {
          throw new Error(`RPC error: ${blockJson.error.message}`);
        }
        if (accountJson?.error) {
          throw new Error(`RPC error: ${accountJson.error.message}`);
        }
        if (!accountJson?.result) {
          throw new Error("RPC returned no result");
        }

        const fields = decodeUint256Array(accountJson.result, 6);
        const newPosition: UserPosition = {
          walletAddress: borrower,
          totalCollateralBase: fields[0],
          totalDebtBase: fields[1],
          healthFactor: fields[5],
          lastReadAt: Date.now(),
          readLatencyMs: Math.round(performance.now() - startedAt),
          blockNumber: BigInt(blockJson?.result ?? "0x0"),
        };

        if (!cancelled && mountedRef.current) {
          setLivePosition(newPosition);
          setCachedPosition(newPosition);
          setListenerAlive(true);
          setError(null);
          consecutiveErrors.current = 0;
          saveToCache(newPosition);
        }
      } catch (err) {
        if (!cancelled && mountedRef.current) {
          consecutiveErrors.current += 1;
          // Mark listener as dead after 2 consecutive failures
          if (consecutiveErrors.current >= 2) {
            setLivePosition(null);
            setListenerAlive(false);
          }
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    }

    const intervalId = setInterval(pollOnce, pollMs);
    pollOnce();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      clearInterval(intervalId);
    };
  }, [rpcUrl, borrower, pollMs]);

  return { position: livePosition, cachedPosition, listenerAlive, error };
}
