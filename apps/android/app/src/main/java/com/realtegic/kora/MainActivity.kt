package com.realtegic.kora

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.realtegic.kora.core.navigation.KoraNavHost
import com.realtegic.kora.ui.theme.KoraTheme

/**
 * A single Activity hosting the whole app -- customer, workspace, and
 * business screens are all Navigation Compose destinations within one
 * [KoraNavHost], never separate Activities (docs task Phase 10).
 */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val container = (application as KoraApplication).container
        setContent {
            KoraTheme {
                KoraNavHost(container)
            }
        }
    }
}
