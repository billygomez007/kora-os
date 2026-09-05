package com.realtegic.kora.core.network

import kotlinx.coroutines.runBlocking
import okhttp3.Authenticator
import okhttp3.Request
import okhttp3.Response
import okhttp3.Route

/** Coordinates refresh-on-401 (docs task Phase 3: "Refresh rotation").
 * The actual single-flight/mutex behavior lives in
 * [com.realtegic.kora.core.session.SessionManager] -- this interface is
 * the seam that lets `core.network` trigger it without depending on
 * `core.session`'s concrete type. */
interface RefreshCoordinator {
    /** [failedAccessToken] is the token that was attached to the request
     * that just received a 401, used to detect "someone else already
     * refreshed while I was waiting" without a second network call.
     * Returns the access token to retry with, or `null` if refreshing
     * failed and the caller should give up (session is now signed out). */
    suspend fun refreshIfNeeded(failedAccessToken: String?): String?
}

private const val AUTH_PATH_PREFIX = "auth/"

/**
 * `retry an original request at most once` and `never create a refresh
 * loop` (docs task Phase 3): a request is never retried a second time
 * ([responseCount]), and the auth endpoints themselves (request/verify/
 * refresh/logout/me/sessions) are never intercepted here at all -- a
 * 401 from `/v1/auth/refresh` itself must surface directly to the
 * caller, never trigger another refresh attempt.
 */
class TokenAuthenticator(private val refreshCoordinator: RefreshCoordinator) : Authenticator {
    override fun authenticate(route: Route?, response: Response): Request? {
        if (responseCount(response) >= 2) return null
        if (isAuthEndpoint(response.request)) return null

        val failedToken = response.request.header("Authorization")?.removePrefix("Bearer ")
        val newAccessToken = runBlocking { refreshCoordinator.refreshIfNeeded(failedToken) } ?: return null

        return response.request.newBuilder()
            .header("Authorization", "Bearer $newAccessToken")
            .build()
    }

    private fun isAuthEndpoint(request: Request): Boolean {
        val path = request.url.encodedPath
        return path.substringAfter("/v1/", path).startsWith(AUTH_PATH_PREFIX)
    }

    private fun responseCount(response: Response): Int {
        var count = 1
        var prior = response.priorResponse
        while (prior != null) {
            count++
            prior = prior.priorResponse
        }
        return count
    }
}
