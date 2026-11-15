import { test } from "node:test";
import assert from "node:assert/strict";
import { validateCommand, UnsafeCommandError, VehicleNotResponding, cleanLines, parseDtcs, decodeDtc, SafeELM327 } from "../js/elm327.js";
import { describe, loadDb } from "../js/dtc.js";
import { readFile } from "node:fs/promises";

const ALLOWED = ["010C", "01 0d", "0100", "03", "07", "ATZ", "atrv", "ATSP0"];
const BLOCKED = ["04", "0 4", "14", "14FF00", "08", "2E F190 01", "3101", "1001", "1101", "27 01",
  "0902", "0A", "010C\r04", "010C04", "01", "010", "ATSH7E0", "ATPP", "STSBR", "AT MA", "ATBRD",
  "", "ATZ;04", "0105\n", null, 4];

test("allowlist accepts read-only commands", () => { for (const c of ALLOWED) validateCommand(c); });
test("allowlist rejects everything else", () => {
  for (const c of BLOCKED) assert.throws(() => validateCommand(c), UnsafeCommandError, String(c));
});

class FakeELM {
  constructor(responses = {}) { this.log = []; this.cb = () => {}; this.extra = responses; }
  onData(f) { this.cb = f; }
  async close() {}
  async write(bytes) {
    const cmd = new TextDecoder().decode(bytes).trim();
    this.log.push(cmd);
    const r = { ATZ: "ELM327 v1.5", ATI: "ELM327 v1.5", ATDPN: "A6", ATDP: "AUTO, ISO 15765-4 (CAN 11/500)",
      ATRV: "12.6V", "0100": "SEARCHING...\r4100BE3FA813", "0120": "41208005B015", "0101": "410181076504",
      "010C": "410C1AF8", "010D": "410D32", "0105": "41057B", "0104": "41047F", "03": "43010133", "07": "4700",
      ...this.extra }[cmd] ?? (cmd.startsWith("AT") ? "OK" : "NO DATA");
    // deliver in two chunks like a real Bluetooth link
    setTimeout(() => this.cb(r.slice(0, 3)), 1);
    setTimeout(() => this.cb(r.slice(3) + "\r\r>"), 3);
  }
}

test("blocked command never reaches the transport", async () => {
  const t = new FakeELM(), elm = new SafeELM327(t);
  await assert.rejects(() => elm.query("04"), UnsafeCommandError);
  assert.deepEqual(t.log, []);
});

test("DTC decoding and parsing", () => {
  assert.equal(decodeDtc("0133"), "P0133");
  assert.equal(decodeDtc("C123"), "U0123");
  assert.equal(decodeDtc("4171"), "C0171");
  assert.equal(decodeDtc("9234"), "B1234");
  assert.deepEqual(parseDtcs(cleanLines("SEARCHING...\r43020171042000\r\r>"), "43", true), ["P0171", "P0420"]);
  assert.deepEqual(parseDtcs(cleanLines("00A\r0:43040171042003\r1:01C123000000\r\r>"), "43", true),
    ["P0171", "P0301", "P0420", "U0123"]);
  assert.deepEqual(parseDtcs(cleanLines("43 01 71 04 20 00 00\r>"), "43", false), ["P0171", "P0420"]);
  assert.deepEqual(parseDtcs(cleanLines("4300\r>"), "43", true), []);
});

test("descriptions", () => {
  assert.match(describe("P0171").description, /lean/);
  assert.equal(describe("P1234").generic, false);
});

test("database lookup and make handling", async () => {
  const json = await readFile(new URL("../data/dtc-db.json", import.meta.url), "utf8");
  globalThis.fetch = async () => ({ json: async () => JSON.parse(json) });
  assert.ok(await loadDb());
  assert.equal(describe("P0171").description, "System too lean (bank 1)"); // plain-English wins
  assert.equal(describe("P0699").description, "Sensor Reference Voltage C Circuit High");
  assert.match(describe("P1326").note, /^manufacturer-specific \(Volkswagen\)/);
  assert.equal(describe("P1326", "Volkswagen").note, "Volkswagen-specific code");
  const kia = describe("P1326", "Kia");
  assert.ok(!kia.description.includes("Knock") && kia.note.includes("Kia"));
  assert.match(describe("P1106").description, /differs by make/);
  assert.equal(describe("P1106", "Honda").note, "Honda-specific code");
  assert.match(describe("P034D").description, /^Ignition/); // range fallback
});

test("full session against emulator; only allowlisted commands sent", async () => {
  const t = new FakeELM(), elm = new SafeELM327(t, 300);
  const info = await elm.initialise();
  assert.equal(info.protocolNum, "6");
  assert.equal(info.protocol, "AUTO, ISO 15765-4 (CAN 11/500)");
  assert.equal(info.version, "ELM327 v1.5");
  assert.ok(elm.isCan);
  for (const p of ["0C", "0D", "05", "04"]) assert.ok(info.supported.has(p), p);
  // concurrent calls must be serialised, not interleaved
  const [rpm, speed, cool] = await Promise.all([elm.readPid("0C"), elm.readPid("0D"), elm.readPid("05")]);
  assert.deepEqual([rpm, speed, cool], [1726, 50, 83]);
  assert.equal(await elm.readBattery(), 12.6);
  assert.deepEqual(await elm.readStatus(), { mil: true, dtc_count: 1 });
  assert.deepEqual(await elm.readDtcs(), { stored: ["P0133"], pending: [] });
  for (const c of t.log) validateCommand(c);
  assert.ok(!t.log.includes("04"));
});

test("timeout yields null instead of hanging", async () => {
  const t = new FakeELM(); t.write = async (b) => { t.log.push(new TextDecoder().decode(b).trim()); };
  const elm = new SafeELM327(t, 50);
  assert.equal(await elm.readPid("0C"), null);
});

const SILENT_CAR = { "0100": "SEARCHING...\rUNABLE TO CONNECT" };
const KLINE_CAR = { ATDPN: "A5", ATDP: "AUTO, ISO 14230-4 (KWP FAST)", "0100": "BUS INIT: ...OK\r4100A83A8000",
  "03": "43 01 33 03 01 00 00", "07": "47 00 00 00 00 00 00", "0101": "4101820000" };

test("silent car: VehicleNotResponding, adapter still usable", async () => {
  const elm = new SafeELM327(new FakeELM(SILENT_CAR), 300);
  assert.equal((await elm.initAdapter()).version, "ELM327 v1.5");
  await assert.rejects(() => elm.connectVehicle(), VehicleNotResponding);
  assert.equal(elm.info.raw0100, "UNABLETOCONNECT");
  assert.equal(await elm.readBattery(), 12.6);
});

test("K-line car: limited PIDs and legacy DTC framing", async () => {
  const elm = new SafeELM327(new FakeELM(KLINE_CAR), 300);
  const info = await elm.initialise();
  assert.equal(info.protocol, "AUTO, ISO 14230-4 (KWP FAST)");
  assert.ok(!elm.isCan);
  assert.deepEqual([...info.supported].sort(), ["01", "03", "05", "0B", "0C", "0D", "0F", "11"]);
  assert.deepEqual(await elm.readDtcs(), { stored: ["P0133", "P0301"], pending: [] });
  for (const c of elm.sent) validateCommand(c);
});
