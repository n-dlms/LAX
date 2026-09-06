import type { ParsedArgs } from "./types";
import { findCommand } from "./registry";

export function parseInput(raw: string): { name: string; args: ParsedArgs } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const tokens = tokenize(trimmed);

  // Normalize double prefix: lax lax help repay -> lax help repay
  if (tokens.length >= 2 && tokens[0]?.toLowerCase() === "lax" && tokens[1]?.toLowerCase() === "lax") {
    tokens.splice(1, 1);
  }
  if ((tokens[0] ?? "").toLowerCase() !== "lax") {
    // Multi-token input whose first word isn't a known command or normalizer keyword (e.g. "notlax status")
    // is not a LAX command. Single tokens still auto-prefix so bare "status" resolves to "lax status".
    const first = (tokens[0] ?? "").toLowerCase();
    const isNormalizerWord = first === "guardian" || first === "guard" || first === "mock" || first === "reset";
    if (tokens.length > 1 && !findCommand(first) && !isNormalizerWord) return null;
    tokens.unshift("lax");
  }
  // Handle confirmation shorthand "y" -> treat as "lax y" is handled in executor before parsing, but keep for completeness
  if (tokens.length < 2) return null;

  const normalized = normalizeCommand(tokens);
  const name = normalized.name;
  const rest = normalized.rest;

  const parsed: ParsedArgs = { positional: [], flags: {} };
  let i = 0;
  while (i < rest.length) {
    const t = rest[i]!;
    if (t.startsWith("--")) {
      const eqIdx = t.indexOf("=");
      if (eqIdx !== -1) {
        parsed.flags[t.slice(2, eqIdx)] = t.slice(eqIdx + 1);
        i += 1;
      } else {
        const flagName = t.slice(2);
        const next = rest[i + 1] ?? "-";
        if (i + 1 < rest.length && !next.startsWith("-")) {
          parsed.flags[flagName] = next;
          i += 2;
        } else {
          parsed.flags[flagName] = "true";
          i += 1;
        }
      }
    } else if (t.startsWith("-") && t.length > 1 && !t.startsWith("--") && !/^-\d/.test(t)) {
      parsed.flags[t.slice(1)] = "true";
      i += 1;
    } else {
      parsed.positional.push(t);
      i += 1;
    }
  }

  return { name, args: parsed };
}

function normalizeCommand(tokens: string[]): { name: string; rest: string[] } {
  const first = tokens[1] ?? "";
  const second = tokens[2] ?? "";

  if (first === "-help" || first === "--help" || first === "-h") {
    return { name: "help", rest: tokens.slice(2) };
  }

  if (first === "guardian" || first === "guard") {
    const action = second || "status";
    if (action === "on" || action === "off" || action === "status") {
      return { name: `guardian-${action}`, rest: tokens.slice(3) };
    }
  }

  if (first === "mock") {
    if (second === "start" || second === "on") return { name: "mock-start", rest: tokens.slice(3) };
    if (second === "stop" || second === "off") return { name: "mock-stop", rest: tokens.slice(3) };
  }

  if (first === "reset" && second === "price") {
    return { name: "reset-price", rest: tokens.slice(3) };
  }

  return { name: first, rest: tokens.slice(2) };
}

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inQuote = false;
  let quoteChar = "";

  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (inQuote) {
      if (c === quoteChar) {
        tokens.push(current);
        current = "";
        inQuote = false;
      } else {
        current += c;
      }
    } else if (c === '"' || c === "'") {
      inQuote = true;
      quoteChar = c;
    } else if (c === " ") {
      if (current) {
        tokens.push(current);
        current = "";
      }
    } else {
      current += c;
    }
  }

  if (current) tokens.push(current);

  return tokens;
}
