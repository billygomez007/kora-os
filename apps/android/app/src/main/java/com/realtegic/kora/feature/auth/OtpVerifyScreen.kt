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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.unit.dp
import com.realtegic.kora.core.designsystem.KoraOtpTextField
import com.realtegic.kora.core.designsystem.KoraPrimaryButton
import com.realtegic.kora.core.designsystem.KoraTextButton
import com.realtegic.kora.core.designsystem.KoraTopBar

object AuthScreenTestTags {
    const val OTP_FIELD = "otp_verify_code_field"
}

@Composable
fun OtpVerifyScreen(viewModel: AuthViewModel, onBack: () -> Unit, onSignedIn: () -> Unit) {
    val state by viewModel.state.collectAsState()

    LaunchedEffect(state.signedIn) {
        if (state.signedIn) onSignedIn()
    }

    Scaffold(topBar = { KoraTopBar(title = "Enter your code", onBack = onBack) }) { padding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(padding).padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text(
                text = "We sent a code to ${state.email}. Enter it below to sign in.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            KoraOtpTextField(
                value = TextFieldValue(state.otpCode, selection = androidx.compose.ui.text.TextRange(state.otpCode.length)),
                onValueChange = { viewModel.onCodeChanged(it.text) },
                isError = state.error != null,
                enabled = !state.isSubmitting,
                modifier = Modifier.testTag(AuthScreenTestTags.OTP_FIELD),
            )
            if (state.error != null) {
                Text(
                    text = state.error?.message.orEmpty(),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }
            KoraPrimaryButton(
                text = "Verify and sign in",
                onClick = viewModel::submitCode,
                isLoading = state.isSubmitting,
                enabled = state.otpCode.length >= 4,
                modifier = Modifier.fillMaxWidth(),
            )
            val resendLabel = if (state.resendAvailableInSeconds > 0) {
                "Resend code in ${state.resendAvailableInSeconds}s"
            } else {
                "Resend code"
            }
            KoraTextButton(
                text = resendLabel,
                onClick = viewModel::resendCode,
                enabled = state.resendAvailableInSeconds == 0 && !state.isSubmitting,
            )
            KoraTextButton(text = "Use a different email", onClick = viewModel::changeEmail)
        }
    }
}
