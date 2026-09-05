package com.realtegic.kora.feature.business.checkout

import com.realtegic.kora.MainDispatcherRule
import com.realtegic.kora.core.data.CheckoutsRepository
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.ApiMeta
import com.realtegic.kora.core.model.ApiSuccessEnvelope
import com.realtegic.kora.core.model.CheckoutAdjustmentType
import com.realtegic.kora.core.model.CheckoutDto
import com.realtegic.kora.core.model.CreateCheckoutAdjustmentRequest
import com.realtegic.kora.core.model.VoidCheckoutRequest
import com.realtegic.kora.core.network.CheckoutsApi
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

private class FakeCheckoutsApi : CheckoutsApi {
    val createCalls = mutableListOf<String>()
    var createResult: Response<ApiSuccessEnvelope<CheckoutDto>>? = null
    var listResult: Response<ApiSuccessEnvelope<List<CheckoutDto>>> = Response.success(ApiSuccessEnvelope(data = emptyList(), meta = ApiMeta("req")))
    var addAdjustmentResult: Response<ApiSuccessEnvelope<CheckoutDto>>? = null
    val addAdjustmentCalls = mutableListOf<CreateCheckoutAdjustmentRequest>()

    override suspend fun create(organizationId: String, serviceSessionId: String, idempotencyKey: String): Response<ApiSuccessEnvelope<CheckoutDto>> {
        createCalls.add(idempotencyKey)
        return createResult!!
    }
    override suspend fun list(
        organizationId: String,
        branchId: String?,
        status: String?,
        assignedStaffProfileId: String?,
        customerRecordId: String?,
        serviceSessionId: String?,
        cursor: String?,
        limit: Int?,
    ) = listResult
    override suspend fun get(organizationId: String, checkoutId: String) = throw NotImplementedError()
    override suspend fun addAdjustment(organizationId: String, checkoutId: String, body: CreateCheckoutAdjustmentRequest): Response<ApiSuccessEnvelope<CheckoutDto>> {
        addAdjustmentCalls.add(body)
        return addAdjustmentResult!!
    }
    override suspend fun void(organizationId: String, checkoutId: String, body: VoidCheckoutRequest) = throw NotImplementedError()
}

private fun checkout(status: String = "READY_TO_SETTLE", totalMinor: Long = 10_000, adjustments: List<com.realtegic.kora.core.model.CheckoutAdjustmentDto> = emptyList()) = CheckoutDto(
    id = "checkout-1",
    organizationId = "org-1",
    branchId = "branch-1",
    serviceSessionId = "session-1",
    customerRecordId = null,
    assignedStaffProfileId = "staff-1",
    reference = "CHK-1",
    status = status,
    currency = "GHS",
    subtotalMinor = totalMinor,
    adjustmentTotalMinor = adjustments.sumOf { it.amountMinor },
    totalMinor = totalMinor,
    version = 1,
    createdByMembershipId = "membership-1",
    createdAt = "2026-09-01T10:00:00Z",
    updatedAt = "2026-09-01T10:00:00Z",
    settledAt = null,
    voidedAt = null,
    voidedByMembershipId = null,
    voidReason = null,
    items = emptyList(),
    adjustments = adjustments,
)

/**
 * Covers checkout creation's idempotency and conflict-recovery contract
 * (docs task Phase 7): the create idempotency key is generated exactly
 * once and reused for the ViewModel's lifetime, and a
 * CHECKOUT_ALREADY_EXISTS conflict must retrieve and display the real
 * existing checkout rather than ever fabricating a local duplicate.
 * Adjustment submission must also reject an invalid amount or a blank
 * reason before any network call.
 */
class CheckoutViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private lateinit var checkoutsApi: FakeCheckoutsApi

    private fun newViewModel(accessMode: String = "FULL") = CheckoutViewModel(
        organizationId = "org-1",
        serviceSessionId = "session-1",
        accessMode = accessMode,
        repository = CheckoutsRepository(checkoutsApi, Moshi.Builder().build()),
    )

    @Before
    fun setUp() {
        checkoutsApi = FakeCheckoutsApi()
    }

    @Test
    fun `a successful create uses exactly one idempotency key`() = runTest {
        checkoutsApi.createResult = Response.success(ApiSuccessEnvelope(data = checkout(), meta = ApiMeta("req")))
        val viewModel = newViewModel()

        assertEquals(1, checkoutsApi.createCalls.size)
        assertTrue(viewModel.state.value.checkout is ScreenState.Content)
    }

    @Test
    fun `a CHECKOUT_ALREADY_EXISTS conflict retrieves and displays the real existing checkout, never a fabricated one`() = runTest {
        checkoutsApi.createResult = Response.error(
            409,
            """{"error":{"code":"CHECKOUT_ALREADY_EXISTS","message":"already exists","retryable":false},"meta":{"requestId":"x"}}"""
                .toResponseBody("application/json".toMediaType()),
        )
        val existing = checkout(totalMinor = 25_000)
        checkoutsApi.listResult = Response.success(ApiSuccessEnvelope(data = listOf(existing), meta = ApiMeta("req")))

        val viewModel = newViewModel()

        val content = viewModel.state.value.checkout as ScreenState.Content
        assertEquals(existing.id, content.data.id)
        assertEquals(25_000L, content.data.totalMinor)
    }

    @Test
    fun `a non-conflict create failure surfaces as an error, never a fabricated checkout`() = runTest {
        checkoutsApi.createResult = Response.error(
            500,
            """{"error":{"code":"INTERNAL","message":"boom","retryable":true},"meta":{"requestId":"x"}}"""
                .toResponseBody("application/json".toMediaType()),
        )
        val viewModel = newViewModel()

        assertTrue(viewModel.state.value.checkout is ScreenState.Error)
    }

    @Test
    fun `an adjustment with a non-positive amount is rejected before any network call`() = runTest {
        checkoutsApi.createResult = Response.success(ApiSuccessEnvelope(data = checkout(), meta = ApiMeta("req")))
        val viewModel = newViewModel()

        viewModel.showAdjustmentForm()
        viewModel.onAdjustmentAmountChanged("0")
        viewModel.onAdjustmentReasonChanged("Loyalty discount")
        viewModel.submitAdjustment()

        assertTrue(checkoutsApi.addAdjustmentCalls.isEmpty())
        assertEquals(true, viewModel.state.value.showAdjustmentForm)
    }

    @Test
    fun `an adjustment with a blank reason is rejected before any network call`() = runTest {
        checkoutsApi.createResult = Response.success(ApiSuccessEnvelope(data = checkout(), meta = ApiMeta("req")))
        val viewModel = newViewModel()

        viewModel.showAdjustmentForm()
        viewModel.onAdjustmentAmountChanged("5.00")
        viewModel.onAdjustmentReasonChanged("   ")
        viewModel.submitAdjustment()

        assertTrue(checkoutsApi.addAdjustmentCalls.isEmpty())
    }

    @Test
    fun `a READ_ONLY workspace never submits an adjustment even if the form is somehow filled`() = runTest {
        checkoutsApi.createResult = Response.success(ApiSuccessEnvelope(data = checkout(), meta = ApiMeta("req")))
        val viewModel = newViewModel(accessMode = "READ_ONLY")

        viewModel.showAdjustmentForm()
        viewModel.onAdjustmentAmountChanged("5.00")
        viewModel.onAdjustmentReasonChanged("Loyalty discount")
        viewModel.submitAdjustment()

        assertTrue(checkoutsApi.addAdjustmentCalls.isEmpty())
        assertEquals(true, viewModel.state.value.isReadOnly)
    }

    @Test
    fun `a valid adjustment reflects only the server-recalculated checkout totals`() = runTest {
        checkoutsApi.createResult = Response.success(ApiSuccessEnvelope(data = checkout(), meta = ApiMeta("req")))
        val adjusted = checkout(
            totalMinor = 9_500,
            adjustments = listOf(
                com.realtegic.kora.core.model.CheckoutAdjustmentDto("adj-1", CheckoutAdjustmentType.DISCOUNT, 500, "Loyalty discount", "membership-1", "2026-09-01T10:05:00Z"),
            ),
        )
        checkoutsApi.addAdjustmentResult = Response.success(ApiSuccessEnvelope(data = adjusted, meta = ApiMeta("req-2")))
        val viewModel = newViewModel()

        viewModel.showAdjustmentForm()
        viewModel.onAdjustmentAmountChanged("5.00")
        viewModel.onAdjustmentReasonChanged("Loyalty discount")
        viewModel.submitAdjustment()

        assertEquals(1, checkoutsApi.addAdjustmentCalls.size)
        val content = viewModel.state.value.checkout as ScreenState.Content
        assertEquals(9_500L, content.data.totalMinor)
        assertEquals(false, viewModel.state.value.showAdjustmentForm)
    }
}
