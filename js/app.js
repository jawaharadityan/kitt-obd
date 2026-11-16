import { Gauge } from "./gauge.js";
import { SafeELM327, VehicleNotResponding, webSerialTransport, SPP_UUID, FAST_PIDS, SLOW_PIDS, PIDS, UNITS } from "./elm327.js";
import { describe, loadDb, makes } from "./dtc.js";
import { DemoVehicle } from "./demo.js";

const $ = (id) => document.getElementById(id);
const DTC_INTERVAL = 30000;
const serialOK = "serial" in navigator;
const APP_VERSION = "1.3.0";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Friendlier labels for makes in the code database (value stays the database key).
const MAKE_LABEL = { Suzuki: "Suzuki / Maruti Suzuki", Chevy: "Chevrolet" };
const MAKE_NOTE = {
  Suzuki: "Only 16 Suzuki-specific codes are in the database. Most Maruti-specific codes (P1xxx etc.) will show a general description.",
  Kia: "Only 72 Kia-specific codes are in the database.",
};

// ---------- gauges ----------
const RED = "#ff2a2a", AMBER = "#ffb020", GREEN = "#35e07a", BLUE = "#4aa8ff";
const gauges = {
  rpm: new Gauge($("g-rpm"), { title: "ENGINE SPEED", unit: "RPM", min: 0, max: 8000, major: 1000, minor: 500,
    labelDiv: 1000, zones: [[5500, 6500, AMBER], [6500, 8000, RED]] }),
  speed: new Gauge($("g-speed"), { title: "VEHICLE SPEED", unit: "KM/H", min: 0, max: 200, major: 20, minor: 10,
    zones: [[120, 200, AMBER]] }),
  coolant: new Gauge($("g-coolant"), { title: "COOLANT TEMP", unit: "°C", min: 40, max: 130, major: 10, minor: 5,
    zones: [[40, 70, BLUE], [70, 105, GREEN], [105, 115, AMBER], [115, 130, RED]] }),
  battery: new Gauge($("g-battery"), { title: "BATTERY", unit: "VOLTS", min: 9, max: 16, major: 1, minor: 0.5,
    decimals: 1, zones: [[9, 11.8, RED], [11.8, 12.4, AMBER], [12.4, 14.8, GREEN], [14.8, 16, RED]] }),
  load: new Gauge($("g-load"), { title: "ENGINE LOAD", unit: "%", min: 0, max: 100, major: 20, minor: 10,
    zones: [[0, 80, GREEN], [80, 100, AMBER]] }),
};
(function loop() { for (const g of Object.values(gauges)) g.step(); requestAnimationFrame(loop); })();

// ---------- state ----------
const state = {
  connection: "idle", message: "Not connected", demo: false, adapter: {}, values: {}, status: null,
  dtcs: { stored: [], pending: [], read_at: null }, engine_running: false, hz: 0,
  supported: null,   // Set of value keys the car reports (null = unknown / demo)
  vehicleError: "",  // last reason the car didn't answer
};
function update(patch) {
  Object.assign(state, patch);
  const rpm = state.values.rpm;
  state.engine_running = rpm != null && rpm > 200;
  render();
}
const dtcPayload = (raw) => ({ stored: raw.stored, pending: raw.pending, read_at: Date.now() });

// Vehicle make (for manufacturer-specific codes), remembered on this device only.
const MAKE_KEY = "kitt-obd-make";
let make = "";
try { make = localStorage.getItem(MAKE_KEY) || ""; } catch {}
function fillMakes() {
  const sel = $("make");
  sel.innerHTML = `<option value="">Not set</option>` +
    makes().map((m) => `<option value="${esc(m)}" ${m === make ? "selected" : ""}>${esc(MAKE_LABEL[m] || m)}</option>`).join("");
  renderMakeNote();
}
function renderMakeNote() {
  $("make-note").textContent = MAKE_NOTE[make] || "";
  $("make-note").hidden = !MAKE_NOTE[make];
}
$("make").addEventListener("change", (e) => {
  make = e.target.value;
  try { localStorage.setItem(MAKE_KEY, make); } catch {}
  renderMakeNote();
  lastDtcKey = ""; render();
});
loadDb().then(() => { fillMakes(); lastDtcKey = ""; render(); });

// ---------- rendering ----------
const READOUTS = [
  ["throttle", "Throttle position", 1], ["intake_temp", "Intake air temp", 0],
  ["ambient_temp", "Ambient air temp", 0], ["oil_temp", "Engine oil temp", 0],
  ["fuel_level", "Fuel level", 0], ["maf", "Mass air flow", 2], ["map", "Manifold pressure", 0],
  ["module_voltage", "ECU module voltage", 2], ["battery", "Battery (adapter pin 16)", 2],
];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function renderDtcList(id, list, cls) {
  $(id).innerHTML = !list.length ? `<li class="none">No codes</li>` : list.map((d) => `<li class="${cls}">
    <span class="dtc-code">${esc(d.code)}</span>
    <span class="dtc-desc">${esc(d.description)}<small>${esc(d.system)} · ${esc(d.note)}</small></span>
    <span class="sev ${esc(d.severity)}">${esc(d.severity.toUpperCase())}</span></li>`).join("");
}

let lastDtcKey = "";
function render() {
  const s = state, online = s.connection === "online", v = s.values;
  const adapterOnly = s.connection === "adapter_only", live = online || adapterOnly;
  // Battery comes from the adapter itself (ATRV), so it is always "supported".
  const has = (k) => !live || k === "battery" || (s.supported ? s.supported.has(k) : true);
  document.body.classList.toggle("offline", !live);
  $("dot").className = "dot " + (online ? "ok" : s.connection === "error" ? "bad" : s.connection === "idle" ? "" : "amber");
  $("conn").textContent = s.demo ? "DEMO" : adapterOnly ? "ADAPTER ONLY" : s.connection.toUpperCase();
  $("adapter").textContent = s.adapter.version || "—";
  $("protocol").textContent = s.adapter.protocol || "—";
  $("hz").textContent = online ? `${s.hz} Hz` : "—";

  for (const [k, g] of Object.entries(gauges)) {
    const sup = adapterOnly ? k === "battery" : has(k);
    g.unsupported(!sup, adapterOnly ? "NO RESPONSE FROM CAR" : undefined);
    if (sup) g.set(live ? (k === "battery" ? v.battery ?? v.module_voltage : v[k]) ?? null : null);
  }

  const rows = READOUTS.filter(([k]) => (adapterOnly ? k === "battery" : has(k)));
  const hidden = READOUTS.length - rows.length;
  $("readouts").innerHTML = rows.map(([k, label, dec]) => {
    const val = live ? v[k] : null, unit = k === "battery" ? "V" : UNITS[k] || "";
    return `<tr><td>${label}</td><td>${val == null ? "—" : Number(val).toFixed(dec)}<small>${val == null ? "" : unit}</small></td></tr>`;
  }).join("") + (hidden ? `<tr class="muted-row"><td colspan="2">${hidden} reading${hidden > 1 ? "s" : ""} not supported by this car — hidden</td></tr>` : "");

  // connect controls
  const busy = ["searching", "connecting", "initialising"].includes(s.connection);
  $("controls").hidden = live;
  $("btn-report").disabled = !lastElm && !s.demo;
  $("btn-connect").disabled = busy || !serialOK;
  $("btn-demo").disabled = busy;
  $("btn-disconnect").hidden = !(live || busy || s.connection === "error");

  let msg = "";
  if (adapterOnly) msg = "Battery voltage is read by the adapter itself. Engine data and fault codes need the car's computer to answer. Retrying every 20 s.";
  else if (!online) msg = s.message;
  else if (s.demo) msg = "DEMO MODE — synthetic telemetry and sample fault codes. Nothing is connected.";
  else if (!s.engine_running) msg = "Engine not running — RPM, load and speed will stream once it starts.";
  $("notice").hidden = !msg;
  $("notice-text").textContent = msg;

  const d = s.dtcs, st = s.status, banner = $("banner");
  if (adapterOnly) {
    banner.className = "banner warn";
    $("banner-title").textContent = "ADAPTER CONNECTED — CAR NOT RESPONDING";
    $("banner-sub").textContent = "Ignition ON? If it is, this car may not support standard OBD-II (common on pre-2020 BS4 Marutis). Tap SAVE REPORT and share it.";
  } else if (!online || !d.read_at) {
    banner.className = "banner";
    $("banner-title").textContent = online ? "SCANNING…" : "NOT CONNECTED";
    $("banner-sub").textContent = online ? "Reading fault codes (Mode 03 / 07)…" : "Tap CONNECT ADAPTER to pair with your OBD-II dongle";
  } else {
    const n = d.stored.length, p = d.pending.length;
    banner.className = "banner " + (n ? "fault" : p ? "warn" : "ok");
    $("banner-title").textContent = n ? `${n} FAULT CODE${n > 1 ? "S" : ""} STORED`
      : p ? `${p} PENDING CODE${p > 1 ? "S" : ""}` : "SCAN COMPLETE — NO FAULTS DETECTED";
    $("banner-sub").textContent = `MIL: ${st ? (st.mil ? "ON" : "OFF") : "?"} · stored ${n} · pending ${p} · read-only`;
  }
  const key = JSON.stringify([d.stored, d.pending, make, adapterOnly]);
  if (key !== lastDtcKey) {
    lastDtcKey = key;
    if (adapterOnly) {
      for (const id of ["dtc-stored", "dtc-pending"]) $(id).innerHTML = `<li class="none muted-li">Not available — car not responding</li>`;
    } else {
      renderDtcList("dtc-stored", d.stored.map((c) => describe(c, make)), "stored");
      renderDtcList("dtc-pending", d.pending.map((c) => describe(c, make)), "pending");
    }
  }
  $("dtc-time").textContent = d.read_at ? `Last read ${new Date(d.read_at).toLocaleTimeString()} · auto-refresh every 30 s` : "";
}

// ---------- screen wake lock (keeps the display on while driving) ----------
let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && !wakeLock && "wakeLock" in navigator) {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => { wakeLock = null; });
    } else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch { /* not allowed right now; harmless */ }
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && state.connection === "online") keepAwake(true);
});

// ---------- session control ----------
let session = 0;     // increments on every start/stop so stale loops exit
let dtcRequested = false;
let elm = null;
let lastElm = null; // kept after errors so a report can still be saved

async function stop(message = "Disconnected") {
  session++;
  lastElm = null;
  if (elm) { try { await elm.close(); } catch {} elm = null; }
  keepAwake(false);
  update({ connection: "idle", message, demo: false, adapter: {}, values: {}, status: null,
    dtcs: { stored: [], pending: [], read_at: null }, hz: 0, supported: null, vehicleError: "" });
}

async function runDemo() {
  await stop();
  const my = session, car = new DemoVehicle();
  update({ connection: "online", demo: true, message: "Demo",
    adapter: { version: "ELM327 v1.5 (simulated)", protocol: "ISO 15765-4 (CAN 11/500)" },
    status: car.status(), dtcs: dtcPayload(car.dtcs()) });
  keepAwake(true);
  let t = performance.now(), n = 0;
  while (my === session) {
    state.values = car.sample();
    if (dtcRequested) { dtcRequested = false; state.dtcs = dtcPayload(car.dtcs()); }
    if (++n && performance.now() - t > 2000) { state.hz = Math.round((n / (performance.now() - t)) * 10000) / 10; t = performance.now(); n = 0; }
    update({});
    await new Promise((r) => setTimeout(r, 100));
  }
}

async function runLive(port) {
  await stop();
  const my = session;
  let attempt = 0;
  while (my === session) {
    try {
      update({ connection: "connecting", message: "Opening Bluetooth link to adapter…" });
      elm = lastElm = new SafeELM327(await webSerialTransport(port));
      update({ connection: "initialising", message: "Talking to the adapter…" });
      await elm.initAdapter();
      attempt = 0;
      update({ adapter: { version: elm.info.version } });
      const info = await connectVehicleOrAdapterOnly(my);
      if (!info) return;
      update({ connection: "online", message: "Connected", vehicleError: "",
        adapter: { version: info.version, protocol: info.protocol, protocol_num: info.protocolNum },
        supported: new Set([...info.supported].filter((p) => PIDS[p]).map((p) => PIDS[p].key)) });
      keepAwake(true);
      const fast = FAST_PIDS.filter((p) => info.supported.has(p));
      const slow = SLOW_PIDS.filter((p) => info.supported.has(p));
      let lastDtc = -Infinity, slowI = 0, cycle = 0, emptyCycles = 0, t = performance.now(), n = 0;
      while (my === session) {
        const vals = {};
        for (const p of fast) vals[PIDS[p].key] = await elm.readPid(p);
        if (slow.length) { const p = slow[slowI++ % slow.length]; vals[PIDS[p].key] = await elm.readPid(p); }
        if (cycle % 10 === 0) vals.battery = await elm.readBattery();
        const got = Object.fromEntries(Object.entries(vals).filter(([, x]) => x != null));
        // Android can't report Bluetooth disconnects, so treat sustained silence as a lost link.
        emptyCycles = Object.keys(got).length ? 0 : emptyCycles + 1;
        if (emptyCycles >= 4) throw new Error("No data from adapter or vehicle");
        Object.assign(state.values, got);
        if (dtcRequested || performance.now() - lastDtc > DTC_INTERVAL) {
          dtcRequested = false;
          state.status = await elm.readStatus();
          state.dtcs = dtcPayload(await elm.readDtcs());
          lastDtc = performance.now();
        }
        cycle++; n++;
        if (performance.now() - t > 2000) { state.hz = Math.round((n / (performance.now() - t)) * 10000) / 10; t = performance.now(); n = 0; }
        update({});
      }
    } catch (e) {
      if (my !== session) return;
      console.warn(e);
      if (elm) { try { await elm.close(); } catch {} elm = null; }
      attempt++;
      const wait = Math.min(15, 2 * attempt);
      update({ connection: "error", message: `${e.message || e}. Retrying in ${wait}s… (tap DISCONNECT to stop)` });
      await new Promise((r) => setTimeout(r, wait * 1000));
    }
  }
}

/** Keep trying the car; meanwhile show adapter-only data (battery). Returns info, or null if stopped. */
async function connectVehicleOrAdapterOnly(my) {
  while (my === session) {
    try {
      update({ connection: "initialising", message: "Detecting vehicle protocol — ignition must be ON (can take ~15 s)…" });
      return await elm.connectVehicle();
    } catch (e) {
      if (!(e instanceof VehicleNotResponding)) throw e;
      update({ connection: "adapter_only", vehicleError: e.message, adapter: { version: elm.info.version } });
      keepAwake(true);
      let misses = 0;
      const until = performance.now() + 20000;
      while (my === session && performance.now() < until) {
        const b = await elm.readBattery();
        if (b == null) { if (++misses >= 3) throw new Error("Adapter stopped responding"); }
        else { misses = 0; state.values.battery = b; update({}); }
        await sleep(2000);
      }
    }
  }
  return null;
}

// ---------- connection report (no VIN or personal data; Mode 09 is never queried) ----------
function buildReport() {
  const info = lastElm?.info;
  const supportedHex = info ? [...info.supported].sort() : [];
  return {
    report: "KITT OBD connection report", app_version: APP_VERSION, generated_at: new Date().toISOString(),
    browser: navigator.userAgent, demo: state.demo, connection: state.connection,
    vehicle_make_selected: make || null,
    adapter: { version: info?.version || state.adapter.version || null },
    vehicle: {
      responded: state.connection === "online",
      protocol: info?.protocol || null, protocol_number: info?.protocolNum || null,
      error: state.vehicleError || null, raw_0100_reply: info?.raw0100 || null,
      supported_mode01_pids: supportedHex.map((p) => ({ pid: p, name: PIDS[p]?.key || null })),
      dashboard_values_supported: state.supported ? [...state.supported] : null,
      dashboard_values_missing: state.supported ? Object.values(PIDS).map((p) => p.key).filter((k) => !state.supported.has(k)) : null,
    },
    snapshot: { values: state.values, mil: state.status?.mil ?? null,
      stored_dtcs: state.dtcs.stored, pending_dtcs: state.dtcs.pending },
    commands_sent: lastElm ? [...new Set(lastElm.sent)] : [],
  };
}
async function saveReport() {
  const json = JSON.stringify(buildReport(), null, 2);
  const name = `kitt-obd-report-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
  const file = new File([json], name, { type: "application/json" });
  try {
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: "KITT OBD report" }); return; }
  } catch (e) { if (e.name === "AbortError") return; }
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(file), download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// ---------- buttons ----------
// Chrome builds differ in which Bluetooth devices the picker lists, so offer three ways to ask.
const SEARCHES = {
  default: { allowedBluetoothServiceClassIds: [SPP_UUID] },
  spp: { filters: [{ bluetoothServiceClassId: SPP_UUID }], allowedBluetoothServiceClassIds: [SPP_UUID] },
  all: undefined,
};
async function pickAdapter(kind) {
  if (!serialOK) return;
  try {
    const port = await navigator.serial.requestPort(SEARCHES[kind]);
    $("pair-help").hidden = true;
    runLive(port);
  } catch (e) {
    // NotFoundError = picker closed without a choice (including "No compatible devices found").
    if (e.name === "NotFoundError") $("pair-help").hidden = false;
    else update({ connection: "error", message: `Could not open adapter: ${e.message}` });
  }
}
$("btn-connect").addEventListener("click", () => pickAdapter("default"));
$("btn-search-spp").addEventListener("click", () => pickAdapter("spp"));
$("btn-search-all").addEventListener("click", () => pickAdapter("all"));
$("chrome-ver").textContent = (navigator.userAgent.match(/Chrome\/([\d.]+)/) || [, "unknown"])[1];
$("btn-demo").addEventListener("click", runDemo);
$("btn-disconnect").addEventListener("click", () => stop());
$("rescan").addEventListener("click", () => { dtcRequested = true; });
$("btn-report").addEventListener("click", saveReport);

// ---------- startup ----------
if (!serialOK) {
  update({ message: "This browser can't reach Bluetooth serial devices. Open in Chrome on Android (or desktop Chrome/Edge). Demo mode still works." });
} else {
  update({ message: "Pair the adapter in Android Bluetooth settings first, ignition ON, then tap CONNECT ADAPTER." });
  // Reconnect automatically to an adapter granted in an earlier visit.
  navigator.serial.getPorts().then((ports) => { if (ports.length === 1) runLive(ports[0]); });
}
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
