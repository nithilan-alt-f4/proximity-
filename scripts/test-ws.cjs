// Test the production server: health, now-playing page, WebSocket state push/broadcast,
// and remote command relay.
const http = require("http");
const WebSocket = require("ws");

const PORT = Number(process.env.PORT) || 3011;
const BASE = `http://127.0.0.1:${PORT}`;

function get(path) {
  return new Promise((resolve, reject) => {
    http.get(BASE + path, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    }).on("error", reject);
  });
}

function post(path, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request(
      BASE + path,
      { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve({ status: res.statusCode, body: data }));
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

function wsConnect() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
    const messages = [];
    ws.on("open", () => resolve({ ws, messages }));
    ws.on("message", (raw) => {
      try { messages.push(JSON.parse(String(raw))); } catch {}
    });
    ws.on("error", reject);
  });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log("=== Health ===");
  const health = await get("/api/health");
  console.log("health:", health.status, health.body.slice(0, 60));

  console.log("\n=== Now Playing page (all 4 routes) ===");
  for (const p of ["/now-playing", "/now-playing/", "/remote", "/remote/"]) {
    const r = await get(p);
    const isHtml = r.body.includes("proximity") || r.body.includes("Now Playing");
    console.log(`${p} -> ${r.status} html=${isHtml}`);
  }

  console.log("\n=== WebSocket: state push -> broadcast ===");
  // Client A = the "app" that pushes state. Client B = the remote "page".
  const a = await wsConnect();
  const b = await wsConnect();
  await wait(200);

  // App pushes playback state
  const sampleState = {
    song: { uuid: "song-1", title: "Tum Hi Ho", artist: "Arijit Singh", album: "Aashiqui 2", albumCover: "https://example.com/cover.jpg", duration: 268 },
    playing: true,
    currentTime: 42,
    duration: 268,
    volume: 0.7,
    queue: [
      { uuid: "song-1", title: "Tum Hi Ho", artist: "Arijit Singh", duration: 268 },
      { uuid: "song-2", title: "Gerua", artist: "Arijit Singh", duration: 320 },
    ],
    queueIndex: 0,
  };
  a.ws.send(JSON.stringify({ type: "state", state: sampleState }));
  await wait(300);

  const bStates = b.messages.filter((m) => m.type === "state");
  console.log("Remote received state:", JSON.stringify(bStates[0]?.state?.song?.title), "playing:", bStates[0]?.state?.playing);

  // Late joiner gets snapshot immediately
  const c = await wsConnect();
  await wait(300);
  const cStates = c.messages.filter((m) => m.type === "state");
  console.log("Late joiner snapshot:", JSON.stringify(cStates[0]?.state?.song?.title));

  console.log("\n=== WebSocket: remote cmd -> relayed to app (but not echo to sender) ===");
  const beforeA = a.messages.length;
  const beforeB = b.messages.length;
  b.ws.send(JSON.stringify({ type: "cmd", cmd: "next", data: {} }));
  await wait(300);
  const aCmds = a.messages.filter((m) => m.type === "cmd");
  const bCmds = b.messages.filter((m) => m.type === "cmd");
  console.log("App received cmd:", JSON.stringify(aCmds[aCmds.length - 1]));
  console.log("Sender received own cmd:", JSON.stringify(bCmds.slice(beforeB).map((m) => m.cmd)), "(should be [])");

  console.log("\n=== HTTP api/state GET ===");
  const snap = await get("/api/state");
  console.log("GET /api/state:", snap.status, snap.body.slice(0, 80));

  console.log("\n=== HTTP api/remote POST (fallback channel) ===");
  const r = await post("/api/remote", { cmd: "seek", data: { time: 120 } });
  await wait(200);
  const aCmds2 = a.messages.filter((m) => m.type === "cmd");
  console.log("POST /api/remote:", r.status, "| App saw:", JSON.stringify(aCmds2[aCmds2.length - 1]));

  console.log("\n=== /now-playing on a NON-listed path shouldn't 404 the SPA ===");
  const spa = await get("/library");
  console.log("/library ->", spa.status, "isSpa:", spa.body.includes("root"));

  a.ws.close(); b.ws.close(); c.ws.close();
  process.exit(0);
}

main().catch((e) => { console.error("TEST FAILED:", e); process.exit(1); });