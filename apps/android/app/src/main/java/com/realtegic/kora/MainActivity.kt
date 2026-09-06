package com.realtegic.kora

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.realtegic.kora.core.navigation.KoraNavHost
import com.realtegic.kora.core.session.SessionState
import com.realtegic.kora.ui.theme.KoraTheme

private const val INVITATION_DEEP_LINK_SCHEME = "kora"
private const val INVITATION_DEEP_LINK_HOST = "invite"

/**
 * A single Activity hosting the whole app -- customer, workspace, and
 * business screens are all Navigation Compose destinations within one
 * [KoraNavHost], never separate Activities (docs task Phase 10).
 *
 * `android:launchMode="singleTop"` plus [onNewIntent] means a
 * staff-invitation deep link tapped while the app is already running
 * updates the same [com.realtegic.kora.core.di.AppContainer.pendingInvitationToken]
 * rather than spawning a second Activity instance (docs task
 * "Invitation Deep Link and Acceptance"). The token itself is never
 * logged here or anywhere else -- only extracted and handed to the
 * in-memory holder.
 */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        val splashScreen = installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val container = (application as KoraApplication).container
        // Keeps the platform splash on screen only until session
        // restoration has actually resolved (docs task: "Never add an
        // artificial delay merely to display the splash design") --
        // reads the same singleton SessionManager StateFlow the Compose
        // splash screen observes, so both layers agree on when the app
        // is genuinely still starting up.
        splashScreen.setKeepOnScreenCondition { container.authRepository.sessionState.value is SessionState.Unknown }
        extractInvitationToken(intent)?.let { container.pendingInvitationToken.value = it }
        setContent {
            KoraTheme {
                KoraNavHost(container)
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        extractInvitationToken(intent)?.let { (application as KoraApplication).container.pendingInvitationToken.value = it }
    }

    private fun extractInvitationToken(intent: Intent?): String? {
        val uri: Uri = intent?.data ?: return null
        if (uri.scheme != INVITATION_DEEP_LINK_SCHEME || uri.host != INVITATION_DEEP_LINK_HOST) return null
        return uri.lastPathSegment?.takeIf { it.isNotBlank() }
    }
}
