package io.github.jawaharadityan.kittobd;

import android.Manifest;
import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothSocket;
import android.content.Context;
import android.os.Build;
import android.os.ParcelUuid;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Bluetooth Classic (SPP / RFCOMM) link to a paired ELM327 adapter.
 *
 * Read-only by construction, independently of the web code: write() only accepts
 * Mode 01 single-PID requests, Mode 03, Mode 07 and a fixed list of adapter
 * configuration AT commands. Anything else (e.g. 04 = clear codes) is rejected
 * here before a single byte reaches the adapter.
 */
@CapacitorPlugin(
    name = "ObdBluetooth",
    permissions = {
        @Permission(alias = "bluetooth", strings = { Manifest.permission.BLUETOOTH_CONNECT })
    }
)
public class ObdBluetoothPlugin extends Plugin {

    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");

    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private BluetoothSocket socket;
    private OutputStream out;
    private Thread reader;

    private boolean needsPermission() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
            && getPermissionState("bluetooth") != PermissionState.GRANTED;
    }

    private BluetoothAdapter adapter() {
        BluetoothManager m = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        return m == null ? null : m.getAdapter();
    }

    @PluginMethod
    public void listPaired(PluginCall call) {
        if (needsPermission()) { requestPermissionForAlias("bluetooth", call, "permissionCallback"); return; }
        doListPaired(call);
    }

    @PluginMethod
    public void connect(PluginCall call) {
        if (needsPermission()) { requestPermissionForAlias("bluetooth", call, "permissionCallback"); return; }
        doConnect(call);
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        if (getPermissionState("bluetooth") != PermissionState.GRANTED) {
            call.reject("Nearby devices permission was denied. Allow it in Android Settings → Apps → KITT OBD → Permissions.");
            return;
        }
        if ("connect".equals(call.getMethodName())) doConnect(call); else doListPaired(call);
    }

    @SuppressLint("MissingPermission")
    private void doListPaired(PluginCall call) {
        BluetoothAdapter a = adapter();
        if (a == null) { call.reject("This phone has no Bluetooth adapter"); return; }
        if (!a.isEnabled()) { call.reject("Bluetooth is off. Turn it on and try again."); return; }
        JSArray list = new JSArray();
        for (BluetoothDevice d : a.getBondedDevices()) {
            boolean spp = false;
            ParcelUuid[] uuids = d.getUuids();
            if (uuids != null) for (ParcelUuid u : uuids) if (SPP_UUID.equals(u.getUuid())) spp = true;
            JSObject o = new JSObject();
            o.put("name", d.getName() == null ? "(unnamed)" : d.getName());
            o.put("address", d.getAddress());
            o.put("serial", spp);
            list.put(o);
        }
        JSObject res = new JSObject();
        res.put("devices", list);
        call.resolve(res);
    }

    @SuppressLint("MissingPermission")
    private void doConnect(PluginCall call) {
        String address = call.getString("address");
        if (address == null) { call.reject("address is required"); return; }
        BluetoothAdapter a = adapter();
        if (a == null || !a.isEnabled()) { call.reject("Bluetooth is off"); return; }
        io.execute(() -> {
            closeQuietly();
            BluetoothDevice dev = a.getRemoteDevice(address);
            try { a.cancelDiscovery(); } catch (SecurityException ignored) { }
            BluetoothSocket s = null;
            IOException last = null;
            // Cheap ELM327 clones differ in which socket type works; try the common three.
            for (int attempt = 0; attempt < 3 && s == null; attempt++) {
                BluetoothSocket t = null;
                try {
                    if (attempt == 0) t = dev.createRfcommSocketToServiceRecord(SPP_UUID);
                    else if (attempt == 1) t = dev.createInsecureRfcommSocketToServiceRecord(SPP_UUID);
                    else {
                        Method m = dev.getClass().getMethod("createRfcommSocket", int.class);
                        t = (BluetoothSocket) m.invoke(dev, 1);
                    }
                    t.connect();
                    s = t;
                } catch (IOException e) {
                    last = e;
                    try { if (t != null) t.close(); } catch (IOException ignored) { }
                } catch (Exception e) {
                    last = new IOException(e.getMessage());
                }
            }
            if (s == null) {
                call.reject("Could not open a Bluetooth link to the adapter: "
                    + (last == null ? "unknown error" : last.getMessage())
                    + ". Is it plugged in, and is Torque closed?");
                return;
            }
            try {
                socket = s;
                out = s.getOutputStream();
                startReader(s.getInputStream());
                call.resolve();
            } catch (IOException e) {
                closeQuietly();
                call.reject("Link opened but streams failed: " + e.getMessage());
            }
        });
    }

    private void startReader(InputStream in) {
        reader = new Thread(() -> {
            byte[] buf = new byte[1024];
            try {
                int n;
                while ((n = in.read(buf)) != -1) {
                    JSObject ev = new JSObject();
                    ev.put("data", new String(buf, 0, n, StandardCharsets.ISO_8859_1));
                    notifyListeners("data", ev);
                }
            } catch (IOException ignored) {
                // socket closed or link lost
            }
            JSObject ev = new JSObject();
            ev.put("reason", "link closed");
            notifyListeners("disconnected", ev);
        }, "obd-reader");
        reader.setDaemon(true);
        reader.start();
    }

    @PluginMethod
    public void write(PluginCall call) {
        String cmd = ReadOnlyGuard.validate(call.getString("data"));
        if (cmd == null) {
            call.reject("Blocked: command is not on the read-only allowlist");
            return;
        }
        io.execute(() -> {
            OutputStream o = out;
            if (o == null) { call.reject("Not connected"); return; }
            try {
                o.write((cmd + "\r").getBytes(StandardCharsets.US_ASCII));
                o.flush();
                call.resolve();
            } catch (IOException e) {
                closeQuietly();
                call.reject("Adapter link lost: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        io.execute(() -> { closeQuietly(); call.resolve(); });
    }

    private void closeQuietly() {
        try { if (socket != null) socket.close(); } catch (IOException ignored) { }
        socket = null;
        out = null;
    }

    @Override
    protected void handleOnDestroy() {
        closeQuietly();
        io.shutdownNow();
    }
}
