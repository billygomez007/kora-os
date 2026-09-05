package com.realtegic.kora.feature.business.verifications

import com.realtegic.kora.MainDispatcherRule
import com.realtegic.kora.core.data.PaymentsRepository
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.ApiMeta
import com.realtegic.kora.core.model.ApiSuccessEnvelope
import com.realtegic.kora.core.model.ConfirmPaymentRequest
import com.realtegic.kora.core.model.DisputePaymentRequest
import com.realtegic.kora.core.model.PaymentDisputeDto
import com.realtegic.kora.core.model.PaymentMethod
import com.realtegic.kora.core.model.PaymentRecordDto
import com.realtegic.kora.core.model.RecordPaymentRequest
import com.realtegic.kora.core.model.ResolvePaymentDisputeRequest
import com.realtegic.kora.core.model.VoidPaymentRequest
import com.realtegic.kora.core.network.DomainError
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

private class FakePaymentsApi : PaymentsApi {
    val myVerificationsCalls = mutableListOf<String?>()
    var myVerificationsResult: Response<ApiSuccessEnvelope<List<PaymentRecordDto>>> =
        Response.success(ApiSuccessEnvelope(data = emptyList(), meta = ApiMeta("req")))
    var confirmResult: Response<ApiSuccessEnvelope<PaymentRecordDto>>? = null
    var disputeResult: Response<ApiSuccessEnvelope<PaymentRecordDto>>? = null
    val disputeCalls = mutableListOf<DisputePaymentRequest>()

    override suspend fun record(organizationId: String, checkoutId: String, idempotencyKey: String, body: RecordPaymentRequest) = throw NotImplementedError()
    override suspend fun list(organizationId: String, checkoutId: String) = throw NotImplementedError()
    override suspend fun confirm(organizationId: String, paymentId: String, body: ConfirmPaymentRequest) = confirmResult!!
    override suspend fun dispute(organizationId: String, paymentId: String, body: DisputePaymentRequest): Response<ApiSuccessEnvelope<PaymentRecordDto>> {
        disputeCalls.add(body)
        return disputeResult!!
    }
    override suspend fun void(organizationId: String, paymentId: String, body: VoidPaymentRequest) = throw NotImplementedError()
    override suspend fun pendingVerifications(organizationId: String) = throw NotImplementedError()
    override suspend fun myVerifications(organizationId: String, status: String?): Response<ApiSuccessEnvelope<List<PaymentRecordDto>>> {
        myVerificationsCalls.add(status)
        return myVerificationsResult
    }
}

private class FakePaymentDisputesApi : PaymentDisputesApi {
    override suspend fun list(organizationId: String, status: String?, cursor: String?, limit: Int?): Response<ApiSuccessEnvelope<List<PaymentDisputeDto>>> = throw NotImplementedError()
    override suspend fun get(organizationId: String, disputeId: String) = throw NotImplementedError()
    override suspend fun resolve(organizationId: String, disputeId: String, body: ResolvePaymentDisputeRequest) = throw NotImplementedError()
}

private fun paymentRecord(id: String = "payment-1") = PaymentRecordDto(
    id = id,
    organizationId = "org-1",
    branchId = "branch-1",
    checkoutId = "checkout-1",
    reference = "PAY-1",
    method = PaymentMethod.CASH,
    status = "RECORDED",
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
    disputedAt = null,
    voidedAt = null,
    voidedByMembershipId = null,
    voidReason = null,
    version = 1,
    createdAt = "2026-09-01T10:05:00Z",
    updatedAt = "2026-09-01T10:05:00Z",
)

/**
 * Covers the provider verification contract (docs task Phase 9): status
 * is never updated optimistically -- every confirm/dispute outcome,
 * success or failure, ends in a fresh reload of the authoritative list
 * -- and a blank dispute reason must never reach the network.
 */
class VerificationsViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private lateinit var paymentsApi: FakePaymentsApi

    private fun newViewModel() = VerificationsViewModel(
        organizationId = "org-1",
        repository = PaymentsRepository(paymentsApi, FakePaymentDisputesApi(), Moshi.Builder().build()),
    )

    @Before
    fun setUp() {
        paymentsApi = FakePaymentsApi()
    }

    @Test
    fun `each tab requests the matching server-side status filter`() = runTest {
        val viewModel = newViewModel()
        assertEquals(listOf("RECORDED"), paymentsApi.myVerificationsCalls)

        viewModel.selectTab(VerificationTab.DISPUTED)
        viewModel.selectTab(VerificationTab.RESOLVED)

        assertEquals(listOf("RECORDED", "DISPUTED", "CONFIRMED"), paymentsApi.myVerificationsCalls)
    }

    @Test
    fun `a self-confirmation-forbidden failure surfaces the error and reloads instead of marking it confirmed`() = runTest {
        paymentsApi.myVerificationsResult = Response.success(ApiSuccessEnvelope(data = listOf(paymentRecord()), meta = ApiMeta("req")))
        paymentsApi.confirmResult = Response.error(
            403,
            """{"error":{"code":"PAYMENT_SELF_CONFIRMATION_FORBIDDEN","message":"cannot confirm your own recording","retryable":false},"meta":{"requestId":"x"}}"""
                .toResponseBody("application/json".toMediaType()),
        )
        val viewModel = newViewModel()
        val callsBeforeConfirm = paymentsApi.myVerificationsCalls.size

        viewModel.confirm("payment-1")

        assertTrue(viewModel.state.value.actionError is DomainError.Forbidden)
        assertEquals("PAYMENT_SELF_CONFIRMATION_FORBIDDEN", (viewModel.state.value.actionError as DomainError.Forbidden).code)
        assertNull(viewModel.state.value.pendingActionPaymentId)
        assertTrue(paymentsApi.myVerificationsCalls.size > callsBeforeConfirm)
    }

    @Test
    fun `confirming is a no-op while another action is already pending`() = runTest {
        val viewModel = newViewModel()
        viewModel.confirm("payment-1")
        val pendingBefore = viewModel.state.value.pendingActionPaymentId

        viewModel.confirm("payment-2")

        assertEquals(pendingBefore, viewModel.state.value.pendingActionPaymentId)
    }

    @Test
    fun `a blank dispute reason never reaches the network`() = runTest {
        val viewModel = newViewModel()
        viewModel.showDisputeForm("payment-1")
        viewModel.onDisputeReasonChanged("   ")

        viewModel.submitDispute()

        assertNotNull(viewModel.state.value.actionError)
        assertTrue(paymentsApi.disputeCalls.isEmpty())
    }

    @Test
    fun `a successful dispute reloads the authoritative list`() = runTest {
        paymentsApi.disputeResult = Response.success(ApiSuccessEnvelope(data = paymentRecord().copy(status = "DISPUTED"), meta = ApiMeta("req-2")))
        val viewModel = newViewModel()
        val callsBefore = paymentsApi.myVerificationsCalls.size

        viewModel.showDisputeForm("payment-1")
        viewModel.onDisputeReasonChanged("Amount looks wrong")
        viewModel.submitDispute()

        assertEquals(1, paymentsApi.disputeCalls.size)
        assertEquals("Amount looks wrong", paymentsApi.disputeCalls[0].reason)
        assertTrue(paymentsApi.myVerificationsCalls.size > callsBefore)
        assertNull(viewModel.state.value.pendingActionPaymentId)
    }
}
