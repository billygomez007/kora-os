package com.realtegic.kora.core.session

import com.realtegic.kora.core.model.AuthResultDto
import com.realtegic.kora.core.model.RefreshRequest
import com.realtegic.kora.core.network.AccessTokenProvider
import com.realtegic.kora.core.network.ApiResult
import com.realtegic.kora.core.network.AuthApi
import com.realtegic.kora.core.network.DomainError
import com.realtegic.kora.core.network.RefreshCoordinator
import com.realtegic.kora.core.network.safeApiCall
import com.realtegic.kora.core.network.safeUnitApiCall
import com.squareup.moshi.Moshi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * The single source of truth for "is anyone signed in, and as whom"
 * (docs task Phase 3). The access token lives only in
 * [accessTokenInMemory] -- never persisted, matching "keep access token
 * in memory where practical". The refresh token is the only credential
 * ever written to disk, and only through [TokenStore]'s Keystore-backed
 * encryption.
 *
 * [refreshMutex] is what makes "only one refresh operation may run when
 * several requests receive 401 simultaneously" true: every concurrent
 * caller of [refreshIfNeeded] (each one a different failed request,
 * arriving on a different OkHttp dispatcher thread via
 * [com.realtegic.kora.core.network.TokenAuthenticator]) serializes on
 * this one lock, and every caller that arrives *after* the first one
 * already refreshed simply observes the already-updated
 * [accessTokenInMemory] and returns it without a second network call.
 */
class SessionManager(
    private val tokenStore: TokenStore,
    private val authApi: AuthApi,
    private val moshi: Moshi,
) : AccessTokenProvider, RefreshCoordinator {

    private val refreshMutex = Mutex()

    @Volatile
    private var accessTokenInMemory: String? = null

    private val _sessionState = MutableStateFlow<SessionState>(SessionState.Unknown)
    val sessionState: StateFlow<SessionState> = _sessionState.asStateFlow()

    override fun currentAccessToken(): String? = accessTokenInMemory

    /** Called exactly once per process, from the session-restoration
     * splash screen. A transient network/server failure deliberately
     * leaves the stored refresh token intact ([SessionState.RestorationFailed])
     * -- only a definitive rejection from the server (the refresh token
     * itself is invalid, expired, or was reused) clears local session
     * material. */
    suspend fun restoreSession(): SessionState {
        val stored = tokenStore.load()
        if (stored == null) {
            _sessionState.value = SessionState.SignedOut
            return SessionState.SignedOut
        }

        return when (val result = safeApiCall(moshi) { authApi.refresh(RefreshRequest(stored.refreshToken)) }) {
            is ApiResult.Success -> {
                applyAuthResult(result.value)
                _sessionState.value
            }
            is ApiResult.Failure -> {
                if (isTransient(result.error)) {
                    val state = SessionState.RestorationFailed(stored.displayName)
                    _sessionState.value = state
                    state
                } else {
                    clearSessionInternal()
                    SessionState.SignedOut
                }
            }
        }
    }

    fun completeSignIn(authResult: AuthResultDto) {
        applyAuthResult(authResult)
    }

    override suspend fun refreshIfNeeded(failedAccessToken: String?): String? = refreshMutex.withLock {
        val current = accessTokenInMemory
        if (failedAccessToken != null && current != null && current != failedAccessToken) {
            // Another caller already refreshed while this one waited for
            // the lock -- reuse it rather than refreshing twice.
            return@withLock current
        }

        val stored = tokenStore.load() ?: run {
            clearSessionInternal()
            return@withLock null
        }

        when (val result = safeApiCall(moshi) { authApi.refresh(RefreshRequest(stored.refreshToken)) }) {
            is ApiResult.Success -> {
                applyAuthResult(result.value)
                result.value.accessToken
            }
            is ApiResult.Failure -> {
                // A transient failure fails only this one retry attempt
                // -- the caller's original request surfaces its own
                // network/server error, and the stored session survives
                // for the next attempt. Never create a refresh loop
                // either way: this method is never called again for the
                // same failed response (TokenAuthenticator retries at
                // most once).
                if (!isTransient(result.error)) {
                    clearSessionInternal()
                }
                null
            }
        }
    }

    /** Always clears local session material, even if the server call
     * fails or the device is offline (docs task Phase 3: "Logout
     * must... clear all local session material even if the network
     * request fails"). */
    suspend fun logout() {
        runCatching { safeUnitApiCall(moshi) { authApi.logout() } }
        clearSessionInternal()
    }

    suspend fun logoutAll() {
        runCatching { safeUnitApiCall(moshi) { authApi.logoutAll() } }
        clearSessionInternal()
    }

    fun clearSession() {
        clearSessionInternal()
    }

    private fun isTransient(error: DomainError): Boolean =
        error is DomainError.NetworkUnavailable || error is DomainError.ServerUnavailable

    private fun clearSessionInternal() {
        accessTokenInMemory = null
        tokenStore.clear()
        _sessionState.value = SessionState.SignedOut
    }

    private fun applyAuthResult(result: AuthResultDto) {
        accessTokenInMemory = result.accessToken
        tokenStore.save(
            StoredSession(
                refreshToken = result.refreshToken,
                sessionId = result.session.id,
                userId = result.user.id,
                displayName = result.user.displayName,
                email = result.user.email,
            ),
        )
        _sessionState.value = SessionState.SignedIn(
            userId = result.user.id,
            displayName = result.user.displayName,
            email = result.user.email,
        )
    }
}
