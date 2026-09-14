// proximity+ — Electron main process (CommonJS)
// Spawns the bundled Express server (dist/server.cjs) on a free port, waits for
// it to actually listen, then opens a BrowserWindow pointed at the local server.
// Loading via http:// (not file://) keeps the frontend's relative fetch("/api/...")
// calls working.

const { app, BrowserWindow } = require("electron");
const path = require("path");
const http = require("http");
const net = require("net");

// Server bundle sits next to this file after packaging (files config copies dist/).
const SERVER_BUNDLE = path.join(__dirname, "dist", "server.cjs");

// ---------------------------------------------------------------------------
// Port strategy: IndexedDB is partitioned per origin, and the origin includes
// the port. If every launch picked a fresh ephemeral port, the app would see a
// brand-new empty database each time (playlists/songs "vanishing" on restart).
// So we ALWAYS serve on the same fixed loopback port so the storage origin is
// stable across sessions. If that port is somehow taken (rare), we retry a
// small set of fixed alternates before giving up — still deterministic per
// machine, and in normal use it is always the same one.
// ---------------------------------------------------------------------------
const FIXED_PORTS = [37419, 37420, 37421, 37422];

function checkPortFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => srv.close(() => resolve(true)));
    srv.listen(port, "127.0.0.1");
  });
}

async function findFreePort() {
  for (const port of FIXED_PORTS) {
    if (await checkPortFree(port)) return port;
  }
  // Absolute fallback (should never happen): OS-assigned. Storage will still be
  // consistent within this run; next launch normally lands on a FIXED_PORT
  // again. Log loudly so we know why data might look stale.
  console.warn("[electron] All fixed ports busy — falling back to ephemeral port. IndexedDB data may appear missing this session.");
  return await new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

// Poll the server until /api/health responds — guarantees the window never
// loads before Express is ready.
function waitForHealth(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(`http://127.0.0.1:${port}/api/health`, (res) => {
        res.resume();
        if (res.statusCode === 200) resolve();
        else retry();
      });
      req.on("error", retry);
      req.setTimeout(1500, () => {
        req.destroy();
        retry();
      });
    };
    const retry = () => {
      if (Date.now() > deadline) reject(new Error("Server health check timed out"));
      else setTimeout(tick, 250);
    };
    tick();
  });
}

let mainWindow = null;
let serverPort = null;

async function startServerAndCreateWindow() {
  try {
    // 1. Pick a free port and expose it to the server bundle via env.
    serverPort = await findFreePort();
    process.env.PORT = String(serverPort);
    process.env.NODE_ENV = "production";

    // 2. Start the bundled Express server in-process.
    require(SERVER_BUNDLE);
    console.log(`[electron] Backend server starting on port ${serverPort}`);

    // 3. Wait until it is actually accepting requests.
    await waitForHealth(serverPort);
    console.log("[electron] Backend healthy, opening window");

    // 4. Create the window and load the frontend from the local server.
    mainWindow = new BrowserWindow({
      width: 1280,
      height: 820,
      minWidth: 980,
      minHeight: 640,
      backgroundColor: "#0a0a0a",
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });

    // Block navigation away from the local app (dragged links, window.open, etc.)
    mainWindow.webContents.on("will-navigate", (e, url) => {
      if (!url.startsWith(`http://127.0.0.1:${serverPort}`)) e.preventDefault();
    });
    mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

    await mainWindow.loadURL(`http://127.0.0.1:${serverPort}`);
  } catch (err) {
    console.error("[electron] Fatal startup error:", err);
    const { dialog } = require("electron");
    dialog.showErrorBox(
      "proximity+ failed to start",
      `The backend server did not start correctly.\n\n${err && err.message ? err.message : err}`
    );
    app.quit();
  }
}

// Single-instance lock: opening a second copy of the exe would spawn a second
// server; instead focus the existing window.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(startServerAndCreateWindow);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) startServerAndCreateWindow();
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
