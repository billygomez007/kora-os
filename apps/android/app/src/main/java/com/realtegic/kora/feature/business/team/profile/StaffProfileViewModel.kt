package com.realtegic.kora.feature.business.team.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.realtegic.kora.core.data.SchedulingRepository
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.BusinessHoursIntervalDto
import com.realtegic.kora.core.model.StaffAvailabilityRuleIntervalDto
import com.realtegic.kora.core.model.StaffDirectoryEntryDto
import com.realtegic.kora.core.network.ApiResult
import com.realtegic.kora.core.network.DomainError
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class StaffProfileUiState(
    val staff: StaffDirectoryEntryDto,
    val branchId: String?,
    val availability: ScreenState<List<BusinessHoursIntervalDto>> = ScreenState.Initial,
    val saveError: DomainError? = null,
    val isSaving: Boolean = false,
)

class StaffProfileViewModel(
    private val organizationId: String,
    private val staff: StaffDirectoryEntryDto,
    private val schedulingRepository: SchedulingRepository,
) : ViewModel() {

    private val initialBranchId = staff.branches.firstOrNull()?.branchId

    private val _state = MutableStateFlow(
        StaffProfileUiState(
            staff = staff,
            branchId = initialBranchId,
        ),
    )
    val state: StateFlow<StaffProfileUiState> = _state.asStateFlow()

    init {
        loadAvailability()
    }

    fun loadAvailability() {
        val staffProfileId = staff.staffProfileId ?: return
        val branchId = _state.value.branchId ?: return

        viewModelScope.launch {
            _state.value = _state.value.copy(
                availability = ScreenState.Loading,
                saveError = null,
            )

            when (
                val result = schedulingRepository.getStaffAvailabilityRules(
                    organizationId,
                    branchId,
                    staffProfileId,
                )
            ) {
                is ApiResult.Success -> {
                    _state.value = _state.value.copy(
                        availability = if (result.value.isEmpty()) {
                            ScreenState.Empty
                        } else {
                            ScreenState.Content(result.value)
                        },
                    )
                }

                is ApiResult.Failure -> {
                    _state.value = _state.value.copy(
                        availability = ScreenState.Error(result.error),
                    )
                }
            }
        }
    }

    fun copyBranchHoursToStaff() {
        val staffProfileId = staff.staffProfileId ?: return
        val branchId = _state.value.branchId ?: return

        viewModelScope.launch {
            _state.value = _state.value.copy(
                isSaving = true,
                saveError = null,
            )

            when (
                val branchHours = schedulingRepository.getBusinessHours(
                    organizationId,
                    branchId,
                )
            ) {
                is ApiResult.Failure -> {
                    _state.value = _state.value.copy(
                        isSaving = false,
                        saveError = branchHours.error,
                    )
                }

                is ApiResult.Success -> {
                    val intervals = branchHours.value.map {
                        StaffAvailabilityRuleIntervalDto(
                            dayOfWeek = it.dayOfWeek,
                            startLocalTime = it.startLocalTime,
                            endLocalTime = it.endLocalTime,
                        )
                    }

                    when (
                        val saveResult = schedulingRepository.replaceStaffAvailabilityRules(
                            organizationId,
                            branchId,
                            staffProfileId,
                            intervals,
                        )
                    ) {
                        is ApiResult.Success -> {
                            _state.value = _state.value.copy(
                                isSaving = false,
                                availability = if (saveResult.value.isEmpty()) {
                                    ScreenState.Empty
                                } else {
                                    ScreenState.Content(saveResult.value)
                                },
                            )
                        }

                        is ApiResult.Failure -> {
                            _state.value = _state.value.copy(
                                isSaving = false,
                                saveError = saveResult.error,
                            )
                        }
                    }
                }
            }
        }
    }
}
