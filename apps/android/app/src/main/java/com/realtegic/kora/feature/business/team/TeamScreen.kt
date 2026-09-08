package com.realtegic.kora.feature.business.team

import android.content.Intent
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.realtegic.kora.core.designsystem.EmptyStateView
import com.realtegic.kora.core.designsystem.ErrorStateView
import com.realtegic.kora.core.designsystem.KoraPrimaryButton
import com.realtegic.kora.core.designsystem.KoraTextField
import com.realtegic.kora.core.designsystem.KoraTopBar
import com.realtegic.kora.core.designsystem.LoadingStateView
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.StaffDirectoryEntryDto
import com.realtegic.kora.core.model.StaffInvitationListItemDto

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TeamScreen(
    viewModel: TeamViewModel,
    onBack: () -> Unit,
    onStaffSelected: (StaffDirectoryEntryDto) -> Unit,
) {
    val state by viewModel.state.collectAsState()

    // The FAB is positioned manually via this outer Box, rather than
    // through Scaffold's own `floatingActionButton` slot: this screen
    // is only ever embedded inside BusinessHomeScreen's own Scaffold
    // (see that file), and a FAB nested two Scaffolds deep was silently
    // failing to render or receive touches at all -- a real bug found
    // during manual verification, not just a style preference.
    Box(modifier = Modifier.fillMaxSize()) {
        Scaffold(
            topBar = { KoraTopBar(title = "Team", onBack = onBack) },
        ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            Text("Pending invitations", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(16.dp))
            when (val invitations = state.invitations) {
                ScreenState.Initial, ScreenState.Loading -> LoadingStateView(modifier = Modifier.padding(16.dp))
                is ScreenState.Error -> ErrorStateView(error = invitations.error, onRetry = viewModel::loadInvitations)
                ScreenState.Empty -> Text(
                    "No pending invitations.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 16.dp),
                )
                is ScreenState.Content -> Column {
                    invitations.data.forEach { invitation ->
                        InvitationRow(invitation, onRevoke = { viewModel.requestRevokeConfirmation(invitation.id) })
                    }
                }
                ScreenState.AuthenticationExpired -> Unit
            }

            Text("Team", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(16.dp))
            when (val staff = state.staff) {
                ScreenState.Initial, ScreenState.Loading -> LoadingStateView(modifier = Modifier.weight(1f))
                is ScreenState.Error -> ErrorStateView(error = staff.error, onRetry = viewModel::loadStaff, modifier = Modifier.weight(1f))
                ScreenState.Empty -> EmptyStateView(title = "No team members yet", modifier = Modifier.weight(1f))
                is ScreenState.Content -> LazyColumn(modifier = Modifier.weight(1f)) {
                    items(staff.data, key = StaffDirectoryEntryDto::membershipId) { entry ->
                        StaffRow(
                            entry = entry,
                            onClick = { onStaffSelected(entry) },
                        )
                    }
                }
                ScreenState.AuthenticationExpired -> Unit
            }
        }
        }

        FloatingActionButton(
            onClick = viewModel::showInviteForm,
            modifier = Modifier.align(Alignment.BottomEnd).padding(16.dp),
        ) {
            Icon(Icons.Default.Add, contentDescription = "Invite staff")
        }
    }

    if (state.showInviteForm) {
        InviteBottomSheet(state, viewModel)
    }

    if (state.pendingRevokeInvitationId != null) {
        AlertDialog(
            onDismissRequest = viewModel::dismissRevokeConfirmation,
            title = { Text("Revoke this invitation?") },
            text = { Text("The invited person will no longer be able to accept it.") },
            confirmButton = { TextButton(onClick = viewModel::confirmRevoke) { Text("Revoke", color = MaterialTheme.colorScheme.error) } },
            dismissButton = { TextButton(onClick = viewModel::dismissRevokeConfirmation) { Text("Cancel") } },
        )
    }

    state.pendingInvitationLink?.let { link ->
        InvitationLinkDialog(link = link, onDismiss = viewModel::dismissInvitationLink)
    }
}

/**
 * The invitation link is shown here exactly once (docs task "Staff and
 * Role Invitations") -- no automated delivery exists this stage, so
 * this dialog is the owner's only way to actually hand the invite to
 * staff. Dismissing it (Copy, Share, or the close button) clears the
 * raw token from memory; it is never written to ordinary storage.
 */
@Composable
private fun InvitationLinkDialog(link: String, onDismiss: () -> Unit) {
    val clipboardManager = LocalClipboardManager.current
    val context = LocalContext.current

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Invitation created") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    "Share this secure link with the staff member. It won't be shown again.",
                    style = MaterialTheme.typography.bodyMedium,
                )
                SelectionContainer {
                    Text(link, style = MaterialTheme.typography.bodySmall)
                }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                val sendIntent = Intent(Intent.ACTION_SEND).apply {
                    type = "text/plain"
                    putExtra(Intent.EXTRA_TEXT, link)
                }
                context.startActivity(Intent.createChooser(sendIntent, "Share invitation link").apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                })
                onDismiss()
            }) { Text("Share") }
        },
        dismissButton = {
            Row {
                TextButton(onClick = {
                    clipboardManager.setText(AnnotatedString(link))
                    onDismiss()
                }) { Text("Copy") }
                TextButton(onClick = onDismiss) { Text("Done") }
            }
        },
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun InviteBottomSheet(state: TeamUiState, viewModel: TeamViewModel) {
    ModalBottomSheet(onDismissRequest = viewModel::dismissInviteForm) {
        Column(modifier = Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Invite a staff member", style = MaterialTheme.typography.titleLarge)
            KoraTextField(value = state.inviteEmail, onValueChange = { viewModel.onInviteChanged(email = it) }, label = "Email", keyboardType = KeyboardType.Email)
            Text("Role", style = MaterialTheme.typography.labelLarge)
            state.assignableRoles.forEach { role ->
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                    RadioButton(selected = state.selectedRoleId == role.id, onClick = { viewModel.onInviteChanged(roleId = role.id) })
                    Text(role.name)
                }
            }
            state.inviteError?.let { Text(it.message, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
            KoraPrimaryButton(text = "Send invitation", onClick = viewModel::sendInvite, isLoading = state.isSendingInvite, modifier = Modifier.fillMaxWidth())
        }
    }
}

@Composable
private fun InvitationRow(invitation: StaffInvitationListItemDto, onRevoke: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Row(modifier = Modifier.fillMaxWidth().padding(12.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Column {
                Text(invitation.email ?: invitation.phone ?: "Invited", style = MaterialTheme.typography.bodyLarge)
                Text(invitation.roleName, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            TextButton(onClick = onRevoke) { Text("Revoke") }
        }
    }
}

@Composable
private fun StaffRow(
    entry: StaffDirectoryEntryDto,
    onClick: () -> Unit,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp)
            .clickable(onClick = onClick),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface,
        ),
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Text(entry.displayName, style = MaterialTheme.typography.titleMedium)
            Text(
                entry.roleNames.joinToString(", "),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.primary,
            )
            if (entry.branches.isNotEmpty()) {
                Text(
                    entry.branches.joinToString(", ") { it.name },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}
