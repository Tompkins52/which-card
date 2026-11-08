package com.tompkinssoftwaresystems.witchcard;

import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // After super.onCreate, once Capacitor has switched from the launch theme to the no-action-bar theme.
        // The app draws under the system bars; the web app pads its header and tab bar with the safe-area insets.
        EdgeToEdge.enable(this);
    }
}
