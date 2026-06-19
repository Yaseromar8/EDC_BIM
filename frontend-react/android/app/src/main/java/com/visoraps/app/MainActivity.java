package com.visoraps.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Registrar el plugin nativo de ARCore antes de inicializar el bridge
        registerPlugin(ARCorePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
