package com.realtegic.kora.core.network

import com.realtegic.kora.core.model.ApiSuccessEnvelope
import com.realtegic.kora.core.model.AuthResultDto
import com.realtegic.kora.core.model.MeDto
import com.realtegic.kora.core.model.RefreshRequest
import com.realtegic.kora.core.model.RequestEmailOtpRequest
import com.realtegic.kora.core.model.RequestEmailOtpResponse
import com.realtegic.kora.core.model.SessionSummaryDto
import com.realtegic.kora.core.model.VerifyEmailOtpRequest
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

interface AuthApi {
    @POST("auth/email-otp/request")
    suspend fun requestOtp(@Body body: RequestEmailOtpRequest): Response<ApiSuccessEnvelope<RequestEmailOtpResponse>>

    @POST("auth/email-otp/verify")
    suspend fun verifyOtp(@Body body: VerifyEmailOtpRequest): Response<ApiSuccessEnvelope<AuthResultDto>>

    @POST("auth/refresh")
    suspend fun refresh(@Body body: RefreshRequest): Response<ApiSuccessEnvelope<AuthResultDto>>

    @POST("auth/logout")
    suspend fun logout(): Response<Unit>

    @POST("auth/logout-all")
    suspend fun logoutAll(): Response<Unit>

    @GET("auth/me")
    suspend fun me(): Response<ApiSuccessEnvelope<MeDto>>

    @GET("auth/sessions")
    suspend fun sessions(): Response<ApiSuccessEnvelope<List<SessionSummaryDto>>>

    @DELETE("auth/sessions/{sessionId}")
    suspend fun revokeSession(@Path("sessionId") sessionId: String): Response<Unit>
}
