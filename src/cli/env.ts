// Portable environment accessor — lets the shared CLI core run in both Node
// (bin/lax.ts, autopilot daemon) and the browser (dashboard's embedded
// terminal) without diverging into two copies.
/* eslint-disable @typescript-eslint/no-explicit-any */
interface PortableEnv {
  [key: string]: string | undefined;
}

function resolveEnv(): PortableEnv {
  // `process` is referenced via globalThis so this file compiles in browser
  // TS configs without @types/node.
  const proc = (globalThis as any)?.process;
  const raw: PortableEnv = proc?.env
    ? (proc.env as PortableEnv)
    : (() => {
        try {
          return ((import.meta as any).env ?? {}) as PortableEnv;
        } catch {
          return {};
        }
      })();
  // In the browser only VITE_* names are injected — alias the ones the CLI
  // core reads so both runtimes see the same keys.
  return {
    ...raw,
    KEEPERHUB_API_KEY: raw.KEEPERHUB_API_KEY ?? raw.VITE_KEEPERHUB_API_KEY,
    LAX_FORK_RPC: raw.LAX_FORK_RPC ?? raw.VITE_FORK_RPC,
  };
}

export const CLI_ENV: PortableEnv = resolveEnv();
