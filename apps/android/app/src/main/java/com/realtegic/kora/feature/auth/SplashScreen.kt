package com.realtegic.kora.feature.auth

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.realtegic.kora.R
import com.realtegic.kora.core.designsystem.KoraAuthBackground
import com.realtegic.kora.core.designsystem.KoraSecondaryButton
import com.realtegic.kora.core.session.SessionState

/**
 * Matches `docs/design/mobile-auth/kora-auth-splash-reference.png`. Only
 * ever shown once the platform's own native SplashScreen (`MainActivity`,
 * `Theme.Kora.Starting`) has already dismissed -- this Compose screen is
 * the "resolution is taking long enough to need UI" fallback for
 * [SessionState.Unknown]/[SessionState.RestorationFailed], never a
 * substitute for the system splash and never shown for an artificial
 * minimum duration (docs task: "Never add an artificial delay merely to
 * display the splash design").
 */
@Composable
fun SplashScreen(viewModel: SplashViewModel) {
    val sessionState by viewModel.sessionState.collectAsState()

    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        KoraAuthBackground()

        Column(
            modifier = Modifier.fillMaxSize().padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Image(painter = painterResource(R.drawable.kora_logo), contentDescription = null, modifier = Modifier.size(120.dp))
            Spacer(modifier = Modifier.height(24.dp))
            Row {
                Text(
                    "KORA",
                    style = MaterialTheme.typography.headlineLarge,
                    fontWeight = FontWeight.ExtraBold,
                    color = MaterialTheme.colorScheme.onBackground,
                )
                Text(
                    " OS",
                    style = MaterialTheme.typography.headlineLarge,
                    fontWeight = FontWeight.ExtraBold,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
            Spacer(modifier = Modifier.height(8.dp))
            Row {
                Text(
                    "Your business. ",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onBackground,
                )
                Text(
                    "One smart system.",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.primary,
                )
            }

            when (val state = sessionState) {
                is SessionState.RestorationFailed -> {
                    Text(
                        text = "Welcome back, ${state.cachedDisplayName}. We couldn't reach Kora right now.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(top = 40.dp, bottom = 16.dp),
                    )
                    KoraSecondaryButton(text = "Try again", onClick = viewModel::retry)
                }
                else -> {
                    CircularProgressIndicator(modifier = Modifier.padding(top = 40.dp), color = MaterialTheme.colorScheme.primary)
                }
            }
        }
    }
}
