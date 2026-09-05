package com.realtegic.kora.feature.customer.discovery

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.realtegic.kora.core.data.DiscoveryRepository
import com.realtegic.kora.core.data.FavoritesRepository
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.DiscoveryBranchSummaryDto
import com.realtegic.kora.core.model.DiscoveryBusinessSummaryDto
import com.realtegic.kora.core.network.ApiResult
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class BusinessDetailUiState(
    val business: ScreenState<DiscoveryBusinessSummaryDto> = ScreenState.Loading,
    val branches: ScreenState<List<DiscoveryBranchSummaryDto>> = ScreenState.Loading,
    val isFavorited: Boolean = false,
    val isTogglingFavorite: Boolean = false,
)

class BusinessDetailViewModel(
    private val slug: String,
    private val discoveryRepository: DiscoveryRepository,
    private val favoritesRepository: FavoritesRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(BusinessDetailUiState())
    val state: StateFlow<BusinessDetailUiState> = _state.asStateFlow()

    private var organizationId: String? = null

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.value = _state.value.copy(business = ScreenState.Loading, branches = ScreenState.Loading)
            when (val result = discoveryRepository.getBusiness(slug)) {
                is ApiResult.Success -> {
                    organizationId = result.value.organizationId
                    _state.value = _state.value.copy(business = ScreenState.Content(result.value))
                }
                is ApiResult.Failure -> _state.value = _state.value.copy(business = ScreenState.Error(result.error))
            }
            when (val result = discoveryRepository.getBranches(slug)) {
                is ApiResult.Success -> {
                    _state.value = _state.value.copy(
                        branches = if (result.value.isEmpty()) ScreenState.Empty else ScreenState.Content(result.value),
                    )
                }
                is ApiResult.Failure -> _state.value = _state.value.copy(branches = ScreenState.Error(result.error))
            }
            val orgId = organizationId
            if (orgId != null) {
                val favorites = favoritesRepository.list()
                if (favorites is ApiResult.Success) {
                    _state.value = _state.value.copy(isFavorited = favorites.value.any { it.organizationId == orgId })
                }
            }
        }
    }

    fun toggleFavorite() {
        val orgId = organizationId ?: return
        if (_state.value.isTogglingFavorite) return
        viewModelScope.launch {
            _state.value = _state.value.copy(isTogglingFavorite = true)
            val currentlyFavorited = _state.value.isFavorited
            val result = if (currentlyFavorited) favoritesRepository.remove(orgId) else favoritesRepository.add(orgId)
            when (result) {
                is ApiResult.Success -> _state.value = _state.value.copy(isFavorited = result.value, isTogglingFavorite = false)
                is ApiResult.Failure -> _state.value = _state.value.copy(isTogglingFavorite = false)
            }
        }
    }
}
