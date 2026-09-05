package com.realtegic.kora.feature.business.branchservices

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.realtegic.kora.core.designsystem.EmptyStateView
import com.realtegic.kora.core.designsystem.ErrorStateView
import com.realtegic.kora.core.designsystem.KoraPrimaryButton
import com.realtegic.kora.core.designsystem.KoraTextField
import com.realtegic.kora.core.designsystem.KoraTopBar
import com.realtegic.kora.core.designsystem.LoadingStateView
import com.realtegic.kora.core.designsystem.MoneyFormatter
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.BranchServiceDto
import com.realtegic.kora.core.model.StaffDirectoryEntryDto

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BranchServicesScreen(viewModel: BranchServicesViewModel, defaultCurrency: String, onBack: () -> Unit) {
    val state by viewModel.state.collectAsState()

    Scaffold(topBar = { KoraTopBar(title = "Branch services", onBack = onBack) }) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            if (state.isReadOnly) {
                Text(
                    "This workspace is read-only. You can view branch services but not change them.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.padding(16.dp),
                )
            }
            when (val branchServices = state.branchServices) {
                ScreenState.Initial, ScreenState.Loading -> LoadingStateView(modifier = Modifier.fillMaxSize())
                is ScreenState.Error -> ErrorStateView(error = branchServices.error, onRetry = viewModel::load, modifier = Modifier.fillMaxSize())
                ScreenState.Empty -> EmptyStateView(title = "No services in the catalogue yet", modifier = Modifier.fillMaxSize())
                is ScreenState.Content -> LazyColumn(modifier = Modifier.fillMaxSize()) {
                    items(branchServices.data, key = BranchServiceDto::serviceId) { branchService ->
                        BranchServiceRow(
                            branchService = branchService,
                            currency = defaultCurrency,
                            onEdit = { viewModel.startEditing(branchService) },
                            onManageStaff = { viewModel.openStaffSheet(branchService.serviceId) },
                        )
                    }
                }
                ScreenState.AuthenticationExpired -> Unit
            }
        }
    }

    if (state.editingServiceId != null) {
        EditBranchServiceDialog(state = state, currency = defaultCurrency, viewModel = viewModel)
    }

    if (state.staffSheetServiceId != null) {
        StaffAssignmentSheet(state = state, viewModel = viewModel)
    }
}

@Composable
private fun BranchServiceRow(branchService: BranchServiceDto, currency: String, onEdit: () -> Unit, onManageStaff: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Column {
                    Text(branchService.service.name, style = MaterialTheme.typography.titleMedium)
                    val effectivePrice = branchService.priceOverrideMinor ?: branchService.service.priceMinor
                    val effectiveDuration = branchService.durationOverrideMinutes ?: branchService.service.durationMinutes
                    Text(
                        "${MoneyFormatter.format(effectivePrice, currency)} · $effectiveDuration min" +
                            if (branchService.priceOverrideMinor != null || branchService.durationOverrideMinutes != null) " (override)" else " (default)",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        if (branchService.isEnabled) "Enabled at this branch" else "Disabled at this branch",
                        style = MaterialTheme.typography.bodySmall,
                        color = if (branchService.isEnabled) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,
                    )
                }
            }
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                TextButton(onClick = onManageStaff) { Text("Staff") }
                TextButton(onClick = onEdit) { Text("Edit") }
            }
        }
    }
}

@Composable
private fun EditBranchServiceDialog(state: BranchServicesUiState, currency: String, viewModel: BranchServicesViewModel) {
    AlertDialog(
        onDismissRequest = viewModel::dismissEditing,
        title = { Text("Branch override") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Switch(checked = state.editEnabled, onCheckedChange = { viewModel.onEditChanged(enabled = it) }, enabled = !state.isReadOnly)
                    Text("Enabled at this branch")
                }
                KoraTextField(
                    value = state.editPriceOverrideMajor,
                    onValueChange = { viewModel.onEditChanged(priceOverrideMajor = it) },
                    label = "Price override ($currency, blank for default)",
                    keyboardType = KeyboardType.Decimal,
                    enabled = !state.isReadOnly,
                )
                KoraTextField(
                    value = state.editDurationOverrideMinutes,
                    onValueChange = { viewModel.onEditChanged(durationOverrideMinutes = it) },
                    label = "Duration override (min, blank for default)",
                    keyboardType = KeyboardType.Number,
                    enabled = !state.isReadOnly,
                )
                state.saveError?.let { Text(it.message, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
            }
        },
        confirmButton = {
            KoraPrimaryButton(text = "Save", onClick = { viewModel.saveOverride(currency) }, isLoading = state.isSaving, enabled = !state.isReadOnly)
        },
        dismissButton = { TextButton(onClick = viewModel::dismissEditing) { Text("Cancel") } },
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun StaffAssignmentSheet(state: BranchServicesUiState, viewModel: BranchServicesViewModel) {
    ModalBottomSheet(onDismissRequest = viewModel::dismissStaffSheet) {
        Column(modifier = Modifier.fillMaxWidth().padding(16.dp)) {
            Text("Eligible staff", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(bottom = 12.dp))
            when (val staff = state.staff) {
                ScreenState.Initial, ScreenState.Loading -> LoadingStateView()
                is ScreenState.Error -> ErrorStateView(error = staff.error, onRetry = {})
                ScreenState.Empty -> EmptyStateView(title = "No staff members yet")
                is ScreenState.Content -> Column {
                    staff.data.forEach { entry -> StaffAssignmentRow(entry, state, viewModel) }
                }
                ScreenState.AuthenticationExpired -> Unit
            }
        }
    }
}

@Composable
private fun StaffAssignmentRow(entry: StaffDirectoryEntryDto, state: BranchServicesUiState, viewModel: BranchServicesViewModel) {
    val staffProfileId = entry.staffProfileId
    val isAssigned = staffProfileId != null && state.assignments.any { it.staffProfileId == staffProfileId }
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Checkbox(
            checked = isAssigned,
            onCheckedChange = { if (staffProfileId != null) viewModel.toggleStaffAssignment(staffProfileId, isAssigned) },
            enabled = staffProfileId != null && !state.isReadOnly,
        )
        Column {
            Text(entry.displayName)
            if (staffProfileId == null) {
                Text("Not eligible for service work", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}
