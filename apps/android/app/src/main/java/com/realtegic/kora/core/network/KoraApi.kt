package com.realtegic.kora.core.network

import com.realtegic.kora.core.model.AcceptInvitationResponseDto
import com.realtegic.kora.core.model.ApiSuccessEnvelope
import com.realtegic.kora.core.model.AssignQueueStaffRequest
import com.realtegic.kora.core.model.AssignableRoleDto
import com.realtegic.kora.core.model.AppointmentDto
import com.realtegic.kora.core.model.AssignStaffServiceRequest
import com.realtegic.kora.core.model.AvailabilityResultDto
import com.realtegic.kora.core.model.BookingPolicyDto
import com.realtegic.kora.core.model.BranchDto
import com.realtegic.kora.core.model.BranchScheduleExceptionDto
import com.realtegic.kora.core.model.BranchServiceDto
import com.realtegic.kora.core.model.BusinessCategoryDto
import com.realtegic.kora.core.model.BusinessHoursIntervalDto
import com.realtegic.kora.core.model.BusinessProfileEnvelope
import com.realtegic.kora.core.model.CancelAppointmentRequest
import com.realtegic.kora.core.model.CancelQueueEntryRequest
import com.realtegic.kora.core.model.CancelServiceSessionRequest
import com.realtegic.kora.core.model.CashReconciliationEntryDto
import com.realtegic.kora.core.model.CashPolicyDto
import com.realtegic.kora.core.model.CheckoutDto
import com.realtegic.kora.core.model.CommissionReportEntryDto
import com.realtegic.kora.core.model.ConfirmPaymentRequest
import com.realtegic.kora.core.model.CreateAppointmentRequest
import com.realtegic.kora.core.model.CreateBranchScheduleExceptionRequest
import com.realtegic.kora.core.model.CreateCheckoutAdjustmentRequest
import com.realtegic.kora.core.model.CreateOrganizationRequest
import com.realtegic.kora.core.model.CreateServiceCategoryRequest
import com.realtegic.kora.core.model.CreateServiceRequest
import com.realtegic.kora.core.model.CreateStaffAppointmentRequest
import com.realtegic.kora.core.model.CreateStaffAvailabilityExceptionRequest
import com.realtegic.kora.core.model.CreateStaffInvitationRequest
import com.realtegic.kora.core.model.CreateStaffInvitationResponseDto
import com.realtegic.kora.core.model.CreateWalkInRequest
import com.realtegic.kora.core.model.DailyRevenueBucketDto
import com.realtegic.kora.core.model.DisputePaymentRequest
import com.realtegic.kora.core.model.DiscoveryBranchSummaryDto
import com.realtegic.kora.core.model.DiscoveryBusinessSummaryDto
import com.realtegic.kora.core.model.FavoriteToggleResponseDto
import com.realtegic.kora.core.model.InvitationPreviewDto
import com.realtegic.kora.core.model.MyEarningsLineDto
import com.realtegic.kora.core.model.MyWorkspacesDto
import com.realtegic.kora.core.model.OnboardOrganizationResponseDto
import com.realtegic.kora.core.model.OrganizationDto
import com.realtegic.kora.core.model.OrganizationSetupStatusDto
import com.realtegic.kora.core.model.OrganizationSummaryDto
import com.realtegic.kora.core.model.PaymentDisputeDto
import com.realtegic.kora.core.model.PaymentMethodEntryDto
import com.realtegic.kora.core.model.PaymentRecordDto
import com.realtegic.kora.core.model.PublicProviderSummaryDto
import com.realtegic.kora.core.model.PublicServiceSummaryDto
import com.realtegic.kora.core.model.QueueEntryDto
import com.realtegic.kora.core.model.QueueListDto
import com.realtegic.kora.core.model.ReceiptDto
import com.realtegic.kora.core.model.RecordPaymentRequest
import com.realtegic.kora.core.model.RescheduleAppointmentRequest
import com.realtegic.kora.core.model.ReplaceBusinessHoursRequest
import com.realtegic.kora.core.model.ReplaceServiceSessionItemsRequest
import com.realtegic.kora.core.model.ReplaceStaffAvailabilityRulesRequest
import com.realtegic.kora.core.model.ReportsOverviewDto
import com.realtegic.kora.core.model.ResolvePaymentDisputeRequest
import com.realtegic.kora.core.model.RevenueReportDto
import com.realtegic.kora.core.model.ServiceCategoryDto
import com.realtegic.kora.core.model.ServiceDto
import com.realtegic.kora.core.model.ServicePerformanceEntryDto
import com.realtegic.kora.core.model.ServiceSessionDto
import com.realtegic.kora.core.model.StaffAvailabilityExceptionDto
import com.realtegic.kora.core.model.StaffDirectoryEntryDto
import com.realtegic.kora.core.model.StaffInvitationListItemDto
import com.realtegic.kora.core.model.StaffPerformanceEntryDto
import com.realtegic.kora.core.model.StaffServiceAssignmentDto
import com.realtegic.kora.core.model.StartServiceSessionRequest
import com.realtegic.kora.core.model.SubscriptionDetailDto
import com.realtegic.kora.core.model.TransactionDto
import com.realtegic.kora.core.model.UpdateBranchDiscoveryRequest
import com.realtegic.kora.core.model.UpdateCashPolicyRequest
import com.realtegic.kora.core.model.UpsertBookingPolicyRequest
import com.realtegic.kora.core.model.UpsertBranchServiceRequest
import com.realtegic.kora.core.model.UpsertBusinessProfileRequest
import com.realtegic.kora.core.model.VoidCheckoutRequest
import com.realtegic.kora.core.model.VoidPaymentRequest
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.PUT
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface WorkspacesApi {
    @GET("me/workspaces")
    suspend fun getMyWorkspaces(): Response<ApiSuccessEnvelope<MyWorkspacesDto>>
}

interface DiscoveryApi {
    @GET("discovery/categories")
    suspend fun categories(): Response<ApiSuccessEnvelope<List<BusinessCategoryDto>>>

    @GET("discovery/businesses")
    suspend fun searchBusinesses(
        @Query("text") text: String? = null,
        @Query("category") category: String? = null,
        @Query("nearLat") nearLat: Double? = null,
        @Query("nearLng") nearLng: Double? = null,
        @Query("radiusKm") radiusKm: Int? = null,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int? = null,
    ): Response<ApiSuccessEnvelope<List<DiscoveryBusinessSummaryDto>>>

    @GET("discovery/businesses/{slug}")
    suspend fun getBusiness(@Path("slug") slug: String): Response<ApiSuccessEnvelope<DiscoveryBusinessSummaryDto>>

    @GET("discovery/businesses/{slug}/branches")
    suspend fun getBranches(@Path("slug") slug: String): Response<ApiSuccessEnvelope<List<DiscoveryBranchSummaryDto>>>

    @GET("discovery/businesses/{slug}/branches/{branchId}/services")
    suspend fun getServices(
        @Path("slug") slug: String,
        @Path("branchId") branchId: String,
    ): Response<ApiSuccessEnvelope<List<PublicServiceSummaryDto>>>

    @GET("discovery/businesses/{slug}/branches/{branchId}/services/{serviceId}/providers")
    suspend fun getProviders(
        @Path("slug") slug: String,
        @Path("branchId") branchId: String,
        @Path("serviceId") serviceId: String,
    ): Response<ApiSuccessEnvelope<List<PublicProviderSummaryDto>>>

    @GET("discovery/businesses/{slug}/branches/{branchId}/availability")
    suspend fun getAvailability(
        @Path("slug") slug: String,
        @Path("branchId") branchId: String,
        @Query("serviceIds") serviceIds: String,
        @Query("staffProfileId") staffProfileId: String? = null,
        @Query("date") date: String? = null,
        @Query("fromDate") fromDate: String? = null,
        @Query("toDate") toDate: String? = null,
    ): Response<ApiSuccessEnvelope<AvailabilityResultDto>>
}

interface AppointmentsApi {
    @POST("me/appointments")
    suspend fun book(@Body body: CreateAppointmentRequest): Response<ApiSuccessEnvelope<AppointmentDto>>

    @GET("me/appointments")
    suspend fun list(
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int? = null,
    ): Response<ApiSuccessEnvelope<List<AppointmentDto>>>

    @GET("me/appointments/{appointmentId}")
    suspend fun get(@Path("appointmentId") appointmentId: String): Response<ApiSuccessEnvelope<AppointmentDto>>

    @POST("me/appointments/{appointmentId}/cancel")
    suspend fun cancel(
        @Path("appointmentId") appointmentId: String,
        @Body body: CancelAppointmentRequest,
    ): Response<ApiSuccessEnvelope<AppointmentDto>>

    @POST("me/appointments/{appointmentId}/reschedule")
    suspend fun reschedule(
        @Path("appointmentId") appointmentId: String,
        @Body body: RescheduleAppointmentRequest,
    ): Response<ApiSuccessEnvelope<AppointmentDto>>
}

interface FavoritesApi {
    @GET("me/favorites")
    suspend fun list(): Response<ApiSuccessEnvelope<List<DiscoveryBusinessSummaryDto>>>

    @POST("me/favorites/{organizationId}")
    suspend fun add(@Path("organizationId") organizationId: String): Response<ApiSuccessEnvelope<FavoriteToggleResponseDto>>

    @DELETE("me/favorites/{organizationId}")
    suspend fun remove(@Path("organizationId") organizationId: String): Response<ApiSuccessEnvelope<FavoriteToggleResponseDto>>
}

interface ReportsApi {
    @GET("organizations/{organizationId}/reports/overview")
    suspend fun overview(
        @Path("organizationId") organizationId: String,
        @Query("from") from: String,
        @Query("to") to: String,
        @Query("branchId") branchId: String? = null,
    ): Response<ApiSuccessEnvelope<ReportsOverviewDto>>

    @GET("organizations/{organizationId}/reports/revenue")
    suspend fun revenue(
        @Path("organizationId") organizationId: String,
        @Query("from") from: String,
        @Query("to") to: String,
        @Query("branchId") branchId: String? = null,
        @Query("timezone") timezone: String? = null,
    ): Response<ApiSuccessEnvelope<RevenueReportDto>>

    @GET("organizations/{organizationId}/reports/staff-performance")
    suspend fun staffPerformance(
        @Path("organizationId") organizationId: String,
        @Query("from") from: String,
        @Query("to") to: String,
        @Query("branchId") branchId: String? = null,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int? = null,
    ): Response<ApiSuccessEnvelope<List<StaffPerformanceEntryDto>>>

    @GET("organizations/{organizationId}/reports/services")
    suspend fun services(
        @Path("organizationId") organizationId: String,
        @Query("from") from: String,
        @Query("to") to: String,
        @Query("branchId") branchId: String? = null,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int? = null,
    ): Response<ApiSuccessEnvelope<List<ServicePerformanceEntryDto>>>

    @GET("organizations/{organizationId}/reports/payment-methods")
    suspend fun paymentMethods(
        @Path("organizationId") organizationId: String,
        @Query("from") from: String,
        @Query("to") to: String,
        @Query("branchId") branchId: String? = null,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int? = null,
    ): Response<ApiSuccessEnvelope<List<PaymentMethodEntryDto>>>

    @GET("organizations/{organizationId}/reports/commissions")
    suspend fun commissions(
        @Path("organizationId") organizationId: String,
        @Query("from") from: String,
        @Query("to") to: String,
        @Query("branchId") branchId: String? = null,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int? = null,
    ): Response<ApiSuccessEnvelope<List<CommissionReportEntryDto>>>

    @GET("organizations/{organizationId}/reports/cash-reconciliation")
    suspend fun cashReconciliation(
        @Path("organizationId") organizationId: String,
        @Query("from") from: String,
        @Query("to") to: String,
        @Query("branchId") branchId: String? = null,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int? = null,
    ): Response<ApiSuccessEnvelope<List<CashReconciliationEntryDto>>>
}

interface MyEarningsApi {
    @GET("organizations/{organizationId}/me/earnings")
    suspend fun list(
        @Path("organizationId") organizationId: String,
        @Query("from") from: String? = null,
        @Query("to") to: String? = null,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int? = null,
    ): Response<ApiSuccessEnvelope<List<MyEarningsLineDto>>>

    @GET("organizations/{organizationId}/me/earnings/summary")
    suspend fun summary(
        @Path("organizationId") organizationId: String,
        @Query("from") from: String? = null,
        @Query("to") to: String? = null,
    ): Response<ApiSuccessEnvelope<CommissionReportEntryDto>>
}

interface OrganizationAppointmentsApi {
    @GET("organizations/{organizationId}/branches/{branchId}/appointments")
    suspend fun list(
        @Path("organizationId") organizationId: String,
        @Path("branchId") branchId: String,
        @Query("from") from: String,
        @Query("to") to: String,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int? = null,
    ): Response<ApiSuccessEnvelope<List<AppointmentDto>>>

    @GET("organizations/{organizationId}/branches/{branchId}/appointments/{appointmentId}")
    suspend fun get(
        @Path("organizationId") organizationId: String,
        @Path("branchId") branchId: String,
        @Path("appointmentId") appointmentId: String,
    ): Response<ApiSuccessEnvelope<AppointmentDto>>

    @POST("organizations/{organizationId}/branches/{branchId}/appointments")
    suspend fun create(
        @Path("organizationId") organizationId: String,
        @Path("branchId") branchId: String,
        @Body body: CreateStaffAppointmentRequest,
    ): Response<ApiSuccessEnvelope<AppointmentDto>>

    @POST("organizations/{organizationId}/branches/{branchId}/appointments/{appointmentId}/cancel")
    suspend fun cancel(
        @Path("organizationId") organizationId: String,
        @Path("branchId") branchId: String,
        @Path("appointmentId") appointmentId: String,
        @Body body: CancelAppointmentRequest,
    ): Response<ApiSuccessEnvelope<AppointmentDto>>

    @POST("organizations/{organizationId}/branches/{branchId}/appointments/{appointmentId}/reschedule")
    suspend fun reschedule(
        @Path("organizationId") organizationId: String,
        @Path("branchId") branchId: String,
        @Path("appointmentId") appointmentId: String,
        @Body body: RescheduleAppointmentRequest,
    ): Response<ApiSuccessEnvelope<AppointmentDto>>

    @POST("organizations/{organizationId}/branches/{branchId}/appointments/{appointmentId}/no-show")
    suspend fun noShow(
        @Path("organizationId") organizationId: String,
        @Path("branchId") branchId: String,
        @Path("appointmentId") appointmentId: String,
    ): Response<ApiSuccessEnvelope<AppointmentDto>>

    @POST("organizations/{organizationId}/appointments/{appointmentId}/check-in")
    suspend fun checkIn(
        @Path("organizationId") organizationId: String,
        @Path("appointmentId") appointmentId: String,
    ): Response<ApiSuccessEnvelope<QueueEntryDto>>
}

interface QueueApi {
    @POST("organizations/{organizationId}/branches/{branchId}/queue/walk-ins")
    suspend fun createWalkIn(
        @Path("organizationId") organizationId: String,
        @Path("branchId") branchId: String,
        @Header("Idempotency-Key") idempotencyKey: String? = null,
        @Body body: CreateWalkInRequest,
    ): Response<ApiSuccessEnvelope<QueueEntryDto>>

    @GET("organizations/{organizationId}/branches/{branchId}/queue")
    suspend fun getQueue(
        @Path("organizationId") organizationId: String,
        @Path("branchId") branchId: String,
        @Query("businessDate") businessDate: String? = null,
        @Query("status") status: String? = null,
        @Query("assignedStaffProfileId") assignedStaffProfileId: String? = null,
    ): Response<ApiSuccessEnvelope<QueueListDto>>

    @GET("organizations/{organizationId}/queue-entries/{queueEntryId}")
    suspend fun getQueueEntry(
        @Path("organizationId") organizationId: String,
        @Path("queueEntryId") queueEntryId: String,
    ): Response<ApiSuccessEnvelope<QueueEntryDto>>

    @POST("organizations/{organizationId}/queue-entries/{queueEntryId}/call")
    suspend fun call(
        @Path("organizationId") organizationId: String,
        @Path("queueEntryId") queueEntryId: String,
    ): Response<ApiSuccessEnvelope<QueueEntryDto>>

    @POST("organizations/{organizationId}/queue-entries/{queueEntryId}/return-to-waiting")
    suspend fun returnToWaiting(
        @Path("organizationId") organizationId: String,
        @Path("queueEntryId") queueEntryId: String,
    ): Response<ApiSuccessEnvelope<QueueEntryDto>>

    @POST("organizations/{organizationId}/queue-entries/{queueEntryId}/assign")
    suspend fun assign(
        @Path("organizationId") organizationId: String,
        @Path("queueEntryId") queueEntryId: String,
        @Body body: AssignQueueStaffRequest,
    ): Response<ApiSuccessEnvelope<QueueEntryDto>>

    @POST("organizations/{organizationId}/queue-entries/{queueEntryId}/cancel")
    suspend fun cancelEntry(
        @Path("organizationId") organizationId: String,
        @Path("queueEntryId") queueEntryId: String,
        @Body body: CancelQueueEntryRequest,
    ): Response<ApiSuccessEnvelope<QueueEntryDto>>

    @POST("organizations/{organizationId}/queue-entries/{queueEntryId}/no-show")
    suspend fun noShowEntry(
        @Path("organizationId") organizationId: String,
        @Path("queueEntryId") queueEntryId: String,
    ): Response<ApiSuccessEnvelope<QueueEntryDto>>

    @POST("organizations/{organizationId}/queue-entries/{queueEntryId}/start-service")
    suspend fun startService(
        @Path("organizationId") organizationId: String,
        @Path("queueEntryId") queueEntryId: String,
        @Body body: StartServiceSessionRequest,
    ): Response<ApiSuccessEnvelope<ServiceSessionDto>>
}

interface ServiceSessionsApi {
    @GET("organizations/{organizationId}/service-sessions")
    suspend fun list(
        @Path("organizationId") organizationId: String,
        @Query("branchId") branchId: String? = null,
        @Query("status") status: String? = null,
        @Query("assignedStaffProfileId") assignedStaffProfileId: String? = null,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int? = null,
    ): Response<ApiSuccessEnvelope<List<ServiceSessionDto>>>

    @GET("organizations/{organizationId}/service-sessions/{serviceSessionId}")
    suspend fun get(
        @Path("organizationId") organizationId: String,
        @Path("serviceSessionId") serviceSessionId: String,
    ): Response<ApiSuccessEnvelope<ServiceSessionDto>>

    @PUT("organizations/{organizationId}/service-sessions/{serviceSessionId}/items")
    suspend fun replaceItems(
        @Path("organizationId") organizationId: String,
        @Path("serviceSessionId") serviceSessionId: String,
        @Body body: ReplaceServiceSessionItemsRequest,
    ): Response<ApiSuccessEnvelope<ServiceSessionDto>>

    @POST("organizations/{organizationId}/service-sessions/{serviceSessionId}/complete")
    suspend fun complete(
        @Path("organizationId") organizationId: String,
        @Path("serviceSessionId") serviceSessionId: String,
    ): Response<ApiSuccessEnvelope<ServiceSessionDto>>

    @POST("organizations/{organizationId}/service-sessions/{serviceSessionId}/cancel")
    suspend fun cancel(
        @Path("organizationId") organizationId: String,
        @Path("serviceSessionId") serviceSessionId: String,
        @Body body: CancelServiceSessionRequest,
    ): Response<ApiSuccessEnvelope<ServiceSessionDto>>
}

interface CheckoutsApi {
    @POST("organizations/{organizationId}/service-sessions/{serviceSessionId}/checkout")
    suspend fun create(
        @Path("organizationId") organizationId: String,
        @Path("serviceSessionId") serviceSessionId: String,
        @Header("Idempotency-Key") idempotencyKey: String,
    ): Response<ApiSuccessEnvelope<CheckoutDto>>

    @GET("organizations/{organizationId}/checkouts")
    suspend fun list(
        @Path("organizationId") organizationId: String,
        @Query("branchId") branchId: String? = null,
        @Query("status") status: String? = null,
        @Query("assignedStaffProfileId") assignedStaffProfileId: String? = null,
        @Query("customerRecordId") customerRecordId: String? = null,
        @Query("serviceSessionId") serviceSessionId: String? = null,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int? = null,
    ): Response<ApiSuccessEnvelope<List<CheckoutDto>>>

    @GET("organizations/{organizationId}/checkouts/{checkoutId}")
    suspend fun get(
        @Path("organizationId") organizationId: String,
        @Path("checkoutId") checkoutId: String,
    ): Response<ApiSuccessEnvelope<CheckoutDto>>

    @POST("organizations/{organizationId}/checkouts/{checkoutId}/adjustments")
    suspend fun addAdjustment(
        @Path("organizationId") organizationId: String,
        @Path("checkoutId") checkoutId: String,
        @Body body: CreateCheckoutAdjustmentRequest,
    ): Response<ApiSuccessEnvelope<CheckoutDto>>

    @POST("organizations/{organizationId}/checkouts/{checkoutId}/void")
    suspend fun void(
        @Path("organizationId") organizationId: String,
        @Path("checkoutId") checkoutId: String,
        @Body body: VoidCheckoutRequest,
    ): Response<ApiSuccessEnvelope<CheckoutDto>>
}

interface PaymentsApi {
    @POST("organizations/{organizationId}/checkouts/{checkoutId}/payments")
    suspend fun record(
        @Path("organizationId") organizationId: String,
        @Path("checkoutId") checkoutId: String,
        @Header("Idempotency-Key") idempotencyKey: String,
        @Body body: RecordPaymentRequest,
    ): Response<ApiSuccessEnvelope<PaymentRecordDto>>

    @GET("organizations/{organizationId}/checkouts/{checkoutId}/payments")
    suspend fun list(
        @Path("organizationId") organizationId: String,
        @Path("checkoutId") checkoutId: String,
    ): Response<ApiSuccessEnvelope<List<PaymentRecordDto>>>

    @POST("organizations/{organizationId}/payments/{paymentId}/confirm")
    suspend fun confirm(
        @Path("organizationId") organizationId: String,
        @Path("paymentId") paymentId: String,
        @Body body: ConfirmPaymentRequest,
    ): Response<ApiSuccessEnvelope<PaymentRecordDto>>

    @POST("organizations/{organizationId}/payments/{paymentId}/dispute")
    suspend fun dispute(
        @Path("organizationId") organizationId: String,
        @Path("paymentId") paymentId: String,
        @Body body: DisputePaymentRequest,
    ): Response<ApiSuccessEnvelope<PaymentRecordDto>>

    @POST("organizations/{organizationId}/payments/{paymentId}/void")
    suspend fun void(
        @Path("organizationId") organizationId: String,
        @Path("paymentId") paymentId: String,
        @Body body: VoidPaymentRequest,
    ): Response<ApiSuccessEnvelope<PaymentRecordDto>>

    @GET("organizations/{organizationId}/payment-verifications/pending")
    suspend fun pendingVerifications(
        @Path("organizationId") organizationId: String,
    ): Response<ApiSuccessEnvelope<List<PaymentRecordDto>>>

    @GET("organizations/{organizationId}/payment-verifications")
    suspend fun myVerifications(
        @Path("organizationId") organizationId: String,
        @Query("status") status: String? = null,
    ): Response<ApiSuccessEnvelope<List<PaymentRecordDto>>>
}

interface PaymentDisputesApi {
    @GET("organizations/{organizationId}/payment-disputes")
    suspend fun list(
        @Path("organizationId") organizationId: String,
        @Query("status") status: String? = null,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int? = null,
    ): Response<ApiSuccessEnvelope<List<PaymentDisputeDto>>>

    @GET("organizations/{organizationId}/payment-disputes/{disputeId}")
    suspend fun get(
        @Path("organizationId") organizationId: String,
        @Path("disputeId") disputeId: String,
    ): Response<ApiSuccessEnvelope<PaymentDisputeDto>>

    @POST("organizations/{organizationId}/payment-disputes/{disputeId}/resolve")
    suspend fun resolve(
        @Path("organizationId") organizationId: String,
        @Path("disputeId") disputeId: String,
        @Body body: ResolvePaymentDisputeRequest,
    ): Response<ApiSuccessEnvelope<PaymentDisputeDto>>
}

interface TransactionsApi {
    @GET("organizations/{organizationId}/transactions")
    suspend fun list(
        @Path("organizationId") organizationId: String,
        @Query("branchId") branchId: String? = null,
        @Query("assignedStaffProfileId") assignedStaffProfileId: String? = null,
        @Query("customerRecordId") customerRecordId: String? = null,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int? = null,
    ): Response<ApiSuccessEnvelope<List<TransactionDto>>>

    @GET("organizations/{organizationId}/transactions/{transactionId}")
    suspend fun get(
        @Path("organizationId") organizationId: String,
        @Path("transactionId") transactionId: String,
    ): Response<ApiSuccessEnvelope<TransactionDto>>
}

interface ReceiptsApi {
    @GET("organizations/{organizationId}/receipts")
    suspend fun list(
        @Path("organizationId") organizationId: String,
        @Query("branchId") branchId: String? = null,
        @Query("customerRecordId") customerRecordId: String? = null,
        @Query("transactionId") transactionId: String? = null,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int? = null,
    ): Response<ApiSuccessEnvelope<List<ReceiptDto>>>

    @GET("organizations/{organizationId}/receipts/{receiptId}")
    suspend fun get(
        @Path("organizationId") organizationId: String,
        @Path("receiptId") receiptId: String,
    ): Response<ApiSuccessEnvelope<ReceiptDto>>

    @GET("me/receipts")
    suspend fun listMine(
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int? = null,
    ): Response<ApiSuccessEnvelope<List<ReceiptDto>>>

    @GET("me/receipts/{receiptId}")
    suspend fun getMine(@Path("receiptId") receiptId: String): Response<ApiSuccessEnvelope<ReceiptDto>>
}

interface CashPolicyApi {
    @GET("organizations/{organizationId}/branches/{branchId}/cash-policy")
    suspend fun get(
        @Path("organizationId") organizationId: String,
        @Path("branchId") branchId: String,
    ): Response<ApiSuccessEnvelope<CashPolicyDto>>

    @PUT("organizations/{organizationId}/branches/{branchId}/cash-policy")
    suspend fun update(
        @Path("organizationId") organizationId: String,
        @Path("branchId") branchId: String,
        @Body body: UpdateCashPolicyRequest,
    ): Response<ApiSuccessEnvelope<CashPolicyDto>>
}

interface OrganizationsApi {
    @POST("organizations")
    suspend fun create(
        @Header("Idempotency-Key") idempotencyKey: String,
        @Body body: CreateOrganizationRequest,
    ): Response<ApiSuccessEnvelope<OnboardOrganizationResponseDto>>

    @GET("organizations")
    suspend fun list(): Response<ApiSuccessEnvelope<List<OrganizationSummaryDto>>>

    @GET("organizations/{organizationId}")
    suspend fun get(@Path("organizationId") organizationId: String): Response<ApiSuccessEnvelope<OrganizationDto>>

    @GET("organizations/{organizationId}/setup-status")
    suspend fun getSetupStatus(
        @Path("organizationId") organizationId: String,
    ): Response<ApiSuccessEnvelope<OrganizationSetupStatusDto>>

    @GET("organizations/{organizationId}/branches")
    suspend fun listBranches(
        @Path("organizationId") organizationId: String,
    ): Response<ApiSuccessEnvelope<List<BranchDto>>>
}

interface BusinessProfileApi {
    @GET("organizations/{organizationId}/business-profile")
    suspend fun get(@Path("organizationId") organizationId: String): Response<BusinessProfileEnvelope>

    @PUT("organizations/{organizationId}/business-profile")
    suspend fun upsert(
        @Path("organizationId") organizationId: String,
        @Body body: UpsertBusinessProfileRequest,
    ): Response<BusinessProfileEnvelope>

    @POST("organizations/{organizationId}/business-profile/publish")
    suspend fun publish(@Path("organizationId") organizationId: String): Response<BusinessProfileEnvelope>

    @POST("organizations/{organizationId}/business-profile/unpublish")
    suspend fun unpublish(@Path("organizationId") organizationId: String): Response<BusinessProfileEnvelope>

    @PUT("organizations/{organizationId}/branches/{branchId}/discovery")
    suspend fun updateBranchDiscovery(
        @Path("organizationId") organizationId: String,
        @Path("branchId") branchId: String,
        @Body body: UpdateBranchDiscoveryRequest,
    ): Response<Unit>
}

interface ServiceCatalogueApi {
    @GET("organizations/{organizationId}/service-categories")
    suspend fun listCategories(
        @Path("organizationId") organizationId: String,
        @Query("includeArchived") includeArchived: Boolean? = null,
    ): Response<ApiSuccessEnvelope<List<ServiceCategoryDto>>>

    @POST("organizations/{organizationId}/service-categories")
    suspend fun createCategory(
        @Path("organizationId") organizationId: String,
        @Body body: CreateServiceCategoryRequest,
    ): Response<ApiSuccessEnvelope<ServiceCategoryDto>>

    @POST("organizations/{organizationId}/service-categories/{categoryId}/archive")
    suspend fun archiveCategory(
        @Path("organizationId") organizationId: String,
        @Path("categoryId") categoryId: String,
    ): Response<ApiSuccessEnvelope<ServiceCategoryDto>>

    @GET("organizations/{organizationId}/services")
    suspend fun listServices(
        @Path("organizationId") organizationId: String,
        @Query("includeArchived") includeArchived: Boolean? = null,
        @Query("serviceCategoryId") serviceCategoryId: String? = null,
    ): Response<ApiSuccessEnvelope<List<ServiceDto>>>

    @POST("organizations/{organizationId}/services")
    suspend fun createService(
        @Path("organizationId") organizationId: String,
        @Body body: CreateServiceRequest,
    ): Response<ApiSuccessEnvelope<ServiceDto>>

    @POST("organizations/{organizationId}/services/{serviceId}/archive")
    suspend fun archiveService(
        @Path("organizationId") organizationId: String,
        @Path("serviceId") serviceId: String,
    ): Response<ApiSuccessEnvelope<ServiceDto>>

    @POST("organizations/{organizationId}/services/{serviceId}/restore")
    suspend fun restoreService(
        @Path("organizationId") organizationId: String,
        @Path("serviceId") serviceId: String,
    ): Response<ApiSuccessEnvelope<ServiceDto>>

    @GET("organizations/{organizationId}/branches/{branchId}/services")
    suspend fun listBranchServices(
        @Path("organizationId") organizationId: String,
        @Path("branchId") branchId: String,
    ): Response<ApiSuccessEnvelope<List<BranchServiceDto>>>

    @PUT("organizations/{organizationId}/branches/{branchId}/services/{serviceId}")
    suspend fun upsertBranchService(
        @Path("organizationId") organizationId: String,
        @Path("branchId") branchId: String,
        @Path("serviceId") serviceId: String,
        @Body body: UpsertBranchServiceRequest,
    ): Response<ApiSuccessEnvelope<BranchServiceDto>>

    @GET("organizations/{organizationId}/branches/{branchId}/services/{serviceId}/staff")
    suspend fun listStaffAssignments(
        @Path("organizationId") organizationId: String,
        @Path("branchId") branchId: String,
        @Path("serviceId") serviceId: String,
    ): Response<ApiSuccessEnvelope<List<StaffServiceAssignmentDto>>>

    @POST("organizations/{organizationId}/branches/{branchId}/services/{serviceId}/staff")
    suspend fun assignStaff(
        @Path("organizationId") organizationId: String,
        @Path("branchId") branchId: String,
        @Path("serviceId") serviceId: String,
        @Body body: AssignStaffServiceRequest,
    ): Response<ApiSuccessEnvelope<StaffServiceAssignmentDto>>

    @DELETE("organizations/{organizationId}/branches/{branchId}/services/{serviceId}/staff/{staffProfileId}")
    suspend fun unassignStaff(
        @Path("organizationId") organizationId: String,
        @Path("branchId") branchId: String,
        @Path("serviceId") serviceId: String,
        @Path("staffProfileId") staffProfileId: String,
    ): Response<Unit>
}

interface SchedulingApi {
    @GET("organizations/{organizationId}/branches/{branchId}/business-hours")
    suspend fun getBusinessHours(
        @Path("organizationId") organizationId: String,
        @Path("branchId") branchId: String,
    ): Response<ApiSuccessEnvelope<List<BusinessHoursIntervalDto>>>

    @PUT("organizations/{organizationId}/branches/{branchId}/business-hours")
    suspend fun replaceBusinessHours(
        @Path("organizationId") organizationId: String,
        @Path("branchId") branchId: String,
        @Body body: ReplaceBusinessHoursRequest,
    ): Response<ApiSuccessEnvelope<List<BusinessHoursIntervalDto>>>

    @GET("organizations/{organizationId}/branches/{branchId}/schedule-exceptions")
    suspend fun getScheduleExceptions(
        @Path("organizationId") organizationId: String,
        @Path("branchId") branchId: String,
        @Query("from") from: String,
        @Query("to") to: String,
    ): Response<ApiSuccessEnvelope<List<BranchScheduleExceptionDto>>>

    @POST("organizations/{organizationId}/branches/{branchId}/schedule-exceptions")
    suspend fun createScheduleException(
        @Path("organizationId") organizationId: String,
        @Path("branchId") branchId: String,
        @Body body: CreateBranchScheduleExceptionRequest,
    ): Response<ApiSuccessEnvelope<BranchScheduleExceptionDto>>

    @DELETE("organizations/{organizationId}/branches/{branchId}/schedule-exceptions/{exceptionId}")
    suspend fun deleteScheduleException(
        @Path("organizationId") organizationId: String,
        @Path("branchId") branchId: String,
        @Path("exceptionId") exceptionId: String,
    ): Response<Unit>

    @GET("organizations/{organizationId}/branches/{branchId}/booking-policy")
    suspend fun getBookingPolicy(
        @Path("organizationId") organizationId: String,
        @Path("branchId") branchId: String,
    ): Response<ApiSuccessEnvelope<BookingPolicyDto>>

    @PUT("organizations/{organizationId}/branches/{branchId}/booking-policy")
    suspend fun upsertBookingPolicy(
        @Path("organizationId") organizationId: String,
        @Path("branchId") branchId: String,
        @Body body: UpsertBookingPolicyRequest,
    ): Response<ApiSuccessEnvelope<BookingPolicyDto>>

    @GET("organizations/{organizationId}/branches/{branchId}/staff/{staffProfileId}/availability-rules")
    suspend fun getStaffAvailabilityRules(
        @Path("organizationId") organizationId: String,
        @Path("branchId") branchId: String,
        @Path("staffProfileId") staffProfileId: String,
    ): Response<ApiSuccessEnvelope<List<BusinessHoursIntervalDto>>>

    @PUT("organizations/{organizationId}/branches/{branchId}/staff/{staffProfileId}/availability-rules")
    suspend fun replaceStaffAvailabilityRules(
        @Path("organizationId") organizationId: String,
        @Path("branchId") branchId: String,
        @Path("staffProfileId") staffProfileId: String,
        @Body body: ReplaceStaffAvailabilityRulesRequest,
    ): Response<ApiSuccessEnvelope<List<BusinessHoursIntervalDto>>>

    @GET("organizations/{organizationId}/branches/{branchId}/staff/{staffProfileId}/availability-exceptions")
    suspend fun getStaffAvailabilityExceptions(
        @Path("organizationId") organizationId: String,
        @Path("branchId") branchId: String,
        @Path("staffProfileId") staffProfileId: String,
        @Query("from") from: String,
        @Query("to") to: String,
    ): Response<ApiSuccessEnvelope<List<StaffAvailabilityExceptionDto>>>

    @POST("organizations/{organizationId}/branches/{branchId}/staff/{staffProfileId}/availability-exceptions")
    suspend fun createStaffAvailabilityException(
        @Path("organizationId") organizationId: String,
        @Path("branchId") branchId: String,
        @Path("staffProfileId") staffProfileId: String,
        @Body body: CreateStaffAvailabilityExceptionRequest,
    ): Response<ApiSuccessEnvelope<StaffAvailabilityExceptionDto>>
}

interface StaffApi {
    @GET("organizations/{organizationId}/staff-invitations/assignable-roles")
    suspend fun getAssignableRoles(
        @Path("organizationId") organizationId: String,
    ): Response<ApiSuccessEnvelope<List<AssignableRoleDto>>>

    @POST("organizations/{organizationId}/staff-invitations")
    suspend fun createInvitation(
        @Path("organizationId") organizationId: String,
        @Body body: CreateStaffInvitationRequest,
    ): Response<ApiSuccessEnvelope<CreateStaffInvitationResponseDto>>

    @GET("organizations/{organizationId}/staff-invitations")
    suspend fun listInvitations(
        @Path("organizationId") organizationId: String,
        @Query("status") status: String? = null,
    ): Response<ApiSuccessEnvelope<List<StaffInvitationListItemDto>>>

    @POST("organizations/{organizationId}/staff-invitations/{invitationId}/revoke")
    suspend fun revokeInvitation(
        @Path("organizationId") organizationId: String,
        @Path("invitationId") invitationId: String,
    ): Response<Unit>

    @GET("staff-invitations/{token}")
    suspend fun getInvitationPreview(@Path("token") token: String): Response<ApiSuccessEnvelope<InvitationPreviewDto>>

    @POST("staff-invitations/{token}/accept")
    suspend fun acceptInvitation(@Path("token") token: String): Response<ApiSuccessEnvelope<AcceptInvitationResponseDto>>

    @POST("staff-invitations/{token}/reject")
    suspend fun rejectInvitation(@Path("token") token: String): Response<Unit>

    @GET("organizations/{organizationId}/staff")
    suspend fun listStaff(
        @Path("organizationId") organizationId: String,
    ): Response<ApiSuccessEnvelope<List<StaffDirectoryEntryDto>>>
}

interface SubscriptionApi {
    @GET("organizations/{organizationId}/subscription")
    suspend fun get(@Path("organizationId") organizationId: String): Response<ApiSuccessEnvelope<SubscriptionDetailDto>>
}
