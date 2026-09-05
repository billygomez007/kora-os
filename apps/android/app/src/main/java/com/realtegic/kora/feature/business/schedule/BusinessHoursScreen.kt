package com.realtegic.kora.feature.business.schedule

import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.realtegic.kora.core.designsystem.ErrorStateView
import com.realtegic.kora.core.designsystem.KoraPrimaryButton
import com.realtegic.kora.core.designsystem.KoraTextField
import com.realtegic.kora.core.designsystem.KoraTopBar
import com.realtegic.kora.core.designsystem.LoadingStateView
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.ui.theme.StatusGreen

private val DAY_NAMES = listOf("Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday")

@Composable
fun BusinessHoursScreen(viewModel: BusinessHoursViewModel, onBack: () -> Unit) {
    val state by viewModel.state.collectAsState()

    Scaffold(topBar = { KoraTopBar(title = "Business hours", onBack = onBack) }) { padding ->
        when (val hours = state.hours) {
            ScreenState.Initial, ScreenState.Loading -> LoadingStateView(modifier = Modifier.padding(padding))
            is ScreenState.Error -> ErrorStateView(error = hours.error, onRetry = viewModel::load, modifier = Modifier.padding(padding))
            is ScreenState.Content -> Column(
                modifier = Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(
                    "Times are this branch's own local time.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                DAY_NAMES.forEachIndexed { day, name ->
                    val dayHours = hours.data[day] ?: DayHours()
                    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(checked = dayHours.isOpen, onCheckedChange = { viewModel.onDayChanged(day, dayHours.copy(isOpen = it)) })
                        Text(name, modifier = Modifier.weight(1f))
                        if (dayHours.isOpen) {
                            KoraTextField(
                                value = dayHours.startLocalTime,
                                onValueChange = { viewModel.onDayChanged(day, dayHours.copy(startLocalTime = it)) },
                                label = "Open",
                                modifier = Modifier.weight(1f),
                            )
                            KoraTextField(
                                value = dayHours.endLocalTime,
                                onValueChange = { viewModel.onDayChanged(day, dayHours.copy(endLocalTime = it)) },
                                label = "Close",
                                modifier = Modifier.weight(1f),
                            )
                        }
                    }
                }
                state.saveError?.let { Text(it.message, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                if (state.saved) {
                    Text("Saved.", color = StatusGreen, style = MaterialTheme.typography.bodySmall)
                }
                KoraPrimaryButton(text = "Save hours", onClick = viewModel::save, isLoading = state.isSaving, modifier = Modifier.fillMaxWidth())
            }
            ScreenState.Empty, ScreenState.AuthenticationExpired -> Unit
        }
    }
}
