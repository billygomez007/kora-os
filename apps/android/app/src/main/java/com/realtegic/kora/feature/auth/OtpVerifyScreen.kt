package com.realtegic.kora.feature.auth

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.displayCutoutPadding
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.realtegic.kora.R
import com.realtegic.kora.core.designsystem.KoraOtpCells
import com.realtegic.kora.core.designsystem.KoraPrimaryButton
import com.realtegic.kora.core.designsystem.KoraTextButton

object AuthScreenTestTags {
    const val OTP_FIELD = "otp_verify_code_field"
}

private const val OTP_CODE_LENGTH = 6

/**
 * Matches `docs/design/mobile-auth/kora-auth-otp-reference.png` (docs
 * task Stage 7 OTP screen). The reference is guidance for a native
 * recreation, never an embedded full-screen image -- every visual here
 * is a real Compose element (theme-token colors, vector icons, gradient
 * brushes) so it participates correctly in dark/light theming, font
 * scaling, and TalkBack the same way every other Kora screen does.
 */
@Composable
fun OtpVerifyScreen(
    viewModel: AuthViewModel,
    onBack: () -> Unit,
    onSignedIn: () -> Unit,
    onUseDifferentEmail: () -> Unit,
) {
    val state by viewModel.state.collectAsState()
    val focusRequester = remember { FocusRequester() }
    val keyboardController = LocalSoftwareKeyboardController.current

    LaunchedEffect(state.signedIn) {
        if (state.signedIn) onSignedIn()
    }

    // Automatic focus (docs task: "Automatic focus when the screen
    // opens") -- requesting focus alone does not reliably raise the
    // keyboard on every OEM, so the controller is nudged explicitly too.
    LaunchedEffect(Unit) {
        focusRequester.requestFocus()
        keyboardController?.show()
    }

    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        OtpBackgroundDecoration()

        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .navigationBarsPadding()
                .displayCutoutPadding()
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Box(modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
                IconButton(onClick = onBack, modifier = Modifier.align(Alignment.CenterStart)) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = MaterialTheme.colorScheme.onBackground)
                }
                Row(modifier = Modifier.align(Alignment.Center), verticalAlignment = Alignment.CenterVertically) {
                    Image(
                        painter = painterResource(R.drawable.kora_logo),
                        contentDescription = null,
                        modifier = Modifier.size(36.dp),
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Kora", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onBackground)
                    Text(" OS", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                }
            }

            Spacer(modifier = Modifier.height(32.dp))
            EmailShieldIllustration()
            Spacer(modifier = Modifier.height(24.dp))

            Text(
                text = "Check your email",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onBackground,
                textAlign = TextAlign.Center,
            )
            Spacer(modifier = Modifier.height(12.dp))
            Text(
                text = "Enter the 6-digit code sent to",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
            Text(
                text = state.email,
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onBackground,
                textAlign = TextAlign.Center,
            )

            Spacer(modifier = Modifier.height(28.dp))

            KoraOtpCells(
                value = state.otpCode,
                onValueChange = viewModel::onCodeChanged,
                length = OTP_CODE_LENGTH,
                isError = state.error != null,
                enabled = !state.isSubmitting,
                focusRequester = focusRequester,
                modifier = Modifier.testTag(AuthScreenTestTags.OTP_FIELD),
            )

            state.error?.let { error ->
                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    text = error.message,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                    textAlign = TextAlign.Center,
                )
            }

            Spacer(modifier = Modifier.height(24.dp))

            KoraPrimaryButton(
                text = "Verify and continue",
                onClick = viewModel::submitCode,
                isLoading = state.isSubmitting,
                enabled = state.otpCode.length == OTP_CODE_LENGTH,
                modifier = Modifier.fillMaxWidth(),
            )

            Spacer(modifier = Modifier.height(20.dp))

            if (state.resendAvailableInSeconds > 0) {
                Text(
                    text = "Resend code in ${formatCountdown(state.resendAvailableInSeconds)}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                KoraTextButton(text = "Resend code", onClick = viewModel::resendCode, enabled = !state.isSubmitting)
            }

            KoraTextButton(text = "Use a different email", onClick = onUseDifferentEmail)

            Spacer(modifier = Modifier.height(24.dp))

            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Default.Lock,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(16.dp),
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = "No password needed.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            Spacer(modifier = Modifier.height(24.dp))
        }
    }
}

@Composable
private fun EmailShieldIllustration() {
    Box(modifier = Modifier.size(96.dp), contentAlignment = Alignment.Center) {
        Icon(
            imageVector = Icons.Default.Email,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(84.dp),
        )
        Box(
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .size(38.dp)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.background),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Default.VerifiedUser,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(26.dp),
            )
        }
    }
}

/** Purely decorative -- a soft gold dot grid in the top-left corner and
 * two large gold glow circles bleeding off the top-right and bottom-left
 * corners, recreated with theme-token gradients (never the reference PNG
 * itself, docs task: "must not be displayed as a full-screen background
 * image"). None of it carries semantics, so TalkBack skips straight past
 * it to the real content. */
@Composable
private fun BoxScope.OtpBackgroundDecoration() {
    val gold = MaterialTheme.colorScheme.primary
    Box(
        modifier = Modifier
            .size(260.dp)
            .align(Alignment.TopEnd)
            .offset(x = 90.dp, y = (-90).dp)
            .clip(CircleShape)
            .background(Brush.radialGradient(colors = listOf(gold.copy(alpha = 0.28f), Color.Transparent))),
    )
    Box(
        modifier = Modifier
            .size(260.dp)
            .align(Alignment.BottomStart)
            .offset(x = (-90).dp, y = 90.dp)
            .clip(CircleShape)
            .background(Brush.radialGradient(colors = listOf(gold.copy(alpha = 0.28f), Color.Transparent))),
    )
    Canvas(
        modifier = Modifier
            .size(96.dp)
            .align(Alignment.TopStart)
            .statusBarsPadding()
            .padding(top = 16.dp, start = 16.dp),
    ) {
        val spacing = 14.dp.toPx()
        val radius = 2.dp.toPx()
        for (row in 0 until 5) {
            for (column in 0 until 5) {
                if (column > row) continue
                drawCircle(
                    color = gold.copy(alpha = 0.35f),
                    radius = radius,
                    center = Offset(x = column * spacing, y = row * spacing),
                )
            }
        }
    }
}

private fun formatCountdown(totalSeconds: Int): String {
    val minutes = totalSeconds / 60
    val seconds = totalSeconds % 60
    return "%02d:%02d".format(minutes, seconds)
}
