package com.realtegic.kora.feature.customer.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.realtegic.kora.core.data.FavoritesRepository
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.DiscoveryBusinessSummaryDto
import com.realtegic.kora.core.network.ApiResult
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class FavoritesViewModel(private val favoritesRepository: FavoritesRepository) : ViewModel() {
    private val _state = MutableStateFlow<ScreenState<List<DiscoveryBusinessSummaryDto>>>(ScreenState.Loading)
    val state: StateFlow<ScreenState<List<DiscoveryBusinessSummaryDto>>> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.value = ScreenState.Loading
            _state.value = when (val result = favoritesRepository.list()) {
                is ApiResult.Success -> if (result.value.isEmpty()) ScreenState.Empty else ScreenState.Content(result.value)
                is ApiResult.Failure -> ScreenState.Error(result.error)
            }
        }
    }

    fun remove(organizationId: String) {
        viewModelScope.launch {
            favoritesRepository.remove(organizationId)
            load()
        }
    }
}
