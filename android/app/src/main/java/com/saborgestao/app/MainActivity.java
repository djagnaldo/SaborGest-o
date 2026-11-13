package com.saborgestao.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.saborgestao.app.server.SaborLocalServerPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SaborLocalServerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
