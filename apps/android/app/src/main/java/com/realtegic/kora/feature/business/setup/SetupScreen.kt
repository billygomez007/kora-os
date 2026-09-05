package com.realtegic.kora.feature.business.setup

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.realtegic.kora.core.designsystem.ErrorStateView
import com.realtegic.kora.core.designsystem.KoraTopBar
import com.realtegic.kora.core.designsystem.LoadingStateView
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.OrganizationSetupStatusDto
import com.realtegic.kora.ui.theme.StatusGreen

@Composable
fun SetupScreen(
    viewModel: SetupViewModel,
    onBack: () -> Unit,
    onBusinessProfile: () -> Unit,
    onServices: () -> Unit,
    onHours: () -> Unit,
    onTeam: () -> Unit,
) {
    val state by viewModel.state.collectAsState()

    Scaffold(topBar = { KoraTopBar(title = "Business setup", onBack = onBack) }) { padding ->
        when (val status = state) {
            ScreenState.Initial, ScreenState.Loading -> LoadingStateView(modifier = Modifier.padding(padding))
            is ScreenState.Error -> ErrorStateView(error = status.error, onRetry = viewModel::load, modifier = Modifier.padding(padding))
            is ScreenState.Content -> Column(modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                ChecklistItem("Business profile", status.data.businessProfileConfigured, onBusinessProfile)
                ChecklistItem("At least one service", status.data.serviceCreated, onServices)
                ChecklistItem("Business hours", status.data.branchHoursConfigured, onHours)
                ChecklistItem("Invite your team (optional)", status.data.staffInvitationSent, onTeam)
                if (!status.data.profilePublicationEligible) {
                    Text(
                        "Mark a branch as discoverable and save your business profile before you can publish it to customers.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 16.dp),
                    )
                }
            }
            ScreenState.Empty, ScreenState.AuthenticationExpired -> Unit
        }
    }
}

@Composable
private fun ChecklistItem(label: String, isDone: Boolean, onClick: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 12.dp),
    ) {
        Icon(
            if (isDone) Icons.Default.CheckCircle else Icons.Default.RadioButtonUnchecked,
            contentDescription = null,
            tint = if (isDone) StatusGreen else MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(end = 12.dp),
        )
        Text(label, style = MaterialTheme.typography.bodyLarge)
    }
}

/** A compact version for the dashboard's own setup-progress card. */
fun setupCompletionFraction(status: OrganizationSetupStatusDto): Float {
    val steps = listOf(status.businessProfileConfigured, status.serviceCreated, status.branchHoursConfigured)
    return steps.count { it }.toFloat() / steps.size
}
