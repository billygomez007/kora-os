package com.realtegic.kora.core.model

import com.squareup.moshi.JsonClass

/** Omit [staffProfileId] to use the queue entry's already-assigned
 * provider -- required only if none is assigned yet, or to redirect to
 * a different provider (server-authorized separately, docs task Phase
 * 6). */
@JsonClass(generateAdapter = true)
data class StartServiceSessionRequest(val staffProfileId: String? = null)

@JsonClass(generateAdapter = true)
data class ReplaceServiceSessionItemsRequest(val serviceIds: List<String>)

@JsonClass(generateAdapter = true)
data class CancelServiceSessionRequest(
    val reason: String,
    val disposition: String,
)

object ServiceSessionCancelDisposition {
    const val RETURN_TO_QUEUE = "RETURN_TO_QUEUE"
    const val CANCEL_VISIT = "CANCEL_VISIT"
}

/** Exact shape of `ServiceSessionView` -- deliberately carries no
 * payment/transaction/commission field, since none of those exist at
 * this layer (docs task Phase 6). [startedAt] is the only source for
 * an elapsed-time display; the server, never the client, decides when
 * a session actually completes or cancels. */
@JsonClass(generateAdapter = true)
data class ServiceSessionDto(
    val id: String,
    val organizationId: String,
    val branchId: String,
    val queueEntryId: String,
    val appointmentId: String?,
    val customerRecordId: String?,
    val assignedStaffProfileId: String,
    val status: String,
    val currency: String,
    val serviceTotalMinor: Long,
    val startedAt: String,
    val completedAt: String?,
    val cancelledAt: String?,
    val cancelReason: String?,
    val cancelDisposition: String?,
    val version: Int,
    val createdAt: String,
    val updatedAt: String,
    val items: List<ServiceSessionItemDto>,
)

@JsonClass(generateAdapter = true)
data class ServiceSessionItemDto(
    val serviceId: String,
    val staffProfileId: String,
    val serviceName: String,
    val durationMinutes: Int,
    val priceMinor: Long,
    val currency: String,
    val displayOrder: Int,
)
