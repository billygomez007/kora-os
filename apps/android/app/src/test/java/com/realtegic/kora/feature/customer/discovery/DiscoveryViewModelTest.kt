package com.realtegic.kora.feature.customer.discovery

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.realtegic.kora.MainDispatcherRule
import com.realtegic.kora.core.data.DiscoveryRepository
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.location.ApproximateLocationProvider
import com.realtegic.kora.core.model.ApiMeta
import com.realtegic.kora.core.model.ApiSuccessEnvelope
import com.realtegic.kora.core.model.AvailabilityResultDto
import com.realtegic.kora.core.model.BusinessCategoryDto
import com.realtegic.kora.core.model.DiscoveryBranchSummaryDto
import com.realtegic.kora.core.model.DiscoveryBusinessSummaryDto
import com.realtegic.kora.core.model.PageInfo
import com.realtegic.kora.core.model.PublicProviderSummaryDto
import com.realtegic.kora.core.model.PublicServiceSummaryDto
import com.realtegic.kora.core.network.DiscoveryApi
import com.squareup.moshi.Moshi
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runTest
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import retrofit2.Response

private class FakeDiscoveryApi : DiscoveryApi {
    val startedQueries = mutableListOf<String?>()
    val completedQueries = mutableListOf<String?>()

    /** Query text -> a deferred that [searchBusinesses] suspends on before
     * returning, letting a test hold a search open indefinitely to prove
     * it gets genuinely cancelled rather than merely delayed. */
    val holdFor = mutableMapOf<String?, CompletableDeferred<Unit>>()
    var resultFor: (cursor: String?) -> List<DiscoveryBusinessSummaryDto> = { business("default") }
    var pageFor: (cursor: String?) -> PageInfo? = { null }

    override suspend fun categories(): Response<ApiSuccessEnvelope<List<BusinessCategoryDto>>> =
        Response.success(ApiSuccessEnvelope(data = emptyList(), meta = ApiMeta("req")))

    override suspend fun searchBusinesses(
        text: String?,
        category: String?,
        verificationStatus: String?,
        nearLat: Double?,
        nearLng: Double?,
        radiusKm: Int?,
        cursor: String?,
        limit: Int?,
    ): Response<ApiSuccessEnvelope<List<DiscoveryBusinessSummaryDto>>> {
        startedQueries.add(text)
        holdFor[text]?.await()
        completedQueries.add(text)
        return Response.success(ApiSuccessEnvelope(data = resultFor(cursor), page = pageFor(cursor), meta = ApiMeta("req")))
    }

    override suspend fun getBusiness(slug: String): Response<ApiSuccessEnvelope<DiscoveryBusinessSummaryDto>> = notImplemented()
    override suspend fun getBranches(slug: String): Response<ApiSuccessEnvelope<List<DiscoveryBranchSummaryDto>>> = notImplemented()
    override suspend fun getServices(slug: String, branchId: String): Response<ApiSuccessEnvelope<List<PublicServiceSummaryDto>>> = notImplemented()
    override suspend fun getProviders(slug: String, branchId: String, serviceId: String): Response<ApiSuccessEnvelope<List<PublicProviderSummaryDto>>> = notImplemented()
    override suspend fun getAvailability(
        slug: String,
        branchId: String,
        serviceIds: String,
        staffProfileId: String?,
        date: String?,
        fromDate: String?,
        toDate: String?,
    ): Response<ApiSuccessEnvelope<AvailabilityResultDto>> = notImplemented()

    private fun notImplemented(): Nothing = throw UnsupportedOperationException("Not needed for this test")
}

private fun business(slug: String) = listOf(
    DiscoveryBusinessSummaryDto(
        organizationId = "org-$slug",
        slug = slug,
        displayName = slug,
        description = null,
        logoImageUrl = null,
        coverImageUrl = null,
        verificationStatus = "VERIFIED",
        categories = emptyList(),
    ),
)

/**
 * Debounced, cancellable search (docs task Phase 5): rapid keystrokes
 * collapse into one search for only the final query, and a newer query
 * genuinely cancels an in-flight older one via `collectLatest` rather
 * than letting a stale response race in after a newer one. Requires a
 * [StandardTestDispatcher] (not the usual eager Unconfined one) so the
 * test can control virtual time around the 300ms debounce window itself.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class DiscoveryViewModelTest {
    private val testDispatcher = StandardTestDispatcher()

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule(testDispatcher)

    private val context: Context = ApplicationProvider.getApplicationContext()
    private lateinit var discoveryApi: FakeDiscoveryApi
    private lateinit var viewModel: DiscoveryViewModel

    private fun newViewModel() = DiscoveryViewModel(
        discoveryRepository = DiscoveryRepository(discoveryApi, Moshi.Builder().build()),
        locationProvider = ApproximateLocationProvider(context),
    )

    @Before
    fun setUp() {
        discoveryApi = FakeDiscoveryApi()
    }

    @Test
    fun `rapid successive query changes are debounced into a single search for only the final value`() = runTest(testDispatcher) {
        viewModel = newViewModel()
        testDispatcher.scheduler.advanceUntilIdle() // let the initial empty-query search settle
        discoveryApi.startedQueries.clear()

        viewModel.onQueryChanged("a")
        testDispatcher.scheduler.advanceTimeBy(100)
        viewModel.onQueryChanged("ab")
        testDispatcher.scheduler.advanceTimeBy(100)
        viewModel.onQueryChanged("abc")
        testDispatcher.scheduler.advanceUntilIdle()

        assertEquals(listOf("abc"), discoveryApi.startedQueries)
        assertTrue(viewModel.state.value.results is ScreenState.Content)
    }

    @Test
    fun `a newer query cancels an in-flight older search rather than letting it race in`() = runTest(testDispatcher) {
        discoveryApi.holdFor["a"] = CompletableDeferred() // never completed -- "a" can only finish if left uncancelled
        viewModel = newViewModel()
        testDispatcher.scheduler.advanceUntilIdle()
        discoveryApi.startedQueries.clear()
        discoveryApi.completedQueries.clear()

        viewModel.onQueryChanged("a")
        testDispatcher.scheduler.advanceTimeBy(301) // debounce fires, search for "a" starts and suspends indefinitely
        testDispatcher.scheduler.runCurrent()
        assertEquals(listOf("a"), discoveryApi.startedQueries) // confirm it is genuinely in flight before superseding it

        viewModel.onQueryChanged("ab") // supersedes the in-flight "a" search
        testDispatcher.scheduler.advanceUntilIdle() // "ab"'s own debounce + search run to completion; "a" is never resumed

        assertEquals(listOf("a", "ab"), discoveryApi.startedQueries)
        assertEquals(listOf("ab"), discoveryApi.completedQueries) // "a" was cancelled before it could complete
        assertTrue(viewModel.state.value.results is ScreenState.Content) // only "ab"'s (the only completed call's) result ever reaches state
    }

    @Test
    fun `an empty result set renders the Empty state, not Content with an empty list`() = runTest(testDispatcher) {
        discoveryApi.resultFor = { emptyList() }
        viewModel = newViewModel()
        testDispatcher.scheduler.advanceUntilIdle()

        assertEquals(ScreenState.Empty, viewModel.state.value.results)
    }

    @Test
    fun `selecting a category triggers a new debounced search scoped to that category`() = runTest(testDispatcher) {
        viewModel = newViewModel()
        testDispatcher.scheduler.advanceUntilIdle()
        discoveryApi.startedQueries.clear()

        viewModel.onCategorySelected("salon")
        testDispatcher.scheduler.advanceUntilIdle()

        assertEquals("salon", viewModel.state.value.selectedCategory)
        assertEquals(1, discoveryApi.startedQueries.size)
    }

    @Test
    fun `loadMore appends the next page onto existing results using the returned cursor`() = runTest(testDispatcher) {
        discoveryApi.resultFor = { cursor -> if (cursor == null) business("first-page") else business("second-page") }
        discoveryApi.pageFor = { cursor -> if (cursor == null) PageInfo(hasMore = true, nextCursor = "cursor-1") else PageInfo(hasMore = false, nextCursor = null) }
        viewModel = newViewModel()
        testDispatcher.scheduler.advanceUntilIdle() // initial search (no cursor) returns page 1 plus a next cursor

        viewModel.loadMore()
        testDispatcher.scheduler.advanceUntilIdle()

        val results = (viewModel.state.value.results as ScreenState.Content).data
        assertEquals(2, results.size)
        assertTrue(!viewModel.state.value.hasMore)
    }
}
