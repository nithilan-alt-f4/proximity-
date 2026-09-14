// Deep render verification of the download page.
const { app, BrowserWindow } = require("electron");

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 1050, show: false });
  await win.loadURL("file:///C:/proximity--main/docs/index.html");
  await new Promise(r => setTimeout(r, 1800));

  const checks = await win.webContents.executeJavaScript(`(async () => {
    const out = [];
    const ok = (name, cond, detail) => out.push((cond ? "PASS " : "FAIL ") + name + (detail ? " :: " + detail : ""));

    // 1. Fonts actually loaded (Space Grotesk + IBM Plex Mono)
    try {
      await document.fonts.load('700 20px "Space Grotesk"');
      await document.fonts.load('500 10px "IBM Plex Mono"');
      const sg = document.fonts.check('700 20px "Space Grotesk"');
      const pm = document.fonts.check('500 10px "IBM Plex Mono"');
      ok("fonts-loaded", sg && pm, "grotesk=" + sg + " mono=" + pm);
    } catch (e) { ok("fonts-loaded", false, e.message); }

    // 2. Ticker animating (transform changing over time)
    const track = document.getElementById("ticker-track");
    const t1 = track.getBoundingClientRect().left;
    await new Promise(r => setTimeout(r, 400));
    const t2 = track.getBoundingClientRect().left;
    ok("ticker-animating", Math.abs(t2 - t1) > 2, "dx=" + (t2 - t1).toFixed(1) + "px over 400ms");

    // 3. Hero rig has resting 3D transform
    const rig = document.getElementById("rig-stack");
    const rigT = getComputedStyle(rig).transform;
    ok("rig-3d-resting", rigT !== "none" && rigT.includes("matrix3d"), rigT.slice(0, 40));

    // 4. Plates create visible depth (plate p2 offset from frame)
    const frame = document.querySelector(".rig-frame");
    const plate = document.querySelector(".plate.p2");
    const fR = frame.getBoundingClientRect();
    const pR = plate.getBoundingClientRect();
    ok("plate-offset", Math.abs(pR.left - fR.left) > 15 && Math.abs(pR.top - fR.top) > 15,
       "dx=" + (pR.left - fR.left).toFixed(0) + " dy=" + (pR.top - fR.top).toFixed(0));

    // 5. Cards: hard offset shadow present (box-shadow with ink color)
    const card = document.getElementById("card-win");
    const bs = getComputedStyle(card).boxShadow;
    ok("card-hard-shadow", bs !== "none" && bs.includes("rgb(0, 0, 0)"), bs.slice(0, 50));

    // 6. Download buttons: enabled, correct colors, keyboard-reachable
    const btn = document.getElementById("dl-win-setup");
    const bCol = getComputedStyle(btn).backgroundColor;
    ok("btn-ink-bg", bCol === "rgb(0, 0, 0)", bCol);
    ok("btn-enabled", btn.getAttribute("aria-disabled") === null);
    ok("btn-tabindex-restored", btn.getAttribute("tabindex") === "0", "tabindex=" + btn.getAttribute("tabindex"));
    ok("btn-real-fallback", btn.href.includes("nithilan-alt-f4/proximity-"), btn.href.slice(0, 60));

    // 6b. Card headings are real h2s (document outline)
    ok("card-h2-headings", document.querySelectorAll(".dl-head h2.os").length === 2);

    // 7. Buttons inside dl-body elevated via translateZ (preserve-3d chain)
    const body = document.querySelector("#card-win .dl-body");
    ok("body-preserve3d", getComputedStyle(body).transformStyle === "preserve-3d");

    // 8. Status dot blinking (opacity animation)
    const dot = document.querySelector(".status-dot");
    const dAnim = getComputedStyle(dot).animationName;
    ok("dot-pulse", dAnim.includes("pulse"), dAnim);

    // 9. Registration marks + substrate present
    ok("regmarks", document.querySelectorAll(".regmark").length === 4);
    ok("substrate", !!document.querySelector(".substrate"));

    // 10. No horizontal overflow (mobile-ish safe)
    const overflowX = document.documentElement.scrollWidth <= 1440;
    ok("no-h-overflow", overflowX, "scrollW=" + document.documentElement.scrollWidth);

    // 11. Footer link present and correct
    const link = document.querySelector(".foot a");
    ok("footer-link", link && link.href.includes("nithilan-alt-f4/proximity-"), link ? link.href : "none");

    // 12. Hero numeral version-stamped
    ok("numeral-version", document.getElementById("hero-numeral").textContent.trim() === "1.0.0",
       document.getElementById("hero-numeral").textContent);

    return out.join("\\n");
  })()`);

  console.log(checks);
  app.quit();
}).catch(e => { console.error("FATAL:", e.message); app.quit(); });
