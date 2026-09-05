package com.realtegic.kora.feature.business.earnings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.realtegic.kora.core.data.MyEarningsRepository
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.CommissionReportEntryDto
import com.realtegic.kora.core.model.MyEarningsLineDto
import com.realtegic.kora.core.network.ApiResult
import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.TemporalAdjusters
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

enum class EarningsRangePreset { TODAY, THIS_WEEK, CUSTOM }

data class EarningsRange(val preset: EarningsRangePreset, val from: Instant, val to: Instant)

private fun rangeFor(preset: EarningsRangePreset, zone: ZoneId = ZoneId.systemDefault()): EarningsRange {
    val now = Instant.now()
    val today = LocalDate.now(zone)
    val from = when (preset) {
        EarningsRangePreset.TODAY -> today.atStartOfDay(zone).toInstant()
        EarningsRangePreset.THIS_WEEK -> today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)).atStartOfDay(zone).toInstant()
        EarningsRangePreset.CUSTOM -> today.atStartOfDay(zone).toInstant()
    }
    return EarningsRange(preset, from, now)
}

data class StaffEarningsUiState(
    val range: EarningsRangePreset = EarningsRangePreset.TODAY,
    val summary: ScreenState<CommissionReportEntryDto> = ScreenState.Loading,
    val lines: ScreenState<List<MyEarningsLineDto>> = ScreenState.Loading,
)

/** Every figure here comes straight from server-calculated
 * CommissionAccrual rows -- this ViewModel never sums line items itself
 * into a "total" (the [summary] figures are a separate authoritative
 * server call, not a client-side reduction of [lines]) and never
 * derives an amount from a mutable Service price or a cached commission
 * rate (docs task Phase 12). */
class StaffEarningsViewModel(
    private val organizationId: String,
    private val repository: MyEarningsRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(StaffEarningsUiState())
    val state: StateFlow<StaffEarningsUiState> = _state.asStateFlow()

    private var customFrom: Instant? = null
    private var customTo: Instant? = null

    init {
        load()
    }

    fun selectRange(preset: EarningsRangePreset) {
        _state.value = _state.value.copy(range = preset)
        load()
    }

    fun setCustomRange(from: Instant, to: Instant) {
        customFrom = from
        customTo = to
        _state.value = _state.value.copy(range = EarningsRangePreset.CUSTOM)
        load()
    }

    fun load() {
        val preset = _state.value.range
        val range = if (preset == EarningsRangePreset.CUSTOM && customFrom != null && customTo != null) {
            EarningsRange(preset, customFrom!!, customTo!!)
        } else {
            rangeFor(preset)
        }
        val fromIso = range.from.toString()
        val toIso = range.to.toString()

        viewModelScope.launch {
            _state.value = _state.value.copy(summary = ScreenState.Loading, lines = ScreenState.Loading)
            val summaryResult = repository.summary(organizationId, fromIso, toIso)
            _state.value = _state.value.copy(
                summary = when (summaryResult) {
                    is ApiResult.Success -> ScreenState.Content(summaryResult.value)
                    is ApiResult.Failure -> ScreenState.Error(summaryResult.error)
                },
            )
            val linesResult = repository.list(organizationId, fromIso, toIso)
            _state.value = _state.value.copy(
                lines = when (linesResult) {
                    is ApiResult.Success -> if (linesResult.value.isEmpty()) ScreenState.Empty else ScreenState.Content(linesResult.value)
                    is ApiResult.Failure -> ScreenState.Error(linesResult.error)
                },
            )
        }
    }
}
