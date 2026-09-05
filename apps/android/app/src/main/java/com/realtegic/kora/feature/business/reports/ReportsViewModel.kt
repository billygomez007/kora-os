package com.realtegic.kora.feature.business.reports

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.realtegic.kora.core.data.ReportsRepository
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.CashReconciliationEntryDto
import com.realtegic.kora.core.model.CommissionReportEntryDto
import com.realtegic.kora.core.model.PaymentMethodEntryDto
import com.realtegic.kora.core.model.ReportsOverviewDto
import com.realtegic.kora.core.model.RevenueReportDto
import com.realtegic.kora.core.model.ServicePerformanceEntryDto
import com.realtegic.kora.core.model.StaffPerformanceEntryDto
import com.realtegic.kora.core.network.ApiResult
import java.time.Instant
import java.time.temporal.ChronoUnit
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

enum class ReportWindow(val days: Long, val label: String) {
    LAST_7(7L, "Last 7 days"),
    LAST_30(30L, "Last 30 days"),
    LAST_90(90L, "Last 90 days"),
}

enum class ReportSection { OVERVIEW, REVENUE, STAFF, SERVICES, PAYMENT_METHODS, COMMISSIONS, CASH }

data class ReportsUiState(
    val window: ReportWindow = ReportWindow.LAST_30,
    val section: ReportSection = ReportSection.OVERVIEW,
    val overview: ScreenState<ReportsOverviewDto> = ScreenState.Loading,
    val revenue: ScreenState<RevenueReportDto> = ScreenState.Loading,
    val staffPerformance: ScreenState<List<StaffPerformanceEntryDto>> = ScreenState.Loading,
    val services: ScreenState<List<ServicePerformanceEntryDto>> = ScreenState.Loading,
    val paymentMethods: ScreenState<List<PaymentMethodEntryDto>> = ScreenState.Loading,
    val commissions: ScreenState<List<CommissionReportEntryDto>> = ScreenState.Loading,
    val cashReconciliation: ScreenState<List<CashReconciliationEntryDto>> = ScreenState.Loading,
)

/**
 * Every figure shown here is a server-computed aggregate over a fixed
 * from/to window -- this ViewModel never sums a paged list into its own
 * "total" (docs task locked rules: "never calculate authoritative
 * totals... on the client"). Only the section currently on screen is
 * fetched eagerly; the rest load lazily the first time [selectSection]
 * picks them, so switching tabs never re-fetches data already loaded
 * for the current window.
 */
class ReportsViewModel(
    private val organizationId: String,
    private val repository: ReportsRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(ReportsUiState())
    val state: StateFlow<ReportsUiState> = _state.asStateFlow()

    init {
        loadOverview()
    }

    fun selectWindow(window: ReportWindow) {
        _state.value = ReportsUiState(window = window, section = _state.value.section)
        loadCurrentSection()
    }

    fun selectSection(section: ReportSection) {
        _state.value = _state.value.copy(section = section)
        loadCurrentSection()
    }

    fun retry() = loadCurrentSection()

    private fun loadCurrentSection() {
        when (_state.value.section) {
            ReportSection.OVERVIEW -> loadOverview()
            ReportSection.REVENUE -> loadRevenue()
            ReportSection.STAFF -> loadStaffPerformance()
            ReportSection.SERVICES -> loadServices()
            ReportSection.PAYMENT_METHODS -> loadPaymentMethods()
            ReportSection.COMMISSIONS -> loadCommissions()
            ReportSection.CASH -> loadCashReconciliation()
        }
    }

    private fun window(): Pair<String, String> {
        val to = Instant.now()
        val from = to.minus(_state.value.window.days, ChronoUnit.DAYS)
        return from.toString() to to.toString()
    }

    private fun loadOverview() {
        viewModelScope.launch {
            _state.value = _state.value.copy(overview = ScreenState.Loading)
            val (from, to) = window()
            val result = repository.overview(organizationId, from, to)
            _state.value = _state.value.copy(overview = result.toScreenState())
        }
    }

    private fun loadRevenue() {
        viewModelScope.launch {
            _state.value = _state.value.copy(revenue = ScreenState.Loading)
            val (from, to) = window()
            val result = repository.revenue(organizationId, from, to)
            _state.value = _state.value.copy(revenue = result.toScreenState())
        }
    }

    private fun loadStaffPerformance() {
        viewModelScope.launch {
            _state.value = _state.value.copy(staffPerformance = ScreenState.Loading)
            val (from, to) = window()
            val result = repository.staffPerformance(organizationId, from, to)
            _state.value = _state.value.copy(staffPerformance = result.toListScreenState())
        }
    }

    private fun loadServices() {
        viewModelScope.launch {
            _state.value = _state.value.copy(services = ScreenState.Loading)
            val (from, to) = window()
            val result = repository.services(organizationId, from, to)
            _state.value = _state.value.copy(services = result.toListScreenState())
        }
    }

    private fun loadPaymentMethods() {
        viewModelScope.launch {
            _state.value = _state.value.copy(paymentMethods = ScreenState.Loading)
            val (from, to) = window()
            val result = repository.paymentMethods(organizationId, from, to)
            _state.value = _state.value.copy(paymentMethods = result.toListScreenState())
        }
    }

    private fun loadCommissions() {
        viewModelScope.launch {
            _state.value = _state.value.copy(commissions = ScreenState.Loading)
            val (from, to) = window()
            val result = repository.commissions(organizationId, from, to)
            _state.value = _state.value.copy(commissions = result.toListScreenState())
        }
    }

    private fun loadCashReconciliation() {
        viewModelScope.launch {
            _state.value = _state.value.copy(cashReconciliation = ScreenState.Loading)
            val (from, to) = window()
            val result = repository.cashReconciliation(organizationId, from, to)
            _state.value = _state.value.copy(cashReconciliation = result.toListScreenState())
        }
    }
}

private fun <T> ApiResult<T>.toScreenState(): ScreenState<T> = when (this) {
    is ApiResult.Success -> ScreenState.Content(value)
    is ApiResult.Failure -> ScreenState.Error(error)
}

private fun <T> ApiResult<List<T>>.toListScreenState(): ScreenState<List<T>> = when (this) {
    is ApiResult.Success -> if (value.isEmpty()) ScreenState.Empty else ScreenState.Content(value)
    is ApiResult.Failure -> ScreenState.Error(error)
}
