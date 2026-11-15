// Fault-code descriptions.
// Order of preference: hand-written plain-English text (below) -> generic SAE text from the bundled
// database -> manufacturer-specific text for the selected make -> subsystem fallback.
// Bundled database: data/dtc-db.json, built from Wal33D/dtc-database (MIT, see data/DTC-DATABASE-LICENSE.txt).
const DTC_TEXT = {
 "P0010": "Camshaft position actuator circuit (bank 1)",
 "P0011": "Camshaft timing over-advanced (bank 1, intake)",
 "P0012": "Camshaft timing over-retarded (bank 1, intake)",
 "P0016": "Crankshaft / camshaft position correlation (bank 1, sensor A)",
 "P0030": "O2 sensor heater control circuit (bank 1, sensor 1)",
 "P0036": "O2 sensor heater control circuit (bank 1, sensor 2)",
 "P0087": "Fuel rail / system pressure too low",
 "P0088": "Fuel rail / system pressure too high",
 "P0100": "Mass air flow (MAF) sensor circuit malfunction",
 "P0101": "Mass air flow (MAF) sensor range / performance",
 "P0102": "Mass air flow (MAF) sensor circuit low",
 "P0103": "Mass air flow (MAF) sensor circuit high",
 "P0106": "Manifold pressure (MAP) sensor range / performance",
 "P0107": "Manifold pressure (MAP) sensor circuit low",
 "P0108": "Manifold pressure (MAP) sensor circuit high",
 "P0110": "Intake air temperature sensor circuit malfunction",
 "P0112": "Intake air temperature sensor circuit low",
 "P0113": "Intake air temperature sensor circuit high",
 "P0115": "Engine coolant temperature sensor circuit malfunction",
 "P0116": "Engine coolant temperature sensor range / performance",
 "P0117": "Engine coolant temperature sensor circuit low",
 "P0118": "Engine coolant temperature sensor circuit high",
 "P0120": "Throttle position sensor circuit malfunction",
 "P0121": "Throttle position sensor range / performance",
 "P0122": "Throttle position sensor circuit low",
 "P0123": "Throttle position sensor circuit high",
 "P0125": "Coolant temperature too low for closed-loop fuel control",
 "P0128": "Coolant thermostat: engine below regulating temperature",
 "P0130": "O2 sensor circuit malfunction (bank 1, sensor 1)",
 "P0131": "O2 sensor circuit low voltage (bank 1, sensor 1)",
 "P0132": "O2 sensor circuit high voltage (bank 1, sensor 1)",
 "P0133": "O2 sensor slow response (bank 1, sensor 1)",
 "P0134": "O2 sensor no activity detected (bank 1, sensor 1)",
 "P0135": "O2 sensor heater circuit malfunction (bank 1, sensor 1)",
 "P0136": "O2 sensor circuit malfunction (bank 1, sensor 2)",
 "P0137": "O2 sensor circuit low voltage (bank 1, sensor 2)",
 "P0138": "O2 sensor circuit high voltage (bank 1, sensor 2)",
 "P0141": "O2 sensor heater circuit malfunction (bank 1, sensor 2)",
 "P0171": "System too lean (bank 1)",
 "P0172": "System too rich (bank 1)",
 "P0174": "System too lean (bank 2)",
 "P0175": "System too rich (bank 2)",
 "P0190": "Fuel rail pressure sensor circuit malfunction",
 "P0191": "Fuel rail pressure sensor range / performance",
 "P0201": "Injector circuit malfunction — cylinder 1",
 "P0202": "Injector circuit malfunction — cylinder 2",
 "P0203": "Injector circuit malfunction — cylinder 3",
 "P0204": "Injector circuit malfunction — cylinder 4",
 "P0217": "Engine over-temperature condition",
 "P0219": "Engine over-speed condition",
 "P0230": "Fuel pump primary circuit malfunction",
 "P0234": "Turbo / supercharger overboost condition",
 "P0299": "Turbo / supercharger underboost",
 "P0300": "Random / multiple cylinder misfire detected",
 "P0301": "Cylinder 1 misfire detected",
 "P0302": "Cylinder 2 misfire detected",
 "P0303": "Cylinder 3 misfire detected",
 "P0304": "Cylinder 4 misfire detected",
 "P0305": "Cylinder 5 misfire detected",
 "P0306": "Cylinder 6 misfire detected",
 "P0325": "Knock sensor 1 circuit malfunction (bank 1)",
 "P0326": "Knock sensor 1 range / performance (bank 1)",
 "P0327": "Knock sensor 1 circuit low (bank 1)",
 "P0335": "Crankshaft position sensor A circuit malfunction",
 "P0336": "Crankshaft position sensor A range / performance",
 "P0340": "Camshaft position sensor A circuit malfunction (bank 1)",
 "P0341": "Camshaft position sensor A range / performance (bank 1)",
 "P0351": "Ignition coil A primary / secondary circuit malfunction",
 "P0352": "Ignition coil B primary / secondary circuit malfunction",
 "P0353": "Ignition coil C primary / secondary circuit malfunction",
 "P0354": "Ignition coil D primary / secondary circuit malfunction",
 "P0400": "Exhaust gas recirculation (EGR) flow malfunction",
 "P0401": "Exhaust gas recirculation (EGR) flow insufficient",
 "P0402": "Exhaust gas recirculation (EGR) flow excessive",
 "P0403": "Exhaust gas recirculation (EGR) control circuit malfunction",
 "P0404": "Exhaust gas recirculation (EGR) range / performance",
 "P0410": "Secondary air injection system malfunction",
 "P0420": "Catalyst system efficiency below threshold (bank 1)",
 "P0421": "Warm-up catalyst efficiency below threshold (bank 1)",
 "P0430": "Catalyst system efficiency below threshold (bank 2)",
 "P0440": "Evaporative emission (EVAP) system malfunction",
 "P0441": "EVAP system incorrect purge flow",
 "P0442": "EVAP system small leak detected",
 "P0443": "EVAP purge control valve circuit malfunction",
 "P0446": "EVAP vent control circuit malfunction",
 "P0455": "EVAP system large leak detected (check fuel cap)",
 "P0456": "EVAP system very small leak detected",
 "P0457": "EVAP system leak detected (fuel cap loose / off)",
 "P0480": "Cooling fan 1 control circuit malfunction",
 "P0500": "Vehicle speed sensor malfunction",
 "P0501": "Vehicle speed sensor range / performance",
 "P0505": "Idle air control system malfunction",
 "P0506": "Idle control system RPM lower than expected",
 "P0507": "Idle control system RPM higher than expected",
 "P0520": "Engine oil pressure sensor / switch circuit malfunction",
 "P0560": "System voltage malfunction",
 "P0562": "System voltage low",
 "P0563": "System voltage high",
 "P0571": "Brake switch A circuit malfunction",
 "P0600": "Serial communication link malfunction",
 "P0601": "Engine control module memory checksum error",
 "P0603": "Engine control module keep-alive memory (KAM) error",
 "P0604": "Engine control module RAM error",
 "P0606": "Engine control module processor fault",
 "P0620": "Generator (alternator) control circuit malfunction",
 "P0627": "Fuel pump control circuit open",
 "P0700": "Transmission control system malfunction (see TCM codes)",
 "P0705": "Transmission range sensor circuit malfunction",
 "P0715": "Input / turbine speed sensor circuit malfunction",
 "P0720": "Output speed sensor circuit malfunction",
 "P0730": "Incorrect gear ratio",
 "P0740": "Torque converter clutch circuit malfunction",
 "P0750": "Shift solenoid A malfunction",
 "U0001": "High-speed CAN communication bus fault",
 "U0100": "Lost communication with engine control module (ECM/PCM)",
 "U0101": "Lost communication with transmission control module (TCM)",
 "U0121": "Lost communication with ABS control module",
 "U0140": "Lost communication with body control module (BCM)",
 "U0155": "Lost communication with instrument cluster"
};
const HIGH = new Set(["P0217", "P0219", "P0234", "P0300", "P0301", "P0302", "P0303", "P0304", "P0305", "P0306", "P0335", "P0520", "P0606", "U0100"]);
const SYSTEM = { P: "Powertrain", C: "Chassis", B: "Body", U: "Network / communication" };
const P0_RANGES = [
  [0x000, 0x0ff, "Fuel & air metering / auxiliary emission controls"],
  [0x100, 0x2ff, "Fuel & air metering"],
  [0x300, 0x3ff, "Ignition system or misfire"],
  [0x400, 0x4ff, "Auxiliary emission controls"],
  [0x500, 0x5ff, "Vehicle speed, idle control & auxiliary inputs"],
  [0x600, 0x6ff, "Computer & output circuits"],
  [0x700, 0x9ff, "Transmission"],
  [0xa00, 0xaff, "Hybrid / EV propulsion"],
];

let DB = null;
export async function loadDb(url = "data/dtc-db.json") {
  try { DB = await (await fetch(url)).json(); } catch { DB = null; }
  return !!DB;
}
export const dbLoaded = () => !!DB;
export const makes = () => (DB ? Object.keys(DB.makes).filter((m) => m !== "Other") : []);

function oem(code, make) {
  if (!DB) return null;
  if (make && DB.makes[make]?.[code]) return { text: DB.makes[make][code], note: `${make}-specific code` };
  if (make) return null; // never borrow another make's meaning once the user has chosen theirs
  const defs = Object.entries(DB.makes).filter(([m, t]) => m !== "Other" && t[code]);
  if (defs.length) {
    const texts = new Set(defs.map(([, t]) => t[code]));
    const names = defs.map(([m]) => m);
    const list = names.length > 4 ? names.slice(0, 4).join(", ") + ` +${names.length - 4}` : names.join(", ");
    if (texts.size === 1) return { text: defs[0][1][code], note: `manufacturer-specific (${list}) — set your make to confirm` };
    return { text: "Manufacturer-specific — meaning differs by make. Select your vehicle make.",
             note: `defined for ${list}` };
  }
  if (DB.makes.Other?.[code]) return { text: DB.makes.Other[code], note: "manufacturer-specific, make not identified in source — verify" };
  return null;
}

export function describe(code, make = "") {
  code = code.toUpperCase();
  const system = SYSTEM[code[0]] || "Unknown";
  const saeText = DB?.generic[code];
  let text = DTC_TEXT[code] || saeText, generic = !!text || "02".includes(code[1]);
  let note = text ? "generic SAE code" : "";
  if (!text) {
    const o = oem(code, make);
    if (o) { text = o.text; note = o.note; generic = false; }
  }
  if (!text) {
    if (code[0] === "P" && "02".includes(code[1])) {
      const n = parseInt(code.slice(2, 5), 16) || 0;
      const area = (P0_RANGES.find(([lo, hi]) => n >= lo && n <= hi) || [0, 0, "Powertrain"])[2];
      text = `${area} fault`;
      note = "generic code — not in database";
    } else {
      text = `${system} fault — manufacturer-specific code`;
      note = make ? `not in database for ${make} — check a make-specific reference` : "select your vehicle make, or check a make-specific reference";
    }
  }
  const severity = HIGH.has(code) ? "high" : "PU".includes(code[0]) ? "medium" : "low";
  return { code, description: text, system, generic, severity, note };
}
