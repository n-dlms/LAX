// Multi-position configuration (V2 plan fix #8).
// lax.config.json (repo root or LAX_CONFIG_PATH):
// {
//   "positions": [
//     { "name": "main", "borrower": "0x...", "threshold": 1.05, "target": 1.10 }
//   ]
// }
// Without it, LAX monitors the single default position from src/config.ts.
import { existsSync, readFileSync } from "node:fs";
import { CONFIG } from "../config";

export interface Position {
  name: string;
  borrower: string;
  threshold: number;
  target: number;
}

const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;

export function loadPositions(configPath?: string): { positions: Position[]; errors: string[] } {
  const path = configPath ?? process.env.LAX_CONFIG_PATH ?? "lax.config.json";
  const fallback: Position[] = [
    { name: "default", borrower: CONFIG.BORROWER_ADDRESS, threshold: CONFIG.HF.TRIGGER, target: CONFIG.HF.TARGET },
  ];
  if (!existsSync(path)) return { positions: fallback, errors: [] };

  const errors: string[] = [];
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as { positions?: Partial<Position>[] };
    const raw = parsed.positions ?? [];
    if (!Array.isArray(raw) || raw.length === 0) return { positions: fallback, errors: ["positions array empty — using default"] };

    const seen = new Set<string>();
    const positions: Position[] = [];
    raw.forEach((p, i) => {
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
      positions.push({ name, borrower, threshold, target });
    });

    if (positions.length === 0) return { positions: fallback, errors };
    return { positions, errors };
  } catch (err) {
    errors.push(`failed to parse ${path}: ${(err as Error).message}`);
    return { positions: fallback, errors };
  }
}
