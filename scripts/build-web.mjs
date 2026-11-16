// Copies the web app into www/ for the Android build (Capacitor's webDir).
// The GitHub Pages site is served from the repo root and does not use www/.
import { cpSync, rmSync, mkdirSync } from "node:fs";
const FILES = ["index.html", "style.css", "manifest.webmanifest", "js", "data", "icons"];
rmSync("www", { recursive: true, force: true });
mkdirSync("www/js/vendor", { recursive: true });
for (const f of FILES) cpSync(f, `www/${f}`, { recursive: true });
// Capacitor's JS bridge, loaded only inside the Android app.
cpSync("node_modules/@capacitor/core/dist/index.js", "www/js/vendor/capacitor-core.js");
console.log("www/ ready");
