package com.realtegic.kora.feature.business.walkin

import com.realtegic.kora.MainDispatcherRule
import com.realtegic.kora.core.data.QueueRepository
import com.realtegic.kora.core.data.ServiceCatalogueRepository
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.ApiMeta
import com.realtegic.kora.core.model.ApiSuccessEnvelope
import com.realtegic.kora.core.model.AssignQueueStaffRequest
import com.realtegic.kora.core.model.AssignStaffServiceRequest
import com.realtegic.kora.core.model.BranchServiceDto
import com.realtegic.kora.core.model.CancelQueueEntryRequest
import com.realtegic.kora.core.model.CreateServiceCategoryRequest
import com.realtegic.kora.core.model.CreateServiceRequest
import com.realtegic.kora.core.model.CreateWalkInRequest
import com.realtegic.kora.core.model.QueueEntryDto
import com.realtegic.kora.core.model.ServiceDto
import com.realtegic.kora.core.model.StartServiceSessionRequest
import com.realtegic.kora.core.model.UpsertBranchServiceRequest
import com.realtegic.kora.core.network.QueueApi
import com.realtegic.kora.core.network.ServiceCatalogueApi
import com.squareup.moshi.Moshi
import kotlinx.coroutines.test.runTest
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import retrofit2.Response

private class FakeServiceCatalogueApi : ServiceCatalogueApi {
    var branchServicesResult: Response<ApiSuccessEnvelope<List<BranchServiceDto>>> =
        Response.success(ApiSuccessEnvelope(data = listOf(branchService("service-1")), meta = ApiMeta("req")))

    override suspend fun listCategories(organizationId: String, includeArchived: Boolean?) = throw NotImplementedError()
    override suspend fun createCategory(organizationId: String, body: CreateServiceCategoryRequest) = throw NotImplementedError()
    override suspend fun archiveCategory(organizationId: String, categoryId: String) = throw NotImplementedError()
    override suspend fun listServices(organizationId: String, includeArchived: Boolean?, serviceCategoryId: String?) = throw NotImplementedError()
    override suspend fun createService(organizationId: String, body: CreateServiceRequest) = throw NotImplementedError()
    override suspend fun archiveService(organizationId: String, serviceId: String) = throw NotImplementedError()
    override suspend fun restoreService(organizationId: String, serviceId: String) = throw NotImplementedError()
    override suspend fun listBranchServices(organizationId: String, branchId: String) = branchServicesResult
    override suspend fun upsertBranchService(organizationId: String, branchId: String, serviceId: String, body: UpsertBranchServiceRequest) = throw NotImplementedError()
    override suspend fun listStaffAssignments(organizationId: String, branchId: String, serviceId: String) = throw NotImplementedError()
    override suspend fun assignStaff(organizationId: String, branchId: String, serviceId: String, body: AssignStaffServiceRequest) = throw NotImplementedError()
    override suspend fun unassignStaff(organizationId: String, branchId: String, serviceId: String, staffProfileId: String) = throw NotImplementedError()
}

private class FakeQueueApi : QueueApi {
    val createWalkInCalls = mutableListOf<Pair<String?, CreateWalkInRequest>>()
    val createWalkInResults = ArrayDeque<Response<ApiSuccessEnvelope<QueueEntryDto>>>()

    override suspend fun createWalkIn(organizationId: String, branchId: String, idempotencyKey: String?, body: CreateWalkInRequest): Response<ApiSuccessEnvelope<QueueEntryDto>> {
        createWalkInCalls.add(idempotencyKey to body)
        return createWalkInResults.removeFirst()
    }

    override suspend fun getQueue(organizationId: String, branchId: String, businessDate: String?, status: String?, assignedStaffProfileId: String?) = throw NotImplementedError()
    override suspend fun getQueueEntry(organizationId: String, queueEntryId: String) = throw NotImplementedError()
    override suspend fun call(organizationId: String, queueEntryId: String) = throw NotImplementedError()
    override suspend fun returnToWaiting(organizationId: String, queueEntryId: String) = throw NotImplementedError()
    override suspend fun assign(organizationId: String, queueEntryId: String, body: AssignQueueStaffRequest) = throw NotImplementedError()
    override suspend fun cancelEntry(organizationId: String, queueEntryId: String, body: CancelQueueEntryRequest) = throw NotImplementedError()
    override suspend fun noShowEntry(organizationId: String, queueEntryId: String) = throw NotImplementedError()
    override suspend fun startService(organizationId: String, queueEntryId: String, body: StartServiceSessionRequest) = throw NotImplementedError()
}

private fun branchService(serviceId: String) = BranchServiceDto(
    branchId = "branch-1",
    serviceId = serviceId,
    isEnabled = true,
    priceOverrideMinor = null,
    durationOverrideMinutes = null,
    isBookableByCustomerOverride = null,
    service = ServiceDto(
        id = serviceId,
        organizationId = "org-1",
        serviceCategoryId = null,
        name = "Haircut",
        description = null,
        durationMinutes = 30,
        priceMinor = 5_000,
        currency = "GHS",
        pricingType = "FIXED",
        isBookableByCustomer = true,
        sortOrder = 0,
        archivedAt = null,
    ),
)

private fun queueEntry(id: String = "queue-entry-1") = QueueEntryDto(
    id = id,
    organizationId = "org-1",
    branchId = "branch-1",
    businessDate = "2026-09-01",
    ticketNumber = 42,
    source = "WALK_IN",
    appointmentId = null,
    customerRecordId = "customer-1",
    customerName = "Walk-in Customer",
    customerPhoneE164 = null,
    status = "WAITING",
    priority = "NORMAL",
    assignedStaffProfileId = null,
    notes = null,
    joinedAt = "2026-09-01T10:00:00Z",
    calledAt = null,
    serviceStartedAt = null,
    completedAt = null,
    cancelledAt = null,
    noShowAt = null,
    version = 1,
    createdAt = "2026-09-01T10:00:00Z",
    updatedAt = "2026-09-01T10:00:00Z",
    services = emptyList(),
)

/**
 * Covers the walk-in intake idempotency contract (docs task Phase 4):
 * one stable Idempotency-Key must survive a retry of the exact same
 * submission, and a new key must be minted the moment the user actually
 * changes what they are submitting -- the same discipline verified for
 * checkout and payment recording.
 */
class WalkInViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private lateinit var queueApi: FakeQueueApi
    private lateinit var serviceCatalogueApi: FakeServiceCatalogueApi

    private fun newViewModel() = WalkInViewModel(
        organizationId = "org-1",
        branchId = "branch-1",
        queueRepository = QueueRepository(queueApi, Moshi.Builder().build()),
        serviceCatalogueRepository = ServiceCatalogueRepository(serviceCatalogueApi, Moshi.Builder().build()),
    )

    @Before
    fun setUp() {
        queueApi = FakeQueueApi()
        serviceCatalogueApi = FakeServiceCatalogueApi()
    }

    @Test
    fun `loads only enabled branch services`() = runTest {
        serviceCatalogueApi.branchServicesResult = Response.success(
            ApiSuccessEnvelope(
                data = listOf(branchService("service-1"), branchService("service-2").copy(isEnabled = false)),
                meta = ApiMeta("req"),
            ),
        )
        val viewModel = newViewModel()

        val services = (viewModel.state.value.branchServices as ScreenState.Content).data
        assertEquals(1, services.size)
        assertEquals("service-1", services[0].serviceId)
    }

    @Test
    fun `a blank customer name is rejected before any network call`() = runTest {
        val viewModel = newViewModel()
        viewModel.toggleService("service-1")
        viewModel.submit()

        assertNotNull(viewModel.state.value.submitError)
        assertTrue(queueApi.createWalkInCalls.isEmpty())
    }

    @Test
    fun `no selected service is rejected before any network call`() = runTest {
        val viewModel = newViewModel()
        viewModel.onNameChanged("Ama Mensah")
        viewModel.submit()

        assertNotNull(viewModel.state.value.submitError)
        assertTrue(queueApi.createWalkInCalls.isEmpty())
    }

    @Test
    fun `retrying an unchanged submission reuses the same idempotency key`() = runTest {
        queueApi.createWalkInResults.addLast(
            Response.error(
                503,
                """{"error":{"code":"SERVER_UNAVAILABLE","message":"try again","retryable":true},"meta":{"requestId":"x"}}"""
                    .toResponseBody("application/json".toMediaType()),
            ),
        )
        queueApi.createWalkInResults.addLast(Response.success(ApiSuccessEnvelope(data = queueEntry(), meta = ApiMeta("req-2"))))

        val viewModel = newViewModel()
        viewModel.onNameChanged("Ama Mensah")
        viewModel.toggleService("service-1")

        viewModel.submit()
        assertNotNull(viewModel.state.value.submitError)
        viewModel.submit()

        assertEquals(2, queueApi.createWalkInCalls.size)
        assertEquals(queueApi.createWalkInCalls[0].first, queueApi.createWalkInCalls[1].first)
        assertNotNull(viewModel.state.value.createdEntry)
    }

    @Test
    fun `changing the selected services before retrying mints a new idempotency key`() = runTest {
        queueApi.createWalkInResults.addLast(
            Response.error(
                503,
                """{"error":{"code":"SERVER_UNAVAILABLE","message":"try again","retryable":true},"meta":{"requestId":"x"}}"""
                    .toResponseBody("application/json".toMediaType()),
            ),
        )
        queueApi.createWalkInResults.addLast(Response.success(ApiSuccessEnvelope(data = queueEntry(), meta = ApiMeta("req-2"))))

        val viewModel = newViewModel()
        viewModel.onNameChanged("Ama Mensah")
        viewModel.toggleService("service-1")
        viewModel.submit()
        assertNotNull(viewModel.state.value.submitError)

        viewModel.toggleService("service-2")
        viewModel.submit()

        assertEquals(2, queueApi.createWalkInCalls.size)
        assertTrue(queueApi.createWalkInCalls[0].first != queueApi.createWalkInCalls[1].first)
    }
}
