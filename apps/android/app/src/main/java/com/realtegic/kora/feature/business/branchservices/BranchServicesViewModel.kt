package com.realtegic.kora.feature.business.branchservices

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.realtegic.kora.core.data.ServiceCatalogueRepository
import com.realtegic.kora.core.data.StaffRepository
import com.realtegic.kora.core.designsystem.MoneyParser
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.AssignStaffServiceRequest
import com.realtegic.kora.core.model.BranchServiceDto
import com.realtegic.kora.core.model.StaffDirectoryEntryDto
import com.realtegic.kora.core.model.StaffServiceAssignmentDto
import com.realtegic.kora.core.model.UpsertBranchServiceRequest
import com.realtegic.kora.core.network.ApiResult
import com.realtegic.kora.core.network.DomainError
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class BranchServicesUiState(
    val branchServices: ScreenState<List<BranchServiceDto>> = ScreenState.Loading,
    val editingServiceId: String? = null,
    val editEnabled: Boolean = true,
    val editPriceOverrideMajor: String = "",
    val editDurationOverrideMinutes: String = "",
    val isSaving: Boolean = false,
    val saveError: DomainError? = null,
    val staffSheetServiceId: String? = null,
    val staff: ScreenState<List<StaffDirectoryEntryDto>> = ScreenState.Loading,
    val assignments: List<StaffServiceAssignmentDto> = emptyList(),
    val isReadOnly: Boolean = false,
)

/**
 * Branch-service enablement and price/duration overrides, plus
 * staff-service eligibility (docs task Phase 1) -- the client only
 * ever displays "override" vs "organization default"; the effective
 * price/duration a customer sees always comes from the server. An
 * archived organization service can never be re-enabled here (it is
 * simply absent from [ServiceCatalogueRepository.listServices]'s
 * default, non-archived result).
 */
class BranchServicesViewModel(
    private val organizationId: String,
    private val branchId: String,
    accessMode: String,
    private val serviceCatalogueRepository: ServiceCatalogueRepository,
    private val staffRepository: StaffRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(BranchServicesUiState(isReadOnly = accessMode == "READ_ONLY"))
    val state: StateFlow<BranchServicesUiState> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.value = _state.value.copy(branchServices = ScreenState.Loading)
            when (val result = serviceCatalogueRepository.listBranchServices(organizationId, branchId)) {
                is ApiResult.Success -> _state.value = _state.value.copy(
                    branchServices = if (result.value.isEmpty()) ScreenState.Empty else ScreenState.Content(result.value),
                )
                is ApiResult.Failure -> _state.value = _state.value.copy(branchServices = ScreenState.Error(result.error))
            }
        }
    }

    fun startEditing(branchService: BranchServiceDto) {
        _state.value = _state.value.copy(
            editingServiceId = branchService.serviceId,
            editEnabled = branchService.isEnabled,
            editPriceOverrideMajor = branchService.priceOverrideMinor
                ?.let { java.math.BigDecimal(it).movePointLeft(2).toPlainString() }
                ?: "",
            editDurationOverrideMinutes = branchService.durationOverrideMinutes?.toString() ?: "",
            saveError = null,
        )
    }

    fun dismissEditing() {
        _state.value = _state.value.copy(editingServiceId = null, saveError = null)
    }

    fun onEditChanged(
        enabled: Boolean = _state.value.editEnabled,
        priceOverrideMajor: String = _state.value.editPriceOverrideMajor,
        durationOverrideMinutes: String = _state.value.editDurationOverrideMinutes,
    ) {
        _state.value = _state.value.copy(editEnabled = enabled, editPriceOverrideMajor = priceOverrideMajor, editDurationOverrideMinutes = durationOverrideMinutes, saveError = null)
    }

    fun saveOverride(currency: String) {
        val current = _state.value
        val serviceId = current.editingServiceId ?: return
        if (current.isReadOnly) return
        val priceOverrideMinor = if (current.editPriceOverrideMajor.isBlank()) null else MoneyParser.parseMinorUnits(current.editPriceOverrideMajor, currency)
        if (current.editPriceOverrideMajor.isNotBlank() && priceOverrideMinor == null) {
            _state.value = current.copy(saveError = DomainError.Validation("Enter a valid price override or leave it blank."))
            return
        }
        val durationOverride = if (current.editDurationOverrideMinutes.isBlank()) null else current.editDurationOverrideMinutes.toIntOrNull()
        if (current.editDurationOverrideMinutes.isNotBlank() && durationOverride == null) {
            _state.value = current.copy(saveError = DomainError.Validation("Enter a valid duration override or leave it blank."))
            return
        }
        viewModelScope.launch {
            _state.value = _state.value.copy(isSaving = true, saveError = null)
            val request = UpsertBranchServiceRequest(
                isEnabled = current.editEnabled,
                priceOverrideMinor = priceOverrideMinor,
                durationOverrideMinutes = durationOverride,
            )
            when (val result = serviceCatalogueRepository.upsertBranchService(organizationId, branchId, serviceId, request)) {
                is ApiResult.Success -> {
                    _state.value = _state.value.copy(isSaving = false, editingServiceId = null)
                    load()
                }
                is ApiResult.Failure -> _state.value = _state.value.copy(isSaving = false, saveError = result.error)
            }
        }
    }

    fun openStaffSheet(serviceId: String) {
        _state.value = _state.value.copy(staffSheetServiceId = serviceId, staff = ScreenState.Loading)
        viewModelScope.launch {
            val staffResult = staffRepository.listStaff(organizationId)
            val assignmentsResult = serviceCatalogueRepository.listStaffAssignments(organizationId, branchId, serviceId)
            val staffState = when (staffResult) {
                is ApiResult.Success -> if (staffResult.value.isEmpty()) ScreenState.Empty else ScreenState.Content(staffResult.value)
                is ApiResult.Failure -> ScreenState.Error(staffResult.error)
            }
            val assignments = (assignmentsResult as? ApiResult.Success)?.value ?: emptyList()
            _state.value = _state.value.copy(staff = staffState, assignments = assignments)
        }
    }

    fun dismissStaffSheet() {
        _state.value = _state.value.copy(staffSheetServiceId = null, assignments = emptyList())
    }

    fun toggleStaffAssignment(staffProfileId: String, currentlyAssigned: Boolean) {
        val serviceId = _state.value.staffSheetServiceId ?: return
        if (_state.value.isReadOnly) return
        viewModelScope.launch {
            if (currentlyAssigned) {
                serviceCatalogueRepository.unassignStaff(organizationId, branchId, serviceId, staffProfileId)
            } else {
                serviceCatalogueRepository.assignStaff(organizationId, branchId, serviceId, AssignStaffServiceRequest(staffProfileId))
            }
            val refreshed = serviceCatalogueRepository.listStaffAssignments(organizationId, branchId, serviceId)
            if (refreshed is ApiResult.Success) {
                _state.value = _state.value.copy(assignments = refreshed.value)
            }
        }
    }
}
