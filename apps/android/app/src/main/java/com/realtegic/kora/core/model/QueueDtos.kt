package com.realtegic.kora.core.model

import com.squareup.moshi.JsonClass

/** Exactly one of [customerRecordId]/[newCustomer] must be set --
 * server-validated, never guessed client-side (docs task Phase 4). */
@JsonClass(generateAdapter = true)
data class CreateWalkInRequest(
    val customerRecordId: String? = null,
    val newCustomer: NewCustomerRequest? = null,
    val serviceIds: List<String>,
    val priority: String? = null,
    val notes: String? = null,
)

@JsonClass(generateAdapter = true)
data class AssignQueueStaffRequest(val staffProfileId: String)

@JsonClass(generateAdapter = true)
data class CancelQueueEntryRequest(val reason: String? = null)

/** Exact shape of `QueueEntryView` -- `status` is one of
 * WAITING/CALLED/IN_SERVICE/COMPLETED/CANCELLED/NO_SHOW. `ticketNumber`
 * and `status` are always server-derived; this app never computes
 * either locally (docs task Phase 5: "never set queue status locally as
 * authoritative"). */
@JsonClass(generateAdapter = true)
data class QueueEntryDto(
    val id: String,
    val organizationId: String,
    val branchId: String,
    val businessDate: String,
    val ticketNumber: Int,
    val source: String,
    val appointmentId: String?,
    val customerRecordId: String?,
    val customerName: String?,
    val customerPhoneE164: String?,
    val status: String,
    val priority: String,
    val assignedStaffProfileId: String?,
    val notes: String?,
    val joinedAt: String,
    val calledAt: String?,
    val serviceStartedAt: String?,
    val completedAt: String?,
    val cancelledAt: String?,
    val noShowAt: String?,
    val version: Int,
    val createdAt: String,
    val updatedAt: String,
    val services: List<QueueEntryServiceDto>,
)

@JsonClass(generateAdapter = true)
data class QueueEntryServiceDto(
    val serviceId: String,
    val serviceName: String,
    val displayOrder: Int,
)

@JsonClass(generateAdapter = true)
data class QueueCountsDto(
    val waiting: Int,
    val called: Int,
    @param:com.squareup.moshi.Json(name = "in_service") val inService: Int,
    val completed: Int,
    val cancelled: Int,
    @param:com.squareup.moshi.Json(name = "no_show") val noShow: Int,
)

/** [revision]/[serverTime] are the server's own polling primitives --
 * the app never infers "something changed" from anything but a fresh
 * fetch (docs task Phase 5, near-real-time foreground refresh). */
@JsonClass(generateAdapter = true)
data class QueueListDto(
    val branchId: String,
    val businessDate: String,
    val revision: Int,
    val serverTime: String,
    val entries: List<QueueEntryDto>,
    val counts: QueueCountsDto,
)
