// Canonical CLI core lives in ../../src/cli — this shim keeps the dashboard
// importing the same code the standalone lax binary runs (no divergent copies).
export * from "../../../src/cli/registry";
