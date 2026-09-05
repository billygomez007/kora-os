package com.realtegic.kora.feature.invitation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MailOutline
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.realtegic.kora.core.designsystem.ErrorStateView
import com.realtegic.kora.core.designsystem.KoraPrimaryButton
import com.realtegic.kora.core.designsystem.KoraSecondaryButton
import com.realtegic.kora.core.designsystem.KoraTopBar
import com.realtegic.kora.core.designsystem.LoadingStateView
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.InvitationPreviewDto
import com.realtegic.kora.core.model.StaffInvitationStatus
import com.realtegic.kora.core.network.DomainError
import com.realtegic.kora.core.session.SessionState

@Composable
fun InvitationScreen(
    viewModel: InvitationViewModel,
    onSignInRequested: () -> Unit,
    onAccepted: (organizationId: String) -> Unit,
    onDone: () -> Unit,
) {
    val state by viewModel.state.collectAsState()
    val sessionState by viewModel.sessionState.collectAsState()
    val isSignedIn = sessionState is SessionState.SignedIn

    Scaffold(topBar = { KoraTopBar(title = "Team invitation") }) { padding ->
        when (val preview = state.preview) {
            ScreenState.Initial, ScreenState.Loading -> LoadingStateView(modifier = Modifier.padding(padding))
            is ScreenState.Error -> ErrorStateView(error = preview.error, onRetry = viewModel::loadPreview, modifier = Modifier.padding(padding))
            is ScreenState.Content -> InvitationContent(
                preview = preview.data,
                isSignedIn = isSignedIn,
                isProcessing = state.isProcessing,
                actionError = state.actionError,
                outcome = state.outcome,
                onSignInRequested = onSignInRequested,
                onAccept = { viewModel.accept(onAccepted) },
                onReject = { viewModel.reject(onDone) },
                onDone = onDone,
                modifier = Modifier.padding(padding),
            )
            ScreenState.Empty, ScreenState.AuthenticationExpired -> Unit
        }
    }
}

@Composable
private fun InvitationContent(
    preview: InvitationPreviewDto,
    isSignedIn: Boolean,
    isProcessing: Boolean,
    actionError: DomainError?,
    outcome: InvitationOutcome?,
    onSignInRequested: () -> Unit,
    onAccept: () -> Unit,
    onReject: () -> Unit,
    onDone: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.fillMaxSize().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(Icons.Default.MailOutline, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(bottom = 16.dp))

        when {
            outcome == InvitationOutcome.ACCEPTED -> {
                Text("Invitation accepted", style = MaterialTheme.typography.titleLarge)
                Text(
                    "You're now part of ${preview.organizationName}.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 8.dp, bottom = 24.dp),
                )
                KoraPrimaryButton(text = "Continue", onClick = onDone, modifier = Modifier.fillMaxWidth())
            }
            outcome == InvitationOutcome.REJECTED -> {
                Text("Invitation declined", style = MaterialTheme.typography.titleLarge)
                KoraPrimaryButton(text = "Done", onClick = onDone, modifier = Modifier.fillMaxWidth().padding(top = 16.dp))
            }
            preview.status == StaffInvitationStatus.REVOKED -> {
                StatusMessage("This invitation has been revoked by the business.")
                KoraSecondaryButton(text = "Done", onClick = onDone, modifier = Modifier.fillMaxWidth().padding(top = 16.dp))
            }
            preview.status == StaffInvitationStatus.ACCEPTED -> {
                StatusMessage("This invitation has already been accepted.")
                KoraSecondaryButton(text = "Done", onClick = onDone, modifier = Modifier.fillMaxWidth().padding(top = 16.dp))
            }
            preview.status == StaffInvitationStatus.DECLINED -> {
                StatusMessage("This invitation was already declined.")
                KoraSecondaryButton(text = "Done", onClick = onDone, modifier = Modifier.fillMaxWidth().padding(top = 16.dp))
            }
            preview.isExpired || preview.status == StaffInvitationStatus.EXPIRED -> {
                StatusMessage("This invitation has expired. Ask the business to send a new one.")
                KoraSecondaryButton(text = "Done", onClick = onDone, modifier = Modifier.fillMaxWidth().padding(top = 16.dp))
            }
            else -> {
                Text("Join ${preview.organizationName}", style = MaterialTheme.typography.titleLarge)
                Text(
                    "You've been invited as ${preview.roleName}" + (preview.branchName?.let { " at $it" } ?: "") + ".",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 8.dp, bottom = 24.dp),
                )
                if (actionError != null) {
                    val message = if (actionError is DomainError.Forbidden) {
                        "This invitation was sent to a different email address. Sign in with the invited email to accept it."
                    } else {
                        actionError.message
                    }
                    Text(message, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(bottom = 16.dp))
                }
                if (isSignedIn) {
                    KoraPrimaryButton(text = "Accept", onClick = onAccept, isLoading = isProcessing, modifier = Modifier.fillMaxWidth())
                    KoraSecondaryButton(text = "Decline", onClick = onReject, enabled = !isProcessing, modifier = Modifier.fillMaxWidth().padding(top = 8.dp))
                } else {
                    Text(
                        "Verify your email to continue.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(bottom = 8.dp),
                    )
                    KoraPrimaryButton(text = "Sign in to accept", onClick = onSignInRequested, modifier = Modifier.fillMaxWidth())
                }
            }
        }
    }
}

@Composable
private fun StatusMessage(text: String) {
    Text(text, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
}
