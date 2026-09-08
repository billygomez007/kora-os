package com.realtegic.kora.core.data

import com.realtegic.kora.core.model.BusinessAppointmentDto
import com.realtegic.kora.core.model.AppointmentDto
import com.realtegic.kora.core.model.CancelAppointmentRequest
import com.realtegic.kora.core.model.CreateStaffAppointmentRequest
import com.realtegic.kora.core.model.QueueEntryDto
import com.realtegic.kora.core.model.RescheduleAppointmentRequest
import com.realtegic.kora.core.network.ApiResult
import com.realtegic.kora.core.network.OrganizationAppointmentsApi
import com.realtegic.kora.core.network.safeApiCall
import com.squareup.moshi.Moshi

/**
 * Staff-assisted appointments (docs task Phase 3) -- every state
 * transition (cancel/reschedule/no-show) is server-decided; this app
 * never infers whether an action is allowed beyond what a permission
 * code makes visible.
 */
class OrganizationAppointmentsRepository(
    private val api: OrganizationAppointmentsApi,
    private val moshi: Moshi,
) {
    suspend fun list(organizationId: String, branchId: String, from: String, to: String): ApiResult<List<BusinessAppointmentDto>> =
        safeApiCall(moshi) { api.list(organizationId, branchId, from, to) }

    suspend fun get(organizationId: String, branchId: String, appointmentId: String): ApiResult<BusinessAppointmentDto> =
        safeApiCall(moshi) { api.get(organizationId, branchId, appointmentId) }

    suspend fun create(organizationId: String, branchId: String, request: CreateStaffAppointmentRequest): ApiResult<BusinessAppointmentDto> =
        safeApiCall(moshi) { api.create(organizationId, branchId, request) }

    suspend fun cancel(organizationId: String, branchId: String, appointmentId: String, reason: String?): ApiResult<BusinessAppointmentDto> =
        safeApiCall(moshi) { api.cancel(organizationId, branchId, appointmentId, CancelAppointmentRequest(reason)) }

    suspend fun reschedule(
        organizationId: String,
        branchId: String,
        appointmentId: String,
        startAt: String,
        staffProfileId: String?,
    ): ApiResult<BusinessAppointmentDto> =
        safeApiCall(moshi) { api.reschedule(organizationId, branchId, appointmentId, RescheduleAppointmentRequest(startAt, staffProfileId)) }

    suspend fun noShow(organizationId: String, branchId: String, appointmentId: String): ApiResult<BusinessAppointmentDto> =
        safeApiCall(moshi) { api.noShow(organizationId, branchId, appointmentId) }

    /** Repeated check-in of the same already-linked appointment must
     * not create a duplicate QueueEntry (docs task Phase 3) -- this is
     * enforced server-side; the repository is a thin, unopinionated
     * passthrough. */
    suspend fun checkIn(organizationId: String, appointmentId: String): ApiResult<QueueEntryDto> =
        safeApiCall(moshi) { api.checkIn(organizationId, appointmentId) }
}
