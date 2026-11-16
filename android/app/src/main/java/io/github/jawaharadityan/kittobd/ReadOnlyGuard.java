package io.github.jawaharadityan.kittobd;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Read-only allowlist, mirroring validateCommand() in js/elm327.js.
 * Allowed: Mode 01 single-PID requests, Mode 03, Mode 07, and adapter-configuration AT commands.
 * Everything else (04 = clear codes, UDS writes/routines, header changes, ...) is refused.
 */
public final class ReadOnlyGuard {
    private static final Pattern OBD_ALLOWED = Pattern.compile("^(01[0-9A-F]{2}|03|07)$");
    private static final Set<String> AT_ALLOWED = new HashSet<>(Arrays.asList(
        "ATZ", "ATWS", "ATE0", "ATL0", "ATS0", "ATH0", "ATSP0", "ATDPN", "ATDP", "ATRV", "ATI", "AT@1",
        "ATAT1", "ATAT2"));
    private static final Pattern CONTROL = Pattern.compile("[\\r\\n\\t\\x00]");

    private ReadOnlyGuard() { }

    /** Returns the normalised command if allowed, otherwise null. One trailing CR is tolerated. */
    public static String validate(String raw) {
        if (raw == null) return null;
        String cmd = raw.endsWith("\r") ? raw.substring(0, raw.length() - 1) : raw;
        cmd = cmd.replace(" ", "").toUpperCase(Locale.ROOT);
        if (cmd.isEmpty() || CONTROL.matcher(cmd).find()) return null;
        if (AT_ALLOWED.contains(cmd) || OBD_ALLOWED.matcher(cmd).matches()) return cmd;
        return null;
    }
}
