// Read-only ELM327 driver for the browser (Web Serial over Bluetooth RFCOMM / USB).
//
// Every command goes through SafeELM327.#send, which calls validateCommand()
// BEFORE anything is written. Only these pass:
//   01xx  Mode 01 live data (single PID)
//   03    Mode 03 stored DTCs
//   07    Mode 07 pending DTCs (read-only)
//   a short list of AT commands that configure the adapter chip only.
// Mode 04 (clear codes), UDS writes/routines, header changes etc. are rejected.

export class UnsafeCommandError extends Error {}
/** The adapter answers but no ECU replies to 0100 (ignition off, or no standard OBD-II on this car). */
export class VehicleNotResponding extends Error {}

const OBD_ALLOWED = [/^01[0-9A-F]{2}$/, /^03$/, /^07$/];
const AT_ALLOWED = new Set(["ATZ", "ATWS", "ATE0", "ATL0", "ATS0", "ATH0", "ATSP0", "ATDPN",
  "ATDP", "ATRV", "ATI", "AT@1", "ATAT1", "ATAT2"]);

export function validateCommand(cmd) {
  if (typeof cmd !== "string") throw new UnsafeCommandError("command must be a string");
  const norm = cmd.replace(/ /g, "").toUpperCase();
  if (!norm || /[\r\n\t\0]/.test(norm)) throw new UnsafeCommandError(`illegal characters in ${JSON.stringify(cmd)}`);
  if (AT_ALLOWED.has(norm) || OBD_ALLOWED.some((re) => re.test(norm))) return norm;
  throw new UnsafeCommandError(`${JSON.stringify(cmd)} is not on the read-only allowlist`);
}

// ---------- parsing ----------
const NOISE = ["SEARCHING...", "BUSINIT", "OK"];
const ERRORS = ["NODATA", "UNABLETOCONNECT", "CANERROR", "BUSERROR", "STOPPED", "ERROR", "?",
  "BUFFERFULL", "FBERROR", "DATAERROR", "LVRESET", "ACTALERT"];

export function cleanLines(raw) {
  return raw.replace(/>/g, "").split(/[\r\n]+/)
    .map((l) => l.trim().replace(/ /g, "").toUpperCase())
    .filter((l) => l && !NOISE.some((n) => l.startsWith(n)));
}
export const isError = (lines) => !lines.length || lines.some((l) => ERRORS.includes(l) || l.startsWith("UNABLETO"));

export function joinFrames(lines) {
  const framed = lines.filter((l) => /^[0-9A-F]:/.test(l));
  if (framed.length) {
    let data = framed.map((l) => l.slice(2)).join("");
    const len = lines.find((l) => /^[0-9A-F]{3}$/.test(l));
    if (len) data = data.slice(0, parseInt(len, 16) * 2);
    return [data];
  }
  return lines.filter((l) => /^[0-9A-F]+$/.test(l));
}

export function decodeDtc(word) {
  const first = parseInt(word[0], 16);
  return "PCBU"[first >> 2] + (first & 3) + word.slice(1, 4);
}

export function parseDtcs(lines, modeResp, isCan) {
  const codes = new Set();
  for (const msg of joinFrames(lines)) {
    if (!msg.startsWith(modeResp)) continue;
    let body = msg.slice(2);
    if (isCan && body.length >= 2) body = body.slice(2); // CAN: DTC count byte
    for (let i = 0; i + 4 <= body.length; i += 4) {
      const w = body.slice(i, i + 4);
      if (w !== "0000") codes.add(decodeDtc(w));
    }
  }
  return [...codes].sort();
}

// ---------- PIDs ----------
export const PIDS = {
  "04": { key: "load", n: 1, unit: "%", f: (a) => (a[0] * 100) / 255 },
  "05": { key: "coolant", n: 1, unit: "°C", f: (a) => a[0] - 40 },
  "0B": { key: "map", n: 1, unit: "kPa", f: (a) => a[0] },
  "0C": { key: "rpm", n: 2, unit: "rpm", f: (a) => (a[0] * 256 + a[1]) / 4 },
  "0D": { key: "speed", n: 1, unit: "km/h", f: (a) => a[0] },
  "0F": { key: "intake_temp", n: 1, unit: "°C", f: (a) => a[0] - 40 },
  "10": { key: "maf", n: 2, unit: "g/s", f: (a) => (a[0] * 256 + a[1]) / 100 },
  "11": { key: "throttle", n: 1, unit: "%", f: (a) => (a[0] * 100) / 255 },
  "2F": { key: "fuel_level", n: 1, unit: "%", f: (a) => (a[0] * 100) / 255 },
  "42": { key: "module_voltage", n: 2, unit: "V", f: (a) => (a[0] * 256 + a[1]) / 1000 },
  "46": { key: "ambient_temp", n: 1, unit: "°C", f: (a) => a[0] - 40 },
  "5C": { key: "oil_temp", n: 1, unit: "°C", f: (a) => a[0] - 40 },
};
export const FAST_PIDS = ["0C", "0D", "04", "11"];
export const SLOW_PIDS = ["05", "0F", "42", "2F", "46", "5C", "0B", "10"];
export const UNITS = Object.fromEntries(Object.values(PIDS).map((p) => [p.key, p.unit]));

// ---------- driver ----------
/**
 * transport: { write(Uint8Array): Promise, onData: (callback(string)) => void, close(): Promise }
 */
export class SafeELM327 {
  #t; #buf = ""; #waiter = null; #queue = Promise.resolve();
  constructor(transport, timeoutMs = 2000) {
    this.#t = transport;
    this.timeoutMs = timeoutMs;
    this.info = { version: "", protocol: "", protocolNum: "", supported: new Set(), raw0100: "" };
    this.sent = []; // audit log of every command written
    transport.onData((s) => {
      this.#buf += s;
      if (this.#waiter && this.#buf.includes(">")) this.#waiter();
    });
  }

  // The only path that writes to the adapter. Serialised so commands never interleave.
  #send(cmd, timeoutMs) {
    const norm = validateCommand(cmd); // throws synchronously -> nothing written
    const run = async () => {
      this.#buf = "";
      const done = new Promise((resolve) => {
        const timer = setTimeout(() => { this.#waiter = null; resolve(); }, timeoutMs ?? this.timeoutMs);
        this.#waiter = () => { clearTimeout(timer); this.#waiter = null; resolve(); };
      });
      this.sent.push(norm);
      await this.#t.write(new TextEncoder().encode(norm + "\r"));
      await done;
      return this.#buf;
    };
    const p = this.#queue.then(run, run);
    this.#queue = p.catch(() => {});
    return p;
  }

  async query(cmd, timeoutMs) {
    const norm = validateCommand(cmd);
    return cleanLines(await this.#send(norm, timeoutMs)).filter((l) => l !== norm);
  }

  // Human-readable reply (spaces kept) for ATI / ATDP.
  async queryText(cmd, timeoutMs) {
    const norm = validateCommand(cmd);
    return (await this.#send(norm, timeoutMs)).replace(/>/g, "").split(/[\r\n]+/)
      .map((l) => l.trim()).filter((l) => l && l.replace(/ /g, "").toUpperCase() !== norm);
  }

  get isCan() { return ["6", "7", "8", "9", "A", "B", "C"].includes(this.info.protocolNum); }

  /** Full start-up: adapter, then vehicle. Kept for callers that want both in one step. */
  async initialise() {
    await this.initAdapter();
    return this.connectVehicle();
  }

  /** Reset and configure the ELM327 chip. Talks to the adapter only. */
  async initAdapter() {
    const id = await this.queryText("ATZ", 5000);
    this.info.version = id.find((l) => l.includes("ELM")) || id.join(" ");
    if (!this.info.version.includes("ELM")) {
      const ati = await this.queryText("ATI", 3000);
      this.info.version = ati.find((l) => l.includes("ELM")) || "";
      if (!this.info.version) throw new Error("No ELM327 response. Is this the OBD adapter?");
    }
    for (const c of ["ATE0", "ATL0", "ATS0", "ATH0", "ATAT1", "ATSP0"]) await this.query(c);
    return this.info;
  }

  /** Ask the car for its supported-PID list; this triggers the automatic protocol search. */
  async connectVehicle() {
    const first = await this.query("0100", 15000);
    this.info.raw0100 = first.join(" ");
    if (isError(first)) {
      throw new VehicleNotResponding(`Vehicle did not answer the standard OBD-II request (${first.join(" ") || "timeout"})`);
    }
    this.info.supported = await this.#supported(first);
    this.info.protocolNum = ((await this.query("ATDPN"))[0] || "").replace(/^A/, "");
    this.info.protocol = (await this.queryText("ATDP"))[0] || "";
    return this.info;
  }

  async #supported(first) {
    const sup = new Set();
    let base = 0, lines = first;
    for (;;) {
      let bitmap = null;
      const head = "41" + base.toString(16).toUpperCase().padStart(2, "0");
      for (const m of joinFrames(lines)) {
        if (m.startsWith(head) && m.length >= 12) bitmap = (bitmap ?? 0) | parseInt(m.slice(4, 12), 16);
      }
      if (bitmap === null) break;
      for (let i = 0; i < 32; i++) {
        if ((bitmap >>> (31 - i)) & 1) sup.add((base + i + 1).toString(16).toUpperCase().padStart(2, "0"));
      }
      const next = base + 0x20, hex = next.toString(16).toUpperCase().padStart(2, "0");
      if (!sup.has(hex) || next > 0x60) break;
      base = next;
      lines = await this.query("01" + hex);
    }
    return sup;
  }

  async readPid(pid) {
    const p = PIDS[pid], lines = await this.query("01" + pid);
    if (isError(lines)) return null;
    for (const m of joinFrames(lines)) {
      if (m.startsWith("41" + pid) && m.length >= 4 + p.n * 2) {
        const a = Array.from({ length: p.n }, (_, i) => parseInt(m.slice(4 + i * 2, 6 + i * 2), 16));
        return Math.round(p.f(a) * 100) / 100;
      }
    }
    return null;
  }

  async readStatus() {
    for (const m of joinFrames(await this.query("0101"))) {
      if (m.startsWith("4101") && m.length >= 6) {
        const a = parseInt(m.slice(4, 6), 16);
        return { mil: !!(a & 0x80), dtc_count: a & 0x7f };
      }
    }
    return null;
  }

  async readBattery() {
    const m = (await this.query("ATRV")).join("").match(/(\d+(?:\.\d+)?)V/);
    return m ? parseFloat(m[1]) : null;
  }

  async readDtcs() {
    const s = await this.query("03", 5000), p = await this.query("07", 5000);
    return {
      stored: isError(s) ? [] : parseDtcs(s, "43", this.isCan),
      pending: isError(p) ? [] : parseDtcs(p, "47", this.isCan),
    };
  }

  close() { return this.#t.close(); }
}

// ---------- Web Serial transport ----------
export const SPP_UUID = "00001101-0000-1000-8000-00805f9b34fb";

export async function webSerialTransport(port) {
  await port.open({ baudRate: 38400 });
  const writer = port.writable.getWriter();
  const reader = port.readable.getReader();
  const decoder = new TextDecoder();
  let cb = () => {}, closed = false;
  (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        cb(decoder.decode(value, { stream: true }));
      }
    } catch { /* port lost */ }
  })();
  return {
    write: (bytes) => writer.write(bytes),
    onData: (f) => { cb = f; },
    close: async () => {
      if (closed) return;
      closed = true;
      try { await reader.cancel(); } catch {}
      try { reader.releaseLock(); writer.releaseLock(); } catch {}
      try { await port.close(); } catch {}
    },
  };
}
