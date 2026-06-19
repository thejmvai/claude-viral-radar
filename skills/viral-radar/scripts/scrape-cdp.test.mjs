import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CdpClient,
  pickPageTarget,
  median,
  candidateTiles,
  viralReasonFor,
  buildWorklistItem,
} from "./scrape-cdp.mjs";

// Minimal fake of the global WebSocket (addEventListener/send/close), with an
// auto-responder so we can exercise the CDP request/response framing offline.
class FakeWS {
  constructor() {
    this.listeners = {};
    this.sent = [];
    this.responder = null;
    queueMicrotask(() => this._emit("open"));
  }
  addEventListener(type, cb) { (this.listeners[type] ||= []).push(cb); }
  _emit(type, ev) { for (const cb of this.listeners[type] || []) cb(ev); }
  send(data) {
    this.sent.push(data);
    const msg = JSON.parse(data);
    const resp = this.responder ? this.responder(msg) : undefined;
    if (resp !== undefined) queueMicrotask(() => this._emit("message", { data: JSON.stringify(resp) }));
  }
  close() { this.closed = true; }
}

const cfg = { viralThreshold: 100000, velocityThreshold: 50000, velocityWindowHours: 48 };

test("CdpClient.connect resolves on the open event", async () => {
  const ws = new FakeWS();
  const cdp = await CdpClient.connect("ws://x", { WebSocketImpl: function () { return ws; } });
  assert.ok(cdp instanceof CdpClient);
});

test("CdpClient.send frames a request and resolves the matching id", async () => {
  const ws = new FakeWS();
  ws.responder = (msg) => ({ id: msg.id, result: { ok: true, echo: msg.method } });
  const cdp = new CdpClient(ws);
  const r1 = await cdp.send("Page.enable");
  const r2 = await cdp.send("Runtime.enable", { x: 1 });
  assert.deepEqual(r1, { ok: true, echo: "Page.enable" });
  assert.deepEqual(r2, { ok: true, echo: "Runtime.enable" });
  // ids increment and params are sent through
  assert.equal(JSON.parse(ws.sent[0]).id, 1);
  assert.equal(JSON.parse(ws.sent[1]).id, 2);
  assert.deepEqual(JSON.parse(ws.sent[1]).params, { x: 1 });
});

test("CdpClient.send rejects on a CDP error and ignores id-less events", async () => {
  const ws = new FakeWS();
  const cdp = new CdpClient(ws);
  // an event with no id should not throw or settle anything
  ws._emit("message", { data: JSON.stringify({ method: "Page.loadEventFired", params: {} }) });
  ws.responder = (msg) => ({ id: msg.id, error: { message: "boom" } });
  await assert.rejects(() => cdp.send("X"), /boom/);
});

test("CdpClient.evaluate returns result.value and throws on exceptionDetails", async () => {
  const ws = new FakeWS();
  const cdp = new CdpClient(ws);
  ws.responder = () => undefined; // we'll emit manually
  // success
  let p = cdp.evaluate("1+1");
  ws._emit("message", { data: JSON.stringify({ id: 1, result: { result: { value: 2 } } }) });
  assert.equal(await p, 2);
  // exception
  p = cdp.evaluate("boom()");
  ws._emit("message", { data: JSON.stringify({ id: 2, result: { exceptionDetails: { text: "ReferenceError" } } }) });
  await assert.rejects(() => p, /ReferenceError/);
});

test("pickPageTarget prefers an instagram page, falls back to first page, else null", () => {
  const ig = { type: "page", url: "https://www.instagram.com/x/", webSocketDebuggerUrl: "ws://ig" };
  const other = { type: "page", url: "https://example.com", webSocketDebuggerUrl: "ws://o" };
  const worker = { type: "service_worker", url: "x", webSocketDebuggerUrl: "ws://w" };
  const noWs = { type: "page", url: "https://www.instagram.com/y/" }; // excluded (no ws url)
  assert.equal(pickPageTarget([other, ig]).webSocketDebuggerUrl, "ws://ig");
  assert.equal(pickPageTarget([other, worker]).webSocketDebuggerUrl, "ws://o");
  assert.equal(pickPageTarget([worker, noWs]), null);
  assert.equal(pickPageTarget([]), null);
});

test("median: odd, even, empty, ignores non-positive", () => {
  assert.equal(median([1, 2, 3]), 2);
  assert.equal(median([10, 20, 30, 40]), 25);
  assert.equal(median([]), 0);
  assert.equal(median([0, -5, 10, 20]), 15);
});

test("candidateTiles parses view text and keeps only >= velocity floor", () => {
  const tiles = [
    { shortcode: "A", viewsText: "120K" },
    { shortcode: "B", viewsText: "40K" },     // below floor
    { shortcode: "", viewsText: "999K" },      // no shortcode
    { shortcode: "C", viewsText: "1.2M views" },
  ];
  const out = candidateTiles(tiles, cfg);
  assert.deepEqual(out, [
    { shortcode: "A", views: 120000 },
    { shortcode: "C", views: 1200000 },
  ]);
});

test("viralReasonFor: absolute, velocity-in-window, too-old, below-floor", () => {
  assert.equal(viralReasonFor({ views: 150000, ageHours: 500 }, cfg), "absolute");
  assert.equal(viralReasonFor({ views: 70000, ageHours: 10 }, cfg), "velocity");
  assert.equal(viralReasonFor({ views: 70000, ageHours: 100 }, cfg), null);
  assert.equal(viralReasonFor({ views: 30000, ageHours: 5 }, cfg), null);
});

test("buildWorklistItem produces the pre-enrichment work-list shape with metrics", () => {
  const now = new Date("2026-06-18T00:00:00Z");
  const item = buildWorklistItem({
    shortcode: "ABC",
    views: 200000,
    og: { likes: 8000, comments: 100, postedAt: "2026-06-15" },
    handle: "someone",
    followers: 50000,
    creatorMedianViews: 40000,
    viralReason: "absolute",
    now,
  });
  assert.equal(item.url, "https://www.instagram.com/reel/ABC/");
  assert.equal(item.handle, "@someone");
  assert.equal(item.discoveredVia, "tracked");
  assert.equal(item.viralReason, "absolute");
  assert.deepEqual(item.metrics, { views: 200000, likes: 8000, comments: 100 });
  assert.equal(item.likeRate, 0.04);
  assert.equal(item.breakout, 5);       // 200000 / 40000
  assert.equal(item.reachMultiple, 4);  // 200000 / 50000
  assert.equal(item.qualityFlag, "ok"); // like-rate 0.04 >= 0.005
  assert.ok(item.signalScore > 0 && item.signalScore <= 100);
  assert.equal(item.ageHoursAtCatch, 72); // 3 days
});

test("buildWorklistItem flags boosted + null followers gracefully", () => {
  const item = buildWorklistItem({
    shortcode: "X", views: 1000000, og: { likes: 1000, comments: 0, postedAt: null },
    handle: "@h", followers: null, creatorMedianViews: 0, viralReason: "absolute",
  });
  assert.equal(item.qualityFlag, "boosted"); // like-rate 0.001 < 0.005
  assert.equal(item.reachMultiple, null);
  assert.equal(item.handle, "@h");
  assert.equal(item.postedAt, null);
});
