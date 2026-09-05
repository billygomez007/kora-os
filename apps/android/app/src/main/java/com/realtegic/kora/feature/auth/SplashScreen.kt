package com.realtegic.kora.feature.auth

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
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
import androidx.compose.ui.unit.dp
import com.realtegic.kora.R
import com.realtegic.kora.core.designsystem.KoraSecondaryButton
import com.realtegic.kora.core.session.SessionState

@Composable
fun SplashScreen(viewModel: SplashViewModel) {
    val sessionState by viewModel.sessionState.collectAsState()

    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Image(painter = painterResource(R.drawable.kora_logo), contentDescription = "Kora OS", modifier = Modifier.size(72.dp))
        when (val state = sessionState) {
            is SessionState.RestorationFailed -> {
                Text(
                    text = "Welcome back, ${state.cachedDisplayName}. We couldn't reach Kora right now.",
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(top = 16.dp, bottom = 16.dp),
                )
                KoraSecondaryButton(text = "Try again", onClick = viewModel::retry)
            }
            else -> {
                CircularProgressIndicator(modifier = Modifier.padding(top = 24.dp), color = MaterialTheme.colorScheme.primary)
            }
        }
    }
}
