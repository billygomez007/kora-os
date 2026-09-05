package com.realtegic.kora.core.network

import android.util.Log
import okhttp3.Interceptor
import okhttp3.Response

/**
 * Debug-only, allow-listed request logging (docs task Phase 2). Logs
 * only method, path (no query string -- a search term or coordinate
 * pair could appear there), status, duration, and the request id.
 * Never logs headers (so never `Authorization`), never a request or
 * response body, never a full email address. The caller is
 * responsible for never installing this interceptor in a release
 * build -- see `NetworkModule`.
 */
class SafeDebugLoggingInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val startNanos = System.nanoTime()
        val response = chain.proceed(request)
        val durationMs = (System.nanoTime() - startNanos) / 1_000_000
        val requestId = response.header(REQUEST_ID_HEADER) ?: request.header(REQUEST_ID_HEADER) ?: "-"
        Log.d(
            "Kora.Network",
            "${request.method} ${request.url.encodedPath} -> ${response.code} (${durationMs}ms) [$requestId]",
        )
        return response
    }
}
