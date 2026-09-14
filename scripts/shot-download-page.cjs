// Screenshot the download page via Electron (already in repo devDeps) — desktop + mobile.
const { app, BrowserWindow } = require("electron");
const path = require("path");

const OUT = "C:/Users/Nithilan/AppData/Local/Temp/opencode";
const PAGE = "file:///C:/proximity--main/docs/index.html";

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1440, height: 1050,
    show: false,
    webPreferences: { offscreen: true },
  });

  const errors = [];
  win.webContents.on("console-message", (_e, _lvl, msg) => { if (msg.includes("error") || msg.includes("Error")) errors.push(msg); });

  await win.loadURL(PAGE);
  await new Promise(r => setTimeout(r, 1500)); // API fetch + ticker paint

  const state = await win.webContents.executeJavaScript(`(() => {
    const out = {};
    ["dl-win-setup","dl-win-portable","dl-mac-arm","dl-mac-intel"].forEach(id => {
      const el = document.getElementById(id);
      out[id] = { href: el ? el.href : null, disabled: el ? el.getAttribute("aria-disabled") : "MISSING" };
    });
    out.ver = document.getElementById("ver-readout").textContent;
    return out;
  })()`);
  console.log("STATE:", JSON.stringify(state));

  await win.webContents.executeJavaScript(`document.fonts.ready`);
  await new Promise(r => setTimeout(r, 300));
  const img1 = await win.webContents.capturePage();
  require("fs").writeFileSync(OUT + "/dl-desktop.png", img1.toPNG());

  await win.setSize(400, 880);
  await new Promise(r => setTimeout(r, 400));
  const img2 = await win.webContents.capturePage();
  require("fs").writeFileSync(OUT + "/dl-mobile.png", img2.toPNG());

  console.log("ERRORS:", errors.length ? errors.join(" | ") : "none");
  console.log("SCREENSHOTS WRITTEN");
  app.quit();
}).catch(e => { console.error("FATAL:", e); app.quit(); });
