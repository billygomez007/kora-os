package com.realtegic.kora.core.network

import okhttp3.Interceptor
import okhttp3.Response

/** Attaches the current in-memory access token, when one exists.
 * Harmless to attach on a `@Public()` route (discovery, auth) -- the
 * server simply ignores it there. Never reads from persistent storage:
 * the access token is memory-only (docs task Phase 3). */
class AuthInterceptor(private val tokenProvider: AccessTokenProvider) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val token = tokenProvider.currentAccessToken()
        val request = if (token != null) {
            chain.request().newBuilder().header("Authorization", "Bearer $token").build()
        } else {
            chain.request()
        }
        return chain.proceed(request)
    }
}
