package com.realtegic.kora.core.session

import com.realtegic.kora.core.model.MeDto
import com.realtegic.kora.core.model.RequestEmailOtpRequest
import com.realtegic.kora.core.model.RequestEmailOtpResponse
import com.realtegic.kora.core.model.SessionSummaryDto
import com.realtegic.kora.core.model.VerifyEmailOtpRequest
import com.realtegic.kora.core.network.ApiResult
import com.realtegic.kora.core.network.AuthApi
import com.realtegic.kora.core.network.safeApiCall
import com.realtegic.kora.core.network.safeUnitApiCall
import com.squareup.moshi.Moshi

/**
 * The auth feature's usable surface over [AuthApi]/[SessionManager].
 * Email normalization matches the backend (docs task Phase 3: "normalize
 * email consistently with the backend") -- trimmed and lower-cased,
 * exactly what `normalizeEmail` on the server does for a plain ASCII
 * address; the server remains authoritative either way.
 */
class AuthRepository(
    private val authApi: AuthApi,
    private val sessionManager: SessionManager,
    private val moshi: Moshi,
) {
    val sessionState = sessionManager.sessionState

    suspend fun restoreSession() = sessionManager.restoreSession()

    suspend fun requestOtp(email: String): ApiResult<RequestEmailOtpResponse> {
        val normalized = email.trim().lowercase()
        return safeApiCall(moshi) { authApi.requestOtp(RequestEmailOtpRequest(normalized)) }
    }

    suspend fun verifyOtp(challengeId: String, code: String, deviceLabel: String?): ApiResult<Unit> {
        val result = safeApiCall(moshi) {
            authApi.verifyOtp(VerifyEmailOtpRequest(challengeId = challengeId, code = code, deviceLabel = deviceLabel))
        }
        return when (result) {
            is ApiResult.Success -> {
                sessionManager.completeSignIn(result.value)
                ApiResult.Success(Unit)
            }
            is ApiResult.Failure -> result
        }
    }

    suspend fun me(): ApiResult<MeDto> = safeApiCall(moshi) { authApi.me() }

    suspend fun listSessions(): ApiResult<List<SessionSummaryDto>> = safeApiCall(moshi) { authApi.sessions() }

    suspend fun revokeSession(sessionId: String): ApiResult<Unit> =
        safeUnitApiCall(moshi) { authApi.revokeSession(sessionId) }

    suspend fun logout() = sessionManager.logout()

    suspend fun logoutAllDevices() = sessionManager.logoutAll()
}
