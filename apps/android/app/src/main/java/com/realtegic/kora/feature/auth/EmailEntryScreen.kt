package com.realtegic.kora.feature.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.realtegic.kora.core.designsystem.KoraPrimaryButton
import com.realtegic.kora.core.designsystem.KoraTextField
import com.realtegic.kora.core.designsystem.KoraTopBar

@Composable
fun EmailEntryScreen(viewModel: AuthViewModel, onBack: () -> Unit) {
    val state by viewModel.state.collectAsState()

    Scaffold(topBar = { KoraTopBar(title = "Sign in", onBack = onBack) }) { padding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(padding).padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text(
                text = "Enter your email address. We'll send you a one-time code to sign in -- no password needed.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            KoraTextField(
                value = state.email,
                onValueChange = viewModel::onEmailChanged,
                label = "Email address",
                keyboardType = KeyboardType.Email,
                imeAction = ImeAction.Done,
                isError = state.error != null,
                supportingText = state.error?.message,
                enabled = !state.isSubmitting,
            )
            KoraPrimaryButton(
                text = "Send code",
                onClick = viewModel::submitEmail,
                isLoading = state.isSubmitting,
                enabled = state.email.isNotBlank(),
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}
