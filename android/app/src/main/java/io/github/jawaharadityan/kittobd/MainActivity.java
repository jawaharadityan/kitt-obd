package io.github.jawaharadityan.kittobd;

import android.os.Bundle;
import android.view.WindowManager;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ObdBluetoothPlugin.class);
        super.onCreate(savedInstanceState);
        // Dash-mounted use: keep the display on while the app is in front.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }
}
