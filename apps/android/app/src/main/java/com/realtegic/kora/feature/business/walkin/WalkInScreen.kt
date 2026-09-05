package com.realtegic.kora.feature.business.walkin

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.realtegic.kora.core.designsystem.KoraPrimaryButton
import com.realtegic.kora.core.designsystem.KoraTextField
import com.realtegic.kora.core.designsystem.KoraTopBar
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.BranchServiceDto

@Composable
fun WalkInScreen(
    viewModel: WalkInViewModel,
    onBack: () -> Unit,
    onCreated: (queueEntryId: String) -> Unit,
) {
    val state by viewModel.state.collectAsState()

    LaunchedEffect(state.createdEntry) {
        state.createdEntry?.let { onCreated(it.id) }
    }

    Scaffold(topBar = { KoraTopBar(title = "Add walk-in", onBack = onBack) }) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(16.dp)) {
            KoraTextField(value = state.customerName, onValueChange = viewModel::onNameChanged, label = "Customer name")
            KoraTextField(
                value = state.customerPhone,
                onValueChange = viewModel::onPhoneChanged,
                label = "Phone (optional)",
                keyboardType = KeyboardType.Phone,
                modifier = Modifier.padding(top = 12.dp),
            )
            Text("Services", style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(top = 20.dp, bottom = 4.dp))
            when (val branchServices = state.branchServices) {
                is ScreenState.Content -> branchServices.data.forEach { branchService -> ServiceRow(branchService, state.selectedServiceIds, viewModel::toggleService) }
                ScreenState.Empty -> Text("No enabled services at this branch yet.", style = MaterialTheme.typography.bodyMedium)
                else -> Unit
            }
            KoraTextField(
                value = state.notes,
                onValueChange = viewModel::onNotesChanged,
                label = "Note (optional)",
                modifier = Modifier.padding(top = 12.dp),
            )
            state.submitError?.let {
                Text(it.message, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 8.dp))
            }
            KoraPrimaryButton(
                text = "Add to queue",
                onClick = viewModel::submit,
                isLoading = state.isSubmitting,
                modifier = Modifier.fillMaxWidth().padding(top = 20.dp),
            )
        }
    }
}

@Composable
private fun ServiceRow(branchService: BranchServiceDto, selected: Set<String>, onToggle: (String) -> Unit) {
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Checkbox(checked = branchService.serviceId in selected, onCheckedChange = { onToggle(branchService.serviceId) })
        Text(branchService.service.name)
    }
}
