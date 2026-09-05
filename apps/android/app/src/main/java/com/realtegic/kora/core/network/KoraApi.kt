package com.realtegic.kora.core.network

import com.realtegic.kora.core.model.ApiSuccessEnvelope
import com.realtegic.kora.core.model.AppointmentDto
import com.realtegic.kora.core.model.AvailabilityResultDto
import com.realtegic.kora.core.model.BusinessCategoryDto
import com.realtegic.kora.core.model.CancelAppointmentRequest
import com.realtegic.kora.core.model.CreateAppointmentRequest
import com.realtegic.kora.core.model.DiscoveryBranchSummaryDto
import com.realtegic.kora.core.model.DiscoveryBusinessSummaryDto
import com.realtegic.kora.core.model.FavoriteToggleResponseDto
import com.realtegic.kora.core.model.MyWorkspacesDto
import com.realtegic.kora.core.model.PublicProviderSummaryDto
import com.realtegic.kora.core.model.PublicServiceSummaryDto
import com.realtegic.kora.core.model.RescheduleAppointmentRequest
import com.realtegic.kora.core.model.ReportsOverviewDto
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
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
}
