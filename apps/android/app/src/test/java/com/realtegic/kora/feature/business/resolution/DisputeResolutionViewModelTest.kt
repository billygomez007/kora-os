package com.realtegic.kora.feature.business.resolution

import com.realtegic.kora.MainDispatcherRule
import com.realtegic.kora.core.data.PaymentsRepository
import com.realtegic.kora.core.model.ApiMeta
import com.realtegic.kora.core.model.ApiSuccessEnvelope
import com.realtegic.kora.core.model.ConfirmPaymentRequest
import com.realtegic.kora.core.model.DisputePaymentRequest
import com.realtegic.kora.core.model.PaymentDisputeDto
import com.realtegic.kora.core.model.PaymentDisputeResolution
import com.realtegic.kora.core.model.PaymentMethod
import com.realtegic.kora.core.model.PaymentRecordDto
import com.realtegic.kora.core.model.RecordPaymentRequest
import com.realtegic.kora.core.model.ResolvePaymentDisputeRequest
import com.realtegic.kora.core.model.VoidPaymentRequest
import com.realtegic.kora.core.network.PaymentDisputesApi
import com.realtegic.kora.core.network.PaymentsApi
import com.squareup.moshi.Moshi
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import retrofit2.Response

private class FakePaymentsApi : PaymentsApi {
    override suspend fun record(organizationId: String, checkoutId: String, idempotencyKey: String, body: RecordPaymentRequest) = throw NotImplementedError()
    override suspend fun list(organizationId: String, checkoutId: String) = throw NotImplementedError()
    override suspend fun confirm(organizationId: String, paymentId: String, body: ConfirmPaymentRequest) = throw NotImplementedError()
    override suspend fun dispute(organizationId: String, paymentId: String, body: DisputePaymentRequest) = throw NotImplementedError()
    override suspend fun void(organizationId: String, paymentId: String, body: VoidPaymentRequest) = throw NotImplementedError()
    override suspend fun pendingVerifications(organizationId: String) = throw NotImplementedError()
    override suspend fun myVerifications(organizationId: String, status: String?) = throw NotImplementedError()
}

private class FakePaymentDisputesApi : PaymentDisputesApi {
    var getResult: Response<ApiSuccessEnvelope<PaymentDisputeDto>>? = null
    var resolveResult: Response<ApiSuccessEnvelope<PaymentDisputeDto>>? = null
    val resolveCalls = mutableListOf<ResolvePaymentDisputeRequest>()

    override suspend fun list(organizationId: String, status: String?, cursor: String?, limit: Int?): Response<ApiSuccessEnvelope<List<PaymentDisputeDto>>> = throw NotImplementedError()
    override suspend fun get(organizationId: String, disputeId: String) = getResult!!
    override suspend fun resolve(organizationId: String, disputeId: String, body: ResolvePaymentDisputeRequest): Response<ApiSuccessEnvelope<PaymentDisputeDto>> {
        resolveCalls.add(body)
        return resolveResult!!
    }
}

private fun paymentRecord() = PaymentRecordDto(
    id = "payment-1",
    organizationId = "org-1",
    branchId = "branch-1",
    checkoutId = "checkout-1",
    reference = "PAY-1",
    method = PaymentMethod.CASH,
    status = "DISPUTED",
    appliedAmountMinor = 10_000,
    tenderedAmountMinor = null,
    changeMinor = null,
    currency = "GHS",
    externalReference = null,
    note = null,
    recordedByMembershipId = "membership-recorder",
    confirmationRequiredByStaffProfileId = "staff-1",
    confirmedByMembershipId = null,
    recordedAt = "2026-09-01T10:05:00Z",
    confirmedAt = null,
    disputedAt = "2026-09-01T10:10:00Z",
    voidedAt = null,
    voidedByMembershipId = null,
    voidReason = null,
    version = 2,
    createdAt = "2026-09-01T10:05:00Z",
    updatedAt = "2026-09-01T10:10:00Z",
)

private fun dispute(status: String = "OPEN", resolution: String? = null) = PaymentDisputeDto(
    id = "dispute-1",
    organizationId = "org-1",
    paymentRecordId = "payment-1",
    status = status,
    reason = "Amount looks wrong",
    openedByMembershipId = "membership-provider",
    openedAt = "2026-09-01T10:10:00Z",
    resolvedByMembershipId = if (resolution != null) "membership-owner" else null,
    resolvedAt = if (resolution != null) "2026-09-01T10:20:00Z" else null,
    resolution = resolution,
    resolutionNote = null,
    payment = paymentRecord(),
)

/**
 * Covers the owner/manager dispute-resolution contract (docs task Phase
 * 10): rejecting a payment always requires a reason before it ever
 * reaches the network, the override warning must be shown before any
 * resolve request is sent, and a successful resolution's dispute state
 * comes only from what the server actually returned -- never a locally
 * manufactured value.
 */
class DisputeResolutionViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private lateinit var paymentsApi: FakePaymentsApi
    private lateinit var disputesApi: FakePaymentDisputesApi

    private fun newViewModel() = DisputeResolutionDetailViewModel(
        organizationId = "org-1",
        disputeId = "dispute-1",
        repository = PaymentsRepository(paymentsApi, disputesApi, Moshi.Builder().build()),
    )

    @Before
    fun setUp() {
        paymentsApi = FakePaymentsApi()
        disputesApi = FakePaymentDisputesApi().apply {
            getResult = Response.success(ApiSuccessEnvelope(data = dispute(), meta = ApiMeta("req")))
        }
    }

    @Test
    fun `requesting a resolution shows the override warning without calling the network yet`() = runTest {
        val viewModel = newViewModel()

        viewModel.requestResolve(PaymentDisputeResolution.CONFIRM_PAYMENT)

        assertTrue(viewModel.state.value.showOverrideWarning)
        assertTrue(disputesApi.resolveCalls.isEmpty())
    }

    @Test
    fun `dismissing the override warning cancels the pending resolution without calling the network`() = runTest {
        val viewModel = newViewModel()
        viewModel.requestResolve(PaymentDisputeResolution.REJECT_PAYMENT)

        viewModel.dismissOverrideWarning()

        assertFalse(viewModel.state.value.showOverrideWarning)
        assertTrue(disputesApi.resolveCalls.isEmpty())
    }

    @Test
    fun `rejecting a payment with a blank reason is blocked before any network call`() = runTest {
        val viewModel = newViewModel()
        viewModel.requestResolve(PaymentDisputeResolution.REJECT_PAYMENT)

        viewModel.confirmResolve()

        assertNotNull(viewModel.state.value.submitError)
        assertTrue(disputesApi.resolveCalls.isEmpty())
        assertFalse(viewModel.state.value.resolved)
    }

    @Test
    fun `rejecting a payment with a reason resolves and reflects only the server-returned dispute`() = runTest {
        disputesApi.resolveResult = Response.success(
            ApiSuccessEnvelope(data = dispute(status = "RESOLVED", resolution = PaymentDisputeResolution.REJECT_PAYMENT), meta = ApiMeta("req-2")),
        )
        val viewModel = newViewModel()
        viewModel.onResolutionNoteChanged("Confirmed the amount was recorded wrong")
        viewModel.requestResolve(PaymentDisputeResolution.REJECT_PAYMENT)

        viewModel.confirmResolve()

        assertEquals(1, disputesApi.resolveCalls.size)
        assertEquals(PaymentDisputeResolution.REJECT_PAYMENT, disputesApi.resolveCalls[0].resolution)
        assertEquals("Confirmed the amount was recorded wrong", disputesApi.resolveCalls[0].resolutionNote)
        assertTrue(viewModel.state.value.resolved)
        val resolvedDispute = (viewModel.state.value.dispute as com.realtegic.kora.core.designsystem.ScreenState.Content).data
        assertEquals("RESOLVED", resolvedDispute.status)
    }

    @Test
    fun `confirming a payment override never requires a resolution reason`() = runTest {
        disputesApi.resolveResult = Response.success(
            ApiSuccessEnvelope(data = dispute(status = "RESOLVED", resolution = PaymentDisputeResolution.CONFIRM_PAYMENT), meta = ApiMeta("req-2")),
        )
        val viewModel = newViewModel()
        viewModel.requestResolve(PaymentDisputeResolution.CONFIRM_PAYMENT)

        viewModel.confirmResolve()

        assertEquals(1, disputesApi.resolveCalls.size)
        assertTrue(viewModel.state.value.resolved)
    }
}
