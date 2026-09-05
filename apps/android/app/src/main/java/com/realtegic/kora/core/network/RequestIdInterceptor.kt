package com.realtegic.kora.core.network

import java.util.UUID
import okhttp3.Interceptor
import okhttp3.Response

const val REQUEST_ID_HEADER = "x-request-id"

/** Every request carries a client-generated request id the server will
 * either accept (matching its own safe-character pattern) or replace
 * with one of its own -- either way the response echoes back the id
 * actually used, which callers can read via [REQUEST_ID_HEADER] on the
 * response for support/debugging correlation (docs task Phase 2). */
class RequestIdInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request().newBuilder()
            .header(REQUEST_ID_HEADER, UUID.randomUUID().toString())
            .build()
        return chain.proceed(request)
    }
}
