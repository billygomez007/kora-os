package com.realtegic.kora.feature.business.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.realtegic.kora.core.data.ReportsRepository
import com.realtegic.kora.core.data.WorkspacesRepository
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.ReportsOverviewDto
import com.realtegic.kora.core.model.WorkspaceOrganizationDto
import com.realtegic.kora.core.network.ApiResult
import java.time.Instant
import java.time.temporal.ChronoUnit
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

private const val OVERVIEW_WINDOW_DAYS = 30L
private const val REPORTS_READ_PERMISSION = "reports.read"

data class BusinessDashboardUiState(
    val workspace: ScreenState<WorkspaceOrganizationDto> = ScreenState.Loading,
    val overview: ScreenState<ReportsOverviewDto>? = null,
)

/**
 * The workspace's own role/permission/branch/accessMode facts are
 * re-fetched fresh on every load (docs task Phase 4) -- never trusted
 * from whatever the workspace chooser last cached, since a membership's
 * permissions or the organization's subscription can change between
 * visits. `reports.read` gates whether the overview report is ever
 * requested at all: a membership without it never calls the endpoint
 * (docs task Phase 9), which also means a `403` from that endpoint is
 * never something this screen needs to handle for that case.
 */
class BusinessDashboardViewModel(
    private val organizationId: String,
    private val workspacesRepository: WorkspacesRepository,
    private val reportsRepository: ReportsRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(BusinessDashboardUiState())
    val state: StateFlow<BusinessDashboardUiState> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.value = BusinessDashboardUiState(workspace = ScreenState.Loading)
            when (val result = workspacesRepository.getMyWorkspaces()) {
                is ApiResult.Success -> {
                    val org = result.value.organizations.firstOrNull { it.organizationId == organizationId }
                    if (org == null) {
                        _state.value = BusinessDashboardUiState(workspace = ScreenState.Error(com.realtegic.kora.core.network.DomainError.NotFound))
                        return@launch
                    }
                    _state.value = BusinessDashboardUiState(workspace = ScreenState.Content(org))
                    if (REPORTS_READ_PERMISSION in org.permissionCodes) {
                        loadOverview()
                    }
                }
                is ApiResult.Failure -> {
                    _state.value = BusinessDashboardUiState(workspace = ScreenState.Error(result.error))
                }
            }
        }
    }

    private fun loadOverview() {
        viewModelScope.launch {
            _state.value = _state.value.copy(overview = ScreenState.Loading)
            val to = Instant.now()
            val from = to.minus(OVERVIEW_WINDOW_DAYS, ChronoUnit.DAYS)
            val result = reportsRepository.overview(organizationId, from.toString(), to.toString())
            _state.value = _state.value.copy(
                overview = when (result) {
                    is ApiResult.Success -> ScreenState.Content(result.value)
                    is ApiResult.Failure -> ScreenState.Error(result.error)
                },
            )
        }
    }
}
