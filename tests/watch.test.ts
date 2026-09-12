// `lax watch` — sparkline rendering + single-sample mode (no fork needed for
// the pure parts; once-mode reads are covered by the live-fork verification).
import { describe, it, expect } from "vitest";
import { sparkline } from "../src/cli/actions/watch";

describe("sparkline", () => {
  it("renders empty for no samples", () => {
    expect(sparkline([])).toBe("");
  });

  it("renders flat series at the top character (stable HF)", () => {
    const out = sparkline([1.5, 1.5, 1.5]);
    expect(out).toBe("███");
  });

  it("rises with the series", () => {
    const out = sparkline([1.0, 1.2, 1.4, 1.6]);
    expect(out.indexOf("▁")).toBe(0);
    expect(out.endsWith("█")).toBe(true);
  });

  it("falls with the series (crash story)", () => {
    const out = sparkline([1.6, 1.4, 1.2, 1.0]);
    expect(out.startsWith("█")).toBe(true);
    expect(out.endsWith("▁")).toBe(true);
  });

  it("honors the width cap", () => {
    const out = sparkline(Array.from({ length: 100 }, (_, i) => 1 + i / 100), 20);
    expect(out).toHaveLength(20);
  });

  it("keeps every character inside the spark alphabet", () => {
    const out = sparkline([0.9, 1.05, 1.5, 2.0, 1.7, 1.2]);
    for (const ch of out) expect("▁▂▃▄▅▆▇█").toContain(ch);
  });
});
