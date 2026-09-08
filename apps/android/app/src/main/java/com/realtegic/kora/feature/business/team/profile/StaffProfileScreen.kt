package com.realtegic.kora.feature.business.team.profile

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.realtegic.kora.core.designsystem.EmptyStateView
import com.realtegic.kora.core.designsystem.ErrorStateView
import com.realtegic.kora.core.designsystem.KoraPrimaryButton
import com.realtegic.kora.core.designsystem.KoraTopBar
import com.realtegic.kora.core.designsystem.LoadingStateView
import com.realtegic.kora.core.designsystem.ScreenState

private val staffDayNames = listOf(
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
)

@Composable
fun StaffProfileScreen(
    viewModel: StaffProfileViewModel,
    onBack: () -> Unit,
) {
    val state by viewModel.state.collectAsState()
    val staff = state.staff

    Scaffold(
        topBar = {
            KoraTopBar(
                title = staff.displayName,
                onBack = onBack,
            )
        },
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.surface,
                    ),
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Text(
                            text = staff.displayName,
                            style = MaterialTheme.typography.titleLarge,
                        )

                        if (staff.roleNames.isNotEmpty()) {
                            Text(
                                text = staff.roleNames.joinToString(", "),
                                style = MaterialTheme.typography.bodyMedium,
                            )
                        }

                        if (staff.branches.isNotEmpty()) {
                            Text(
                                text = "Branch: ${
                                    staff.branches.joinToString(", ") { it.name }
                                }",
                                style = MaterialTheme.typography.bodyMedium,
                            )
                        }

                        if (staff.services.isNotEmpty()) {
                            Text(
                                text = "Services: ${
                                    staff.services.joinToString(", ") { it.name }
                                }",
                                style = MaterialTheme.typography.bodyMedium,
                            )
                        } else {
                            Text(
                                text = "No services assigned",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.error,
                            )
                        }
                    }
                }
            }

            item {
                Text(
                    text = "Working hours",
                    style = MaterialTheme.typography.titleMedium,
                )
            }

            when (val availability = state.availability) {
                ScreenState.Initial,
                ScreenState.Loading -> {
                    item {
                        LoadingStateView()
                    }
                }

                ScreenState.Empty -> {
                    item {
                        EmptyStateView(
                            title = "No working hours set",
                        )
                    }

                    item {
                        Text(
                            text = "Set working hours before this professional can receive customer appointment slots.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }

                is ScreenState.Error -> {
                    item {
                        ErrorStateView(
                            error = availability.error,
                            onRetry = viewModel::loadAvailability,
                        )
                    }
                }

                is ScreenState.Content -> {
                    items(
                        availability.data.sortedWith(
                            compareBy(
                                { it.dayOfWeek },
                                { it.startLocalTime },
                            ),
                        ),
                    ) { interval ->
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Column(
                                modifier = Modifier.padding(14.dp),
                            ) {
                                Text(
                                    text = staffDayNames.getOrElse(
                                        interval.dayOfWeek,
                                    ) {
                                        "Day ${interval.dayOfWeek}"
                                    },
                                    style = MaterialTheme.typography.titleSmall,
                                )

                                Text(
                                    text = "${interval.startLocalTime} - ${interval.endLocalTime}",
                                    style = MaterialTheme.typography.bodyMedium,
                                )
                            }
                        }
                    }
                }

                ScreenState.AuthenticationExpired -> Unit
            }

            item {
                KoraPrimaryButton(
                    text = "Use branch hours",
                    onClick = viewModel::copyBranchHoursToStaff,
                    isLoading = state.isSaving,
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            state.saveError?.let { error ->
                item {
                    Text(
                        text = error.message,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
        }
    }
}
