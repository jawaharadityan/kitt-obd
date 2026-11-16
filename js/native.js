// Android app only (Capacitor). The web/PWA build never imports the vendor bridge.
let plugin = null;

export const isNative = () => !!(window.androidBridge || window.Capacitor?.isNativePlatform?.());

async function obd() {
  if (!plugin) {
    const { registerPlugin } = await import("./vendor/capacitor-core.js");
    plugin = registerPlugin("ObdBluetooth");
  }
  return plugin;
}

/** Paired Bluetooth devices: [{ name, address, serial }] */
export async function listPaired() {
  return (await (await obd()).listPaired()).devices || [];
}

/** Same transport shape as webSerialTransport(): write(bytes), onData(cb), close(). */
export async function nativeTransport(address) {
  const p = await obd();
  let cb = () => {};
  const dataSub = await p.addListener("data", (e) => cb(e.data));
  const lostSub = await p.addListener("disconnected", () => {});
  try {
    await p.connect({ address });
  } catch (e) {
    dataSub.remove(); lostSub.remove();
    throw e;
  }
  return {
    // The plugin re-validates the command against the read-only allowlist and appends "\r".
    write: (bytes) => p.write({ data: new TextDecoder().decode(bytes).replace(/\r$/, "") }),
    onData: (f) => { cb = f; },
    close: async () => {
      dataSub.remove(); lostSub.remove();
      try { await p.disconnect(); } catch {}
    },
  };
}
