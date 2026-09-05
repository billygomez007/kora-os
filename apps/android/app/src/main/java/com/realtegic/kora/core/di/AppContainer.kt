package com.realtegic.kora.core.di

import android.content.Context
import com.realtegic.kora.BuildConfig
import com.realtegic.kora.core.data.AppointmentsRepository
import com.realtegic.kora.core.data.DiscoveryRepository
import com.realtegic.kora.core.data.FavoritesRepository
import com.realtegic.kora.core.data.ReportsRepository
import com.realtegic.kora.core.data.WorkspacesRepository
import com.realtegic.kora.core.location.ApproximateLocationProvider
import com.realtegic.kora.core.network.AppointmentsApi
import com.realtegic.kora.core.network.AuthApi
import com.realtegic.kora.core.network.AuthInterceptor
import com.realtegic.kora.core.network.DiscoveryApi
import com.realtegic.kora.core.network.FavoritesApi
import com.realtegic.kora.core.network.NetworkModule
import com.realtegic.kora.core.network.ReportsApi
import com.realtegic.kora.core.network.TokenAuthenticator
import com.realtegic.kora.core.network.WorkspacesApi
import com.realtegic.kora.core.preferences.LocalPreferences
import com.realtegic.kora.core.session.AuthRepository
import com.realtegic.kora.core.session.SessionManager
import com.realtegic.kora.core.session.TokenStore
import com.squareup.moshi.Moshi

/**
 * Explicit, constructor-injected application container (docs task Phase
 * 1: "Dependency injection must be explicit and testable... Do not
 * create an uncontrolled global service locator"). Hilt was deliberately
 * not introduced for this stage -- it would add a new annotation-
 * processing surface (its own Gradle plugin, KSP/kapt codegen) on top of
 * an AGP/Kotlin/KSP toolchain that has never used it, for a dependency
 * graph small enough that plain constructor injection expresses just as
 * clearly. Every dependency below is a `val`, built once, in a fixed
 * order -- nothing is a mutable global, and every class remains
 * constructible directly (with fakes) in a test without touching this
 * container at all.
 *
 * Two separate Retrofit/OkHttp clients exist deliberately, to break what
 * would otherwise be a circular dependency: [authApi] (built from
 * [authOnlyOkHttpClient], carrying only the request-id and debug-logging
 * interceptors) is what [sessionManager] itself calls to refresh: it
 * must exist *before* [sessionManager] does. Every other API interface
 * is built from [mainOkHttpClient], which additionally attaches the
 * current access token ([AuthInterceptor]) and retries a 401 through
 * exactly one coordinated refresh ([TokenAuthenticator]) -- both of
 * which depend on the already-constructed [sessionManager].
 */
class AppContainer(context: Context) {
    private val appContext = context.applicationContext

    val moshi: Moshi = Moshi.Builder().build()

    val localPreferences = LocalPreferences(appContext)
    val locationProvider = ApproximateLocationProvider(appContext)
    val tokenStore = TokenStore(appContext)

    private val authOnlyOkHttpClient = NetworkModule.buildOkHttpClient(isDebugBuild = BuildConfig.DEBUG)
    private val authOnlyRetrofit = NetworkModule.buildRetrofit(BuildConfig.API_BASE_URL, authOnlyOkHttpClient, moshi)
    private val authApi: AuthApi = authOnlyRetrofit.create(AuthApi::class.java)

    val sessionManager = SessionManager(tokenStore, authApi, moshi)
    val authRepository = AuthRepository(authApi, sessionManager, moshi)

    private val mainOkHttpClient = NetworkModule.buildOkHttpClient(
        isDebugBuild = BuildConfig.DEBUG,
        extraInterceptors = listOf(AuthInterceptor(sessionManager)),
        authenticator = TokenAuthenticator(sessionManager),
    )
    private val mainRetrofit = NetworkModule.buildRetrofit(BuildConfig.API_BASE_URL, mainOkHttpClient, moshi)

    val workspacesRepository = WorkspacesRepository(mainRetrofit.create(WorkspacesApi::class.java), moshi)
    val discoveryRepository = DiscoveryRepository(mainRetrofit.create(DiscoveryApi::class.java), moshi)
    val appointmentsRepository = AppointmentsRepository(mainRetrofit.create(AppointmentsApi::class.java), moshi)
    val favoritesRepository = FavoritesRepository(mainRetrofit.create(FavoritesApi::class.java), moshi)
    val reportsRepository = ReportsRepository(mainRetrofit.create(ReportsApi::class.java), moshi)
}
