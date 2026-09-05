package com.realtegic.kora.feature.business.payments

import com.realtegic.kora.MainDispatcherRule
import com.realtegic.kora.core.data.CashPolicyRepository
import com.realtegic.kora.core.data.CheckoutsRepository
import com.realtegic.kora.core.data.PaymentsRepository
import com.realtegic.kora.core.model.ApiMeta
import com.realtegic.kora.core.model.ApiSuccessEnvelope
import com.realtegic.kora.core.model.CashPolicyDto
import com.realtegic.kora.core.model.CashPolicyMode
import com.realtegic.kora.core.model.CheckoutDto
import com.realtegic.kora.core.model.ConfirmPaymentRequest
import com.realtegic.kora.core.model.DisputePaymentRequest
import com.realtegic.kora.core.model.PaymentDisputeDto
import com.realtegic.kora.core.model.PaymentMethod
import com.realtegic.kora.core.model.PaymentRecordDto
import com.realtegic.kora.core.model.RecordPaymentRequest
import com.realtegic.kora.core.model.ResolvePaymentDisputeRequest
import com.realtegic.kora.core.model.UpdateCashPolicyRequest
import com.realtegic.kora.core.model.VoidPaymentRequest
import com.realtegic.kora.core.network.CashPolicyApi
import com.realtegic.kora.core.network.CheckoutsApi
import com.realtegic.kora.core.network.PaymentDisputesApi
import com.realtegic.kora.core.network.PaymentsApi
import com.squareup.moshi.Moshi
import kotlinx.coroutines.test.runTest
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import retrofit2.Response

private class FakeCheckoutsApi : CheckoutsApi {
    var getResult: Response<ApiSuccessEnvelope<CheckoutDto>>? = null
    override suspend fun create(organizationId: String, serviceSessionId: String, idempotencyKey: String) = throw NotImplementedError()
    override suspend fun list(
        organizationId: String,
        branchId: String?,
        status: String?,
        assignedStaffProfileId: String?,
        customerRecordId: String?,
        serviceSessionId: String?,
        cursor: String?,
        limit: Int?,
    ) = throw NotImplementedError()
    override suspend fun get(organizationId: String, checkoutId: String) = getResult!!
    override suspend fun addAdjustment(organizationId: String, checkoutId: String, body: com.realtegic.kora.core.model.CreateCheckoutAdjustmentRequest) = throw NotImplementedError()
    override suspend fun void(organizationId: String, checkoutId: String, body: com.realtegic.kora.core.model.VoidCheckoutRequest) = throw NotImplementedError()
}

private class FakePaymentsApi : PaymentsApi {
    var listResult: Response<ApiSuccessEnvelope<List<PaymentRecordDto>>> =
        Response.success(ApiSuccessEnvelope(data = emptyList(), meta = ApiMeta("req-list")))
    val recordCalls = mutableListOf<Pair<String, RecordPaymentRequest>>()
    val recordResults = ArrayDeque<Response<ApiSuccessEnvelope<PaymentRecordDto>>>()

    override suspend fun record(organizationId: String, checkoutId: String, idempotencyKey: String, body: RecordPaymentRequest): Response<ApiSuccessEnvelope<PaymentRecordDto>> {
        recordCalls.add(idempotencyKey to body)
        return recordResults.removeFirst()
    }

    override suspend fun list(organizationId: String, checkoutId: String) = listResult
    override suspend fun confirm(organizationId: String, paymentId: String, body: ConfirmPaymentRequest) = throw NotImplementedError()
    override suspend fun dispute(organizationId: String, paymentId: String, body: DisputePaymentRequest) = throw NotImplementedError()
    override suspend fun void(organizationId: String, paymentId: String, body: VoidPaymentRequest) = throw NotImplementedError()
    override suspend fun pendingVerifications(organizationId: String) = throw NotImplementedError()
    override suspend fun myVerifications(organizationId: String, status: String?) = throw NotImplementedError()
}

private class FakePaymentDisputesApi : PaymentDisputesApi {
    override suspend fun list(organizationId: String, status: String?, cursor: String?, limit: Int?): Response<ApiSuccessEnvelope<List<PaymentDisputeDto>>> = throw NotImplementedError()
    override suspend fun get(organizationId: String, disputeId: String) = throw NotImplementedError()
    override suspend fun resolve(organizationId: String, disputeId: String, body: ResolvePaymentDisputeRequest) = throw NotImplementedError()
}

private class FakeCashPolicyApi : CashPolicyApi {
    var result: Response<ApiSuccessEnvelope<CashPolicyDto>>? = null
    override suspend fun get(organizationId: String, branchId: String) = result!!
    override suspend fun update(organizationId: String, branchId: String, body: UpdateCashPolicyRequest) = throw NotImplementedError()
}

private fun checkout(status: String = "READY_TO_SETTLE", totalMinor: Long = 10_000, currency: String = "GHS") = CheckoutDto(
    id = "checkout-1",
    organizationId = "org-1",
    branchId = "branch-1",
    serviceSessionId = "session-1",
    customerRecordId = null,
    assignedStaffProfileId = "staff-1",
    reference = "CHK-1",
    status = status,
    currency = currency,
    subtotalMinor = totalMinor,
    adjustmentTotalMinor = 0,
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
    adjustments = emptyList(),
)

private fun paymentRecord(appliedAmountMinor: Long = 10_000) = PaymentRecordDto(
    id = "payment-1",
    organizationId = "org-1",
    branchId = "branch-1",
    checkoutId = "checkout-1",
    reference = "PAY-1",
    method = PaymentMethod.CASH,
    status = "RECORDED",
    appliedAmountMinor = appliedAmountMinor,
    tenderedAmountMinor = null,
    changeMinor = null,
    currency = "GHS",
    externalReference = null,
    note = null,
    recordedByMembershipId = "membership-1",
    confirmationRequiredByStaffProfileId = "staff-1",
    confirmedByMembershipId = null,
    recordedAt = "2026-09-01T10:05:00Z",
    confirmedAt = null,
    disputedAt = null,
    voidedAt = null,
    voidedByMembershipId = null,
    voidReason = null,
    version = 1,
    createdAt = "2026-09-01T10:05:00Z",
    updatedAt = "2026-09-01T10:05:00Z",
)

/**
 * Covers the two locked-rule-relevant behaviors of manual payment
 * recording (docs task Phase 8): a REQUIRED cash policy must never be
 * bypassable from the client, and a retried submission of the exact same
 * request must reuse one Idempotency-Key rather than minting a new one
 * per tap -- while a submission the user actually changed must not reuse
 * a stale key.
 */
class RecordPaymentViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private lateinit var checkoutsApi: FakeCheckoutsApi
    private lateinit var paymentsApi: FakePaymentsApi
    private lateinit var cashPolicyApi: FakeCashPolicyApi

    private fun newViewModel() = RecordPaymentViewModel(
        organizationId = "org-1",
        branchId = "branch-1",
        checkoutId = "checkout-1",
        checkoutsRepository = CheckoutsRepository(checkoutsApi, Moshi.Builder().build()),
        paymentsRepository = PaymentsRepository(paymentsApi, FakePaymentDisputesApi(), Moshi.Builder().build()),
        cashPolicyRepository = CashPolicyRepository(cashPolicyApi, Moshi.Builder().build()),
    )

    @Before
    fun setUp() {
        checkoutsApi = FakeCheckoutsApi().apply { getResult = Response.success(ApiSuccessEnvelope(data = checkout(), meta = ApiMeta("req"))) }
        paymentsApi = FakePaymentsApi()
        cashPolicyApi = FakeCashPolicyApi().apply { result = Response.success(ApiSuccessEnvelope(data = CashPolicyDto("policy-1", "org-1", "branch-1", CashPolicyMode.OPTIONAL, "membership-1", "2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z"), meta = ApiMeta("req"))) }
    }

    @Test
    fun `a REQUIRED cash policy blocks a cash submission client-side without ever calling record`() = runTest {
        cashPolicyApi.result = Response.success(
            ApiSuccessEnvelope(data = CashPolicyDto("policy-1", "org-1", "branch-1", CashPolicyMode.REQUIRED, "membership-1", "2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z"), meta = ApiMeta("req")),
        )
        val viewModel = newViewModel()
        viewModel.onMethodChanged(PaymentMethod.CASH)
        viewModel.onAmountChanged("100.00")

        viewModel.submit()

        assertNotNull(viewModel.state.value.submitError)
        assertTrue(paymentsApi.recordCalls.isEmpty())
        assertNull(viewModel.state.value.recorded)
    }

    @Test
    fun `a blank amount is rejected before any network call`() = runTest {
        val viewModel = newViewModel()
        viewModel.onMethodChanged(PaymentMethod.MOBILE_MONEY)
        viewModel.onAmountChanged("")

        viewModel.submit()

        assertNotNull(viewModel.state.value.submitError)
        assertTrue(paymentsApi.recordCalls.isEmpty())
    }

    @Test
    fun `retrying an unchanged submission reuses the same idempotency key`() = runTest {
        paymentsApi.recordResults.addLast(
            Response.error(
                503,
                """{"error":{"code":"SERVER_UNAVAILABLE","message":"try again","retryable":true},"meta":{"requestId":"x"}}"""
                    .toResponseBody("application/json".toMediaType()),
            ),
        )
        paymentsApi.recordResults.addLast(Response.success(ApiSuccessEnvelope(data = paymentRecord(), meta = ApiMeta("req-2"))))

        val viewModel = newViewModel()
        viewModel.onMethodChanged(PaymentMethod.MOBILE_MONEY)
        viewModel.onAmountChanged("100.00")

        viewModel.submit()
        assertNotNull(viewModel.state.value.submitError)
        viewModel.submit()

        assertEquals(2, paymentsApi.recordCalls.size)
        assertEquals(paymentsApi.recordCalls[0].first, paymentsApi.recordCalls[1].first)
        assertNotNull(viewModel.state.value.recorded)
    }

    @Test
    fun `changing the amount before retrying mints a new idempotency key`() = runTest {
        paymentsApi.recordResults.addLast(
            Response.error(
                503,
                """{"error":{"code":"SERVER_UNAVAILABLE","message":"try again","retryable":true},"meta":{"requestId":"x"}}"""
                    .toResponseBody("application/json".toMediaType()),
            ),
        )
        paymentsApi.recordResults.addLast(Response.success(ApiSuccessEnvelope(data = paymentRecord(appliedAmountMinor = 20_000), meta = ApiMeta("req-2"))))

        val viewModel = newViewModel()
        viewModel.onMethodChanged(PaymentMethod.MOBILE_MONEY)
        viewModel.onAmountChanged("100.00")
        viewModel.submit()
        assertNotNull(viewModel.state.value.submitError)

        viewModel.onAmountChanged("200.00")
        viewModel.submit()

        assertEquals(2, paymentsApi.recordCalls.size)
        assertTrue(paymentsApi.recordCalls[0].first != paymentsApi.recordCalls[1].first)
    }
}
