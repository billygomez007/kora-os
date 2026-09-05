package com.realtegic.kora.core.network

import com.squareup.moshi.Moshi
import java.util.concurrent.TimeUnit
import okhttp3.Authenticator
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory

private const val CONNECT_TIMEOUT_SECONDS = 10L
private const val READ_TIMEOUT_SECONDS = 20L
private const val WRITE_TIMEOUT_SECONDS = 20L

/**
 * Builds the shared [OkHttpClient]/[Retrofit] pair every API interface
 * in `core.network` is created from (docs task Phase 2). [isDebugBuild]
 * gates the only interceptor allowed to log anything at all
 * ([SafeDebugLoggingInterceptor]) -- a release build never installs it,
 * so release builds carry zero network logging regardless of any other
 * configuration mistake elsewhere.
 */
object NetworkModule {
    fun buildOkHttpClient(
        isDebugBuild: Boolean,
        extraInterceptors: List<Interceptor> = emptyList(),
        authenticator: Authenticator? = null,
    ): OkHttpClient {
        val builder = OkHttpClient.Builder()
            .connectTimeout(CONNECT_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .readTimeout(READ_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .writeTimeout(WRITE_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .addInterceptor(RequestIdInterceptor())
        extraInterceptors.forEach { builder.addInterceptor(it) }
        if (isDebugBuild) {
            builder.addInterceptor(SafeDebugLoggingInterceptor())
        }
        authenticator?.let { builder.authenticator(it) }
        return builder.build()
    }

    fun buildRetrofit(baseUrl: String, client: OkHttpClient, moshi: Moshi): Retrofit {
        val normalizedBaseUrl = if (baseUrl.endsWith("/")) baseUrl else "$baseUrl/"
        return Retrofit.Builder()
            .baseUrl(normalizedBaseUrl)
            .client(client)
            .addConverterFactory(MoshiConverterFactory.create(moshi))
            .build()
    }
}
