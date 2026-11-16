package io.github.jawaharadityan.kittobd;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

public class ReadOnlyGuardTest {
    @Test public void allowsReadOnly() {
        String[][] ok = { {"010C", "010C"}, {"01 0d", "010D"}, {"0100", "0100"}, {"03", "03"}, {"07", "07"},
            {"ATZ", "ATZ"}, {"atrv", "ATRV"}, {"ATSP0", "ATSP0"}, {"010C\r", "010C"} };
        for (String[] c : ok) assertEquals(c[0], c[1], ReadOnlyGuard.validate(c[0]));
    }

    @Test public void blocksEverythingElse() {
        String[] bad = { "04", "0 4", "14", "14FF00", "08", "2E F190 01", "3101", "1001", "1101", "27 01", "0902",
            "0A", "010C\r04", "010C\n04", "010C04", "01", "010", "ATSH7E0", "ATPP", "STSBR", "AT MA", "ATBRD", "",
            "ATZ;04", "0105\n", "\r", null };
        for (String c : bad) assertNull(String.valueOf(c), ReadOnlyGuard.validate(c));
    }
}
