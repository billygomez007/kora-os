package com.realtegic.kora.core.designsystem

import com.realtegic.kora.core.network.DomainError

/** Every explicit state a Kora screen can be in (docs task Phase 1):
 * initial, loading, content, empty, recoverable error, and
 * authentication-expired -- kept as one shared sealed class so every
 * feature ViewModel expresses its UI state the same way. */
sealed class ScreenState<out T> {
    data object Initial : ScreenState<Nothing>()
    data object Loading : ScreenState<Nothing>()
    data class Content<T>(val data: T) : ScreenState<T>()
    data object Empty : ScreenState<Nothing>()
    data class Error(val error: DomainError) : ScreenState<Nothing>()
    data object AuthenticationExpired : ScreenState<Nothing>()
}
