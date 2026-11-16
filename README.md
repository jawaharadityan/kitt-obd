# K.I.T.T. OBD — phone app (PWA)

Read-only OBD-II dashboard that runs entirely in Chrome on Android (tested layout for Galaxy S24 Ultra)
and talks **directly** to a Bluetooth Classic ELM327 adapter. No server, no Mac, works offline once installed.

## Android app (APK)
Use this if Chrome's device picker says "No compatible devices found". The app uses the same dashboard,
but connects to the paired adapter directly through Android Bluetooth, the way Torque does.

1. Download **kitt-obd.apk** from
   https://github.com/jawaharadityan/kitt-obd/releases/download/apk-latest/kitt-obd.apk
2. Open it. Android will ask you to allow installs from Chrome or Files: allow it for this install.
3. Open **KITT OBD**, allow **Nearby devices**, tap **CONNECT ADAPTER** and pick **OBDII**. It reconnects
   automatically next time.

Built by GitHub Actions (`.github/workflows/android-apk.yml`) on every push to `main`. A new build installs
as an update over the old one. The read-only allowlist is enforced twice: in `js/elm327.js` and again in
native code (`ReadOnlyGuard.java`) before any byte reaches the adapter.

**Signing:** the key (`android/kitt-obd.keystore`) is committed so CI can build updates without secrets.
Anyone could sign an APK with it, so install only from this repository's Releases page.

## Install on the phone (browser version)
1. Android **Settings → Connections → Bluetooth**: pair the OBD adapter (PIN is usually `1234` or `0000`).
2. Open the app URL in **Chrome** (not Samsung Internet). Use ⋮ → **Add to home screen → Install**.
3. Ignition ON → open the app → **CONNECT ADAPTER** → pick the adapter. Chrome remembers it, so later
   launches reconnect automatically.

**DEMO MODE** runs a simulated drive with sample fault codes and needs no car.

## How it works
Chrome's Web Serial API can open the adapter's Bluetooth RFCOMM / Serial Port Profile channel
(UUID `00001101-…`) on paired devices
([Chrome blog](https://developer.chrome.com/blog/serial-over-bluetooth)). `js/elm327.js` speaks the
ELM327 AT protocol over that link, auto-detects the vehicle protocol (`ATSP0`), polls only the PIDs the
ECU reports as supported, and reads fault codes every 30 s.

## Read-only safety
Every command goes through `validateCommand()` before it is written. Allowed: `01xx` (live data),
`03` (stored DTCs), `07` (pending DTCs) and ELM327 chip-config AT commands (`ATZ ATE0 ATL0 ATS0 ATH0
ATSP0 ATDP ATDPN ATRV ATI AT@1 ATAT1 ATAT2 ATWS`). Everything else throws before it is sent:
`04` (clear codes), UDS `10/11/14/27/2E/31`, `08`, `09`, `ATSH`, injection like `010C\r04`, etc.

Tests: `npm test` (Node 18+, no dependencies).

## Fault-code descriptions
Lookup order: hand-written plain-English text for ~150 common codes → generic SAE text for 9,415 codes →
manufacturer-specific text for the **Vehicle make** you select (33 makes, incl. Kia) → subsystem fallback.
Once a make is selected, another make's meaning is never shown for that code. Some codes mean
different things on different makes.

The bundled database is built from [Wal33D/dtc-database](https://github.com/Wal33D/dtc-database)
(commit `04c43d7`, MIT licence, see `data/DTC-DATABASE-LICENSE.txt`). It has 18,805 entries, not the
28,000+ claimed in its README. Its per-make entries for *generic* codes are lists of possible causes rather
than descriptions, so they're excluded. Coverage for some makes is thin (e.g. Kia 72 codes, Toyota 40, no
Hyundai), and accuracy is the upstream project's, not verified here.

## When the car doesn't answer, or only partly answers
- **Adapter-only mode:** if the adapter replies but the car's computer doesn't (ignition off, or no standard
  OBD-II, as on some pre-2020 BS4 Marutis), the dashboard keeps showing battery voltage. The adapter measures
  that itself. It retries the car every 20 s.
- **Unsupported readings:** gauges for values the car doesn't report show *N/A — NOT SUPPORTED BY CAR*, and
  those rows are hidden from the live-data table instead of showing a dash.
- **SAVE REPORT:** saves a JSON file with the adapter version, protocol, raw `0100` reply, the car's supported
  PID list, what's missing, and every command sent. No VIN or personal data, since Mode 09 is never queried.
- **Maruti:** pick *Suzuki / Maruti Suzuki* as the make. Only 16 Suzuki-specific codes are in the database.
- **One app at a time:** a Bluetooth OBD adapter accepts one connection. Close Torque or any other OBD app first.

## Limits
- Chrome on Android or desktop Chrome/Edge only. Not Samsung Internet, Firefox, iOS, or WebView apps.
- Bluetooth **Classic** adapters only. BLE-only and Wi-Fi adapters can't be reached from a browser.
- Live data only while the app is on screen; it holds a screen wake-lock while connected.
- Android doesn't report Bluetooth disconnects to web apps, so a dropped link is detected after a
  few seconds of silence and retried automatically.
- Severity labels on fault codes are a rough guide, not an official classification.

## Updating
Change files, bump `VERSION` in `sw.js`, push. The installed app picks it up on its next online launch.
