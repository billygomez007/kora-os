package com.realtegic.kora.feature.customer.discovery

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.realtegic.kora.core.data.DiscoveryRepository
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.location.ApproximateLocationProvider
import com.realtegic.kora.core.location.LocationLookupResult
import com.realtegic.kora.core.model.BusinessCategoryDto
import com.realtegic.kora.core.model.DiscoveryBusinessSummaryDto
import com.realtegic.kora.core.network.ApiResult
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.launch

private const val SEARCH_DEBOUNCE_MS = 300L
private const val PAGE_SIZE = 20

data class NearbyLocation(val latitude: Double, val longitude: Double)

data class DiscoveryUiState(
    val query: String = "",
    val selectedCategory: String? = null,
    val verifiedOnly: Boolean = false,
    val categories: ScreenState<List<BusinessCategoryDto>> = ScreenState.Loading,
    val nearby: NearbyLocation? = null,
    val isLoadingNearby: Boolean = false,
    val nearbyError: String? = null,
    val results: ScreenState<List<DiscoveryBusinessSummaryDto>> = ScreenState.Initial,
    val isLoadingMore: Boolean = false,
    val hasMore: Boolean = false,
)

/**
 * Debounced, cancellable search (docs task Phase 5): every keystroke
 * updates [queryFlow], and `collectLatest` on the combined
 * query/category/verified/location flow means a change arriving before
 * the previous search's coroutine finishes cancels it outright, rather
 * than letting a stale response race in after a newer one. Only filters
 * the public discovery endpoint genuinely supports (`text`, `category`,
 * `verificationStatus`, and approximate near-me) are exposed here (docs
 * task Customer Marketplace Design Batch 02) -- no rating, price, or
 * "open now" chip, since the API has no such fields to filter by.
 */
@OptIn(kotlinx.coroutines.FlowPreview::class)
class DiscoveryViewModel(
    private val discoveryRepository: DiscoveryRepository,
    private val locationProvider: ApproximateLocationProvider,
) : ViewModel() {

    private val queryFlow = MutableStateFlow("")
    private val categoryFlow = MutableStateFlow<String?>(null)
    private val verifiedOnlyFlow = MutableStateFlow(false)
    private val nearbyFlow = MutableStateFlow<NearbyLocation?>(null)

    private val _state = MutableStateFlow(DiscoveryUiState())
    val state: StateFlow<DiscoveryUiState> = _state.asStateFlow()

    private var nextCursor: String? = null

    init {
        loadCategories()
        viewModelScope.launch {
            combine(queryFlow, categoryFlow, verifiedOnlyFlow, nearbyFlow) { query, category, verifiedOnly, nearby -> Filters(query, category, verifiedOnly, nearby) }
                .debounce(SEARCH_DEBOUNCE_MS)
                .distinctUntilChanged()
                .collectLatest { filters ->
                    search(filters.query, filters.category, filters.verifiedOnly, filters.nearby)
                }
        }
    }

    private data class Filters(val query: String, val category: String?, val verifiedOnly: Boolean, val nearby: NearbyLocation?)

    private fun loadCategories() {
        viewModelScope.launch {
            _state.value = _state.value.copy(
                categories = when (val result = discoveryRepository.categories()) {
                    is ApiResult.Success -> ScreenState.Content(result.value)
                    is ApiResult.Failure -> ScreenState.Error(result.error)
                },
            )
        }
    }

    fun onQueryChanged(query: String) {
        _state.value = _state.value.copy(query = query)
        queryFlow.value = query
    }

    fun onCategorySelected(category: String?) {
        val newCategory = if (_state.value.selectedCategory == category) null else category
        _state.value = _state.value.copy(selectedCategory = newCategory)
        categoryFlow.value = newCategory
    }

    fun onVerifiedOnlyToggled() {
        val newValue = !_state.value.verifiedOnly
        _state.value = _state.value.copy(verifiedOnly = newValue)
        verifiedOnlyFlow.value = newValue
    }

    fun onNearYouRequested() {
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoadingNearby = true, nearbyError = null)
            when (val result = locationProvider.getApproximateLocation()) {
                is LocationLookupResult.Success -> {
                    val nearby = NearbyLocation(result.latitude, result.longitude)
                    _state.value = _state.value.copy(isLoadingNearby = false, nearby = nearby)
                    nearbyFlow.value = nearby
                }
                LocationLookupResult.PermissionDenied -> {
                    _state.value = _state.value.copy(isLoadingNearby = false, nearbyError = "Location permission was not granted.")
                }
                LocationLookupResult.ServiceUnavailable -> {
                    _state.value = _state.value.copy(isLoadingNearby = false, nearbyError = "Location is unavailable right now.")
                }
                LocationLookupResult.Timeout -> {
                    _state.value = _state.value.copy(isLoadingNearby = false, nearbyError = "Location took too long to respond.")
                }
                is LocationLookupResult.Unknown -> {
                    _state.value = _state.value.copy(isLoadingNearby = false, nearbyError = "Couldn't determine your location.")
                }
            }
        }
    }

    fun clearNearby() {
        _state.value = _state.value.copy(nearby = null, nearbyError = null)
        nearbyFlow.value = null
    }

    fun retry() {
        search(queryFlow.value, categoryFlow.value, verifiedOnlyFlow.value, nearbyFlow.value)
    }

    fun loadMore() {
        val cursor = nextCursor ?: return
        if (_state.value.isLoadingMore) return
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoadingMore = true)
            val nearby = nearbyFlow.value
            val result = discoveryRepository.search(
                text = queryFlow.value.ifBlank { null },
                category = categoryFlow.value,
                verifiedOnly = verifiedOnlyFlow.value,
                nearLat = nearby?.latitude,
                nearLng = nearby?.longitude,
                cursor = cursor,
                limit = PAGE_SIZE,
            )
            when (result) {
                is ApiResult.Success -> {
                    val existing = (_state.value.results as? ScreenState.Content)?.data.orEmpty()
                    nextCursor = result.page?.nextCursor
                    _state.value = _state.value.copy(
                        results = ScreenState.Content(existing + result.value),
                        hasMore = result.page?.hasMore ?: false,
                        isLoadingMore = false,
                    )
                }
                is ApiResult.Failure -> {
                    _state.value = _state.value.copy(isLoadingMore = false)
                }
            }
        }
    }

    private fun search(query: String, category: String?, verifiedOnly: Boolean, nearby: NearbyLocation?) {
        viewModelScope.launch {
            _state.value = _state.value.copy(results = ScreenState.Loading)
            val result = discoveryRepository.search(
                text = query.ifBlank { null },
                category = category,
                verifiedOnly = verifiedOnly,
                nearLat = nearby?.latitude,
                nearLng = nearby?.longitude,
                limit = PAGE_SIZE,
            )
            when (result) {
                is ApiResult.Success -> {
                    nextCursor = result.page?.nextCursor
                    _state.value = _state.value.copy(
                        results = if (result.value.isEmpty()) ScreenState.Empty else ScreenState.Content(result.value),
                        hasMore = result.page?.hasMore ?: false,
                    )
                }
                is ApiResult.Failure -> {
                    _state.value = _state.value.copy(results = ScreenState.Error(result.error))
                }
            }
        }
    }
}
