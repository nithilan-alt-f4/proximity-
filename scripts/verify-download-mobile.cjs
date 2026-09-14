// Mobile + reduced-motion verification.
const { app, BrowserWindow } = require("electron");

async function runChecks(win, label) {
  return await win.webContents.executeJavaScript(`(async () => {
    const out = [];
    const ok = (name, cond, detail) => out.push((cond ? "PASS " : "FAIL ") + name + (detail ? " :: " + detail : ""));

    const grid = getComputedStyle(document.querySelector(".dl-grid")).gridTemplateColumns;
    ok("dl-grid-1col", grid.split(" ").length === 1, grid);

    const btn = document.getElementById("dl-win-setup");
    const btnW = btn.getBoundingClientRect().width;
    const bodyW = document.querySelector("#card-win .dl-actions").getBoundingClientRect().width;
    ok("btn-full-width", btnW > bodyW * 0.9, (btnW / bodyW * 100).toFixed(0) + "%");

    ok("no-h-scroll", document.documentElement.scrollWidth <= ${label === "MOBILE" ? 402 : 402},
       "scrollW=" + document.documentElement.scrollWidth);

    const title = document.querySelector(".hero-title");
    ok("title-scaled", parseFloat(getComputedStyle(title).fontSize) < 60,
       getComputedStyle(title).fontSize);

    const rig = document.getElementById("rig-stack").getBoundingClientRect();
    ok("rig-visible", rig.width > 100 && rig.height > 100, rig.width.toFixed(0) + "x" + rig.height.toFixed(0));

    const c1 = document.getElementById("card-win").getBoundingClientRect();
    const c2 = document.getElementById("card-mac").getBoundingClientRect();
    ok("cards-stacked", c2.top >= c1.bottom - 2, "gap=" + (c2.top - c1.bottom).toFixed(0) + "px");

    // Ticker motion state (animated normally; frozen under reduced motion)
    const track = document.getElementById("ticker-track");
    const a1 = track.getBoundingClientRect().left;
    await new Promise(r => setTimeout(r, 450));
    const a2 = track.getBoundingClientRect().left;
    const animated = Math.abs(a2 - a1) > 2;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    ok("motion-policy", animated !== reduce,
       "reduce=" + reduce + " animated=" + animated + " (want animated=" + !reduce + ")");

    return out.join("\\n");
  })()`);
}

app.whenReady().then(async () => {
  // Pass 1: normal motion
  const win = new BrowserWindow({ width: 402, height: 900, show: false });
  await win.loadURL("file:///C:/proximity--main/docs/index.html");
  await new Promise(r => setTimeout(r, 1500));
  console.log("--- MOBILE 402x900 (normal motion) ---");
  console.log(await runChecks(win, "MOBILE"));

  // Pass 2: emulated reduced motion (Electron 43: debugger.sendCommand)
  const win2 = new BrowserWindow({ width: 402, height: 900, show: false });
  await win2.loadURL("file:///C:/proximity--main/docs/index.html");
  try {
    win2.webContents.debugger.attach("1.3");
    await win2.webContents.debugger.sendCommand("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });
    await win2.webContents.executeJavaScript("location.reload()");
    await new Promise(r => setTimeout(r, 1500));
    console.log("--- MOBILE 402x900 (reduced motion) ---");
    console.log(await runChecks(win2, "REDUCED"));
    win2.webContents.debugger.detach();
  } catch (e) {
    console.log("reduced-motion emulation error: " + e.message);
  }
  app.quit();
}).catch(e => { console.error("FATAL:", e.message); app.quit(); });
