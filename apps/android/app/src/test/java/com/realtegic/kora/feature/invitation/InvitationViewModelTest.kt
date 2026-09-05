package com.realtegic.kora.feature.invitation

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.realtegic.kora.MainDispatcherRule
import com.realtegic.kora.core.data.StaffRepository
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.AcceptInvitationResponseDto
import com.realtegic.kora.core.model.ApiMeta
import com.realtegic.kora.core.model.ApiSuccessEnvelope
import com.realtegic.kora.core.model.AssignableRoleDto
import com.realtegic.kora.core.model.CreateStaffInvitationRequest
import com.realtegic.kora.core.model.CreateStaffInvitationResponseDto
import com.realtegic.kora.core.model.InvitationPreviewDto
import com.realtegic.kora.core.model.StaffDirectoryEntryDto
import com.realtegic.kora.core.model.StaffInvitationListItemDto
import com.realtegic.kora.core.model.StaffInvitationStatus
import com.realtegic.kora.core.network.DomainError
import com.realtegic.kora.core.network.StaffApi
import com.realtegic.kora.core.session.AuthRepository
import com.realtegic.kora.core.session.SessionManager
import com.realtegic.kora.core.session.TokenStore
import com.realtegic.kora.core.model.AuthResultDto
import com.realtegic.kora.core.model.AuthSessionDto
import com.realtegic.kora.core.model.AuthUserDto
import com.realtegic.kora.core.model.MeDto
import com.realtegic.kora.core.model.RefreshRequest
import com.realtegic.kora.core.model.RequestEmailOtpRequest
import com.realtegic.kora.core.model.RequestEmailOtpResponse
import com.realtegic.kora.core.model.SessionSummaryDto
import com.realtegic.kora.core.model.VerifyEmailOtpRequest
import com.realtegic.kora.core.network.AuthApi
import com.squareup.moshi.Moshi
import kotlinx.coroutines.test.runTest
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import retrofit2.Response

private class FakeStaffApi : StaffApi {
    var previewResult: Response<ApiSuccessEnvelope<InvitationPreviewDto>>? = null
    var acceptResult: Response<ApiSuccessEnvelope<AcceptInvitationResponseDto>>? = null
    var rejectResult: Response<Unit>? = null

    override suspend fun getAssignableRoles(organizationId: String): Response<ApiSuccessEnvelope<List<AssignableRoleDto>>> = notImplemented()
    override suspend fun createInvitation(organizationId: String, body: CreateStaffInvitationRequest): Response<ApiSuccessEnvelope<CreateStaffInvitationResponseDto>> = notImplemented()
    override suspend fun listInvitations(organizationId: String, status: String?): Response<ApiSuccessEnvelope<List<StaffInvitationListItemDto>>> = notImplemented()
    override suspend fun revokeInvitation(organizationId: String, invitationId: String): Response<Unit> = notImplemented()
    override suspend fun getInvitationPreview(token: String): Response<ApiSuccessEnvelope<InvitationPreviewDto>> = previewResult!!
    override suspend fun acceptInvitation(token: String): Response<ApiSuccessEnvelope<AcceptInvitationResponseDto>> = acceptResult!!
    override suspend fun rejectInvitation(token: String): Response<Unit> = rejectResult!!
    override suspend fun listStaff(organizationId: String): Response<ApiSuccessEnvelope<List<StaffDirectoryEntryDto>>> = notImplemented()

    private fun notImplemented(): Nothing = throw UnsupportedOperationException("Not needed for this test")
}

private class FakeAuthApi : AuthApi {
    override suspend fun requestOtp(body: RequestEmailOtpRequest) = notImplemented()
    override suspend fun verifyOtp(body: VerifyEmailOtpRequest) = notImplemented()
    override suspend fun refresh(body: RefreshRequest) = notImplemented()
    override suspend fun logout(): Response<Unit> = Response.success(Unit)
    override suspend fun logoutAll(): Response<Unit> = Response.success(Unit)
    override suspend fun me(): Response<ApiSuccessEnvelope<MeDto>> = notImplemented()
    override suspend fun sessions(): Response<ApiSuccessEnvelope<List<SessionSummaryDto>>> = notImplemented()
    override suspend fun revokeSession(sessionId: String): Response<Unit> = notImplemented()
    private fun notImplemented(): Nothing = throw UnsupportedOperationException("Not needed for this test")
}

private fun previewResponse(status: String = StaffInvitationStatus.PENDING, isExpired: Boolean = false) = Response.success(
    ApiSuccessEnvelope(
        data = InvitationPreviewDto(
            organizationName = "Urban Crown Salon",
            roleName = "Manager",
            branchName = "Main Branch",
            status = status,
            expiresAt = "2027-01-01T00:00:00Z",
            isExpired = isExpired,
        ),
        meta = ApiMeta("req-1"),
    ),
)

private fun acceptForbidden() = Response.error<ApiSuccessEnvelope<AcceptInvitationResponseDto>>(
    403,
    """{"error":{"code":"FORBIDDEN","message":"forbidden","retryable":false},"meta":{"requestId":"x"}}"""
        .toResponseBody("application/json".toMediaType()),
)

/**
 * The invitation preview is fetched regardless of auth state, and only
 * accept/reject require it (docs task "Invitation Deep Link and
 * Acceptance"); a 403 on accept means the signed-in account's email did
 * not match the invitation, surfaced as a distinct, specific state
 * rather than a generic failure.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class InvitationViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private val context: Context = ApplicationProvider.getApplicationContext()
    private lateinit var staffApi: FakeStaffApi
    private lateinit var authRepository: AuthRepository

    private fun newViewModel(token: String = "token-123") = InvitationViewModel(token, StaffRepository(staffApi, Moshi.Builder().build()), authRepository)

    @Before
    fun setUp() {
        staffApi = FakeStaffApi()
        val prefs = context.getSharedPreferences("test_invitation_vm_prefs", Context.MODE_PRIVATE)
        prefs.edit().clear().commit()
        val tokenStore = TokenStore(context, prefsProvider = { prefs })
        val sessionManager = SessionManager(tokenStore, FakeAuthApi(), Moshi.Builder().build())
        authRepository = AuthRepository(FakeAuthApi(), sessionManager, Moshi.Builder().build())
    }

    @Test
    fun `loads the safe preview regardless of sign-in state`() = runTest {
        staffApi.previewResult = previewResponse()
        val viewModel = newViewModel()

        val preview = viewModel.state.value.preview as ScreenState.Content
        assertEquals("Urban Crown Salon", preview.data.organizationName)
        assertEquals("Manager", preview.data.roleName)
    }

    @Test
    fun `accepting successfully reports the outcome and the destination organization`() = runTest {
        staffApi.previewResult = previewResponse()
        staffApi.acceptResult = Response.success(
            ApiSuccessEnvelope(data = AcceptInvitationResponseDto(organizationId = "org-1", membershipId = "membership-1"), meta = ApiMeta("req-2")),
        )
        val viewModel = newViewModel()
        var acceptedOrganizationId: String? = null

        viewModel.accept { acceptedOrganizationId = it }

        assertEquals("org-1", acceptedOrganizationId)
        assertEquals(InvitationOutcome.ACCEPTED, viewModel.state.value.outcome)
    }

    @Test
    fun `a 403 on accept surfaces as Forbidden without crashing, for the screen to explain as an email mismatch`() = runTest {
        staffApi.previewResult = previewResponse()
        staffApi.acceptResult = acceptForbidden()
        val viewModel = newViewModel()

        viewModel.accept {}

        assertTrue(viewModel.state.value.actionError is DomainError.Forbidden)
        assertNull(viewModel.state.value.outcome)
    }

    @Test
    fun `rejecting successfully reports the outcome and invokes the callback`() = runTest {
        staffApi.previewResult = previewResponse()
        staffApi.rejectResult = Response.success(Unit)
        val viewModel = newViewModel()
        var rejectedCalled = false

        viewModel.reject { rejectedCalled = true }

        assertTrue(rejectedCalled)
        assertEquals(InvitationOutcome.REJECTED, viewModel.state.value.outcome)
    }

    @Test
    fun `an already-expired invitation is reflected in the preview for the screen to render as terminal`() = runTest {
        staffApi.previewResult = previewResponse(status = StaffInvitationStatus.EXPIRED, isExpired = true)
        val viewModel = newViewModel()

        val preview = viewModel.state.value.preview as ScreenState.Content
        assertEquals(StaffInvitationStatus.EXPIRED, preview.data.status)
        assertTrue(preview.data.isExpired)
    }
}
