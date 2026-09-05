package com.realtegic.kora.core.data

import com.realtegic.kora.core.model.AppointmentDto
import com.realtegic.kora.core.model.CancelAppointmentRequest
import com.realtegic.kora.core.model.CreateAppointmentRequest
import com.realtegic.kora.core.model.RescheduleAppointmentRequest
import com.realtegic.kora.core.network.ApiResult
import com.realtegic.kora.core.network.AppointmentsApi
import com.realtegic.kora.core.network.safeApiCall
import com.squareup.moshi.Moshi

/**
 * The idempotency key itself is owned by the caller (the booking
 * ViewModel), not this repository -- it must survive across retries of
 * the *same* booking attempt and only be regenerated once that attempt
 * reaches a terminal result or the booking details change (docs task
 * Phase 7), which is state this repository has no visibility into.
 */
class AppointmentsRepository(
    private val appointmentsApi: AppointmentsApi,
    private val moshi: Moshi,
) {
    suspend fun book(request: CreateAppointmentRequest): ApiResult<AppointmentDto> =
        safeApiCall(moshi) { appointmentsApi.book(request) }

    suspend fun list(cursor: String? = null, limit: Int? = null): ApiResult<List<AppointmentDto>> =
        safeApiCall(moshi) { appointmentsApi.list(cursor, limit) }

    suspend fun get(appointmentId: String): ApiResult<AppointmentDto> =
        safeApiCall(moshi) { appointmentsApi.get(appointmentId) }

    suspend fun cancel(appointmentId: String, reason: String? = null): ApiResult<AppointmentDto> =
        safeApiCall(moshi) { appointmentsApi.cancel(appointmentId, CancelAppointmentRequest(reason)) }

    suspend fun reschedule(appointmentId: String, startAt: String, staffProfileId: String? = null): ApiResult<AppointmentDto> =
        safeApiCall(moshi) { appointmentsApi.reschedule(appointmentId, RescheduleAppointmentRequest(startAt, staffProfileId)) }
}
