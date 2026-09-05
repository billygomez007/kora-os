package com.realtegic.kora.feature.customer.profile

import com.realtegic.kora.MainDispatcherRule
import com.realtegic.kora.core.data.FavoritesRepository
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.ApiMeta
import com.realtegic.kora.core.model.ApiSuccessEnvelope
import com.realtegic.kora.core.model.DiscoveryBusinessSummaryDto
import com.realtegic.kora.core.model.FavoriteToggleResponseDto
import com.realtegic.kora.core.network.DomainError
import com.realtegic.kora.core.network.FavoritesApi
import com.squareup.moshi.Moshi
import kotlinx.coroutines.test.runTest
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import retrofit2.Response

private class FakeFavoritesApi : FavoritesApi {
    var favorites = mutableListOf<DiscoveryBusinessSummaryDto>()
    var listCallCount = 0
    var listFailure: Response<ApiSuccessEnvelope<List<DiscoveryBusinessSummaryDto>>>? = null

    override suspend fun list(): Response<ApiSuccessEnvelope<List<DiscoveryBusinessSummaryDto>>> {
        listCallCount++
        listFailure?.let { return it }
        return Response.success(ApiSuccessEnvelope(data = favorites.toList(), meta = ApiMeta("req")))
    }

    override suspend fun add(organizationId: String): Response<ApiSuccessEnvelope<FavoriteToggleResponseDto>> = notImplemented()

    override suspend fun remove(organizationId: String): Response<ApiSuccessEnvelope<FavoriteToggleResponseDto>> {
        favorites.removeAll { it.organizationId == organizationId }
        return Response.success(ApiSuccessEnvelope(data = FavoriteToggleResponseDto(favorited = false), meta = ApiMeta("req")))
    }

    private fun notImplemented(): Nothing = throw UnsupportedOperationException("Not needed for this test")
}

private fun business(organizationId: String) = DiscoveryBusinessSummaryDto(
    organizationId = organizationId,
    slug = organizationId,
    displayName = organizationId,
    description = null,
    logoImageUrl = null,
    coverImageUrl = null,
    verificationStatus = "VERIFIED",
    categories = emptyList(),
)

/**
 * A business a customer favorited must isolate cleanly per customer and
 * re-reflect visibility on every read (docs task Phase 8) -- from the
 * Android side, this ViewModel's job is simply to render exactly what
 * the server returns and to reload after a mutation rather than guess
 * the new state locally.
 */
class FavoritesViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private lateinit var api: FakeFavoritesApi
    private lateinit var viewModel: FavoritesViewModel

    private fun newViewModel() = FavoritesViewModel(FavoritesRepository(api, Moshi.Builder().build()))

    @Before
    fun setUp() {
        api = FakeFavoritesApi()
    }

    @Test
    fun `loads favorites into Content when non-empty`() = runTest {
        api.favorites = mutableListOf(business("org-1"), business("org-2"))
        viewModel = newViewModel()

        val content = viewModel.state.value as ScreenState.Content
        assertEquals(2, content.data.size)
    }

    @Test
    fun `an empty favorites list renders the Empty state`() = runTest {
        viewModel = newViewModel()
        assertEquals(ScreenState.Empty, viewModel.state.value)
    }

    @Test
    fun `a load failure surfaces as an Error state`() = runTest {
        api.listFailure = Response.error(
            500,
            """{"error":{"code":"INTERNAL","message":"boom","retryable":true},"meta":{"requestId":"x"}}"""
                .toResponseBody("application/json".toMediaType()),
        )
        viewModel = newViewModel()

        assertTrue(viewModel.state.value is ScreenState.Error)
        assertTrue((viewModel.state.value as ScreenState.Error).error is DomainError.ServerUnavailable)
    }

    @Test
    fun `removing a favorite calls remove then reloads the list from the server`() = runTest {
        api.favorites = mutableListOf(business("org-1"), business("org-2"))
        viewModel = newViewModel()

        viewModel.remove("org-1")

        val content = viewModel.state.value as ScreenState.Content
        assertEquals(listOf("org-2"), content.data.map { it.organizationId })
        assertEquals(2, api.listCallCount) // once on init, once after the remove-triggered reload
    }
}
