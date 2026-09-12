// Operator alerts — payload shaping (Discord/Slack/generic), non-blocking
// delivery, and graceful behavior when unconfigured or unreachable.
import { describe, it, expect, afterEach, vi } from "vitest";
import { alertRequestBody, formatAlertText, sendAlert, alertWebhookUrl, type AlertPayload } from "../src/alerts";

const sample: AlertPayload = {
  event: "webhook-fired",
  position: "fork",
  network: "base-fork",
  hf: 1.0431,
  repayHuman: "32.32",
  executionId: "9bc31ofdfca1m62b2v29t",
};

afterEach(() => {
  delete process.env.LAX_ALERT_WEBHOOK;
  vi.unstubAllGlobals();
});

describe("alert request bodies", () => {
  it("Discord URLs get an embed with title, description, and color", () => {
    const body = alertRequestBody(sample, "https://discord.com/api/webhooks/123/abc");
    const embeds = body.embeds as { title: string; description: string; color: number }[];
    expect(embeds).toHaveLength(1);
    expect(embeds[0]!.title).toContain("LAX executed a mitigation");
    expect(embeds[0]!.description).toContain("HF 1.0431");
    expect(embeds[0]!.description).toContain("32.32 USDC");
    expect(embeds[0]!.description).toContain("9bc31ofdfca1m62b2v29t");
    expect(embeds[0]!.color).toBe(0x2ecc71);
  });

  it("Discord blocked events are red", () => {
    const body = alertRequestBody({ ...sample, event: "gate-blocked" }, "https://discordapp.com/api/webhooks/1/x");
    expect((body.embeds as { color: number }[])[0]!.color).toBe(0xe74c3c);
  });

  it("Slack URLs get a text payload", () => {
    const body = alertRequestBody(sample, "https://hooks.slack.com/services/T00/B00/xyz");
    expect(body.text).toContain("LAX executed a mitigation");
    expect(body.text).toContain("HF 1.0431");
  });

  it("generic URLs get a plain text payload", () => {
    const body = alertRequestBody(sample, "https://example.com/hook");
    expect(body.text).toContain("LAX");
  });
});

describe("sendAlert", () => {
  it("is a no-op when LAX_ALERT_WEBHOOK is unset", async () => {
    const res = await sendAlert(sample);
    expect(res.sent).toBe(false);
    expect(res.reason).toContain("LAX_ALERT_WEBHOOK not set");
  });

  it("delivers to a 2xx endpoint", async () => {
    process.env.LAX_ALERT_WEBHOOK = "https://discord.com/api/webhooks/123/tok";
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await sendAlert(sample);
    expect(res.sent).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("discord.com");
    const body = JSON.parse(init.body as string) as { embeds: { title: string }[] };
    expect(body.embeds[0]!.title).toContain("LAX executed a mitigation");
  });

  it("reports non-2xx as not sent, without throwing", async () => {
    process.env.LAX_ALERT_WEBHOOK = "https://discord.com/api/webhooks/123/tok";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 404 })));
    const res = await sendAlert(sample);
    expect(res.sent).toBe(false);
    expect(res.reason).toContain("404");
  });

  it("reports network failure as not sent, without throwing", async () => {
    process.env.LAX_ALERT_WEBHOOK = "https://example.invalid/hook";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("dns failure")));
    const res = await sendAlert(sample);
    expect(res.sent).toBe(false);
    expect(res.reason).toContain("unreachable");
  });
});

describe("formatAlertText", () => {
  it("joins available fields and skips missing ones", () => {
    expect(formatAlertText({ event: "trigger", hf: 1.02 })).toBe("HF 1.0200");
    expect(formatAlertText({ event: "trigger" })).toBe("");
  });
});

describe("alertWebhookUrl", () => {
  it("trims and respects the env var", () => {
    expect(alertWebhookUrl()).toBeUndefined();
    process.env.LAX_ALERT_WEBHOOK = "  https://x  ";
    expect(alertWebhookUrl()).toBe("https://x");
  });
});
