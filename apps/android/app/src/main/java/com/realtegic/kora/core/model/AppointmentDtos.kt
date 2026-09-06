package com.realtegic.kora.core.model

import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class CreateAppointmentRequest(
    val businessSlug: String,
    val branchId: String,
    val serviceIds: List<String>,
    val staffProfileId: String? = null,
    val startAt: String,
    val idempotencyKey: String,
)

@JsonClass(generateAdapter = true)
data class CancelAppointmentRequest(val reason: String? = null)

@JsonClass(generateAdapter = true)
data class RescheduleAppointmentRequest(
    val startAt: String,
    val staffProfileId: String? = null,
)

/** Staff-assisted appointment creation -- exactly one of
 * [customerProfileId]/[newCustomer] must be set (server-validated; the
 * client never guesses which). */
@JsonClass(generateAdapter = true)
data class CreateStaffAppointmentRequest(
    val serviceIds: List<String>,
    val staffProfileId: String,
    val startAt: String,
    val customerProfileId: String? = null,
    val newCustomer: NewCustomerRequest? = null,
    val idempotencyKey: String? = null,
)

@JsonClass(generateAdapter = true)
data class NewCustomerRequest(
    val name: String,
    val phoneE164: String? = null,
    val email: String? = null,
)

/** Exact shape of `AppointmentView` (docs task Phase 7; `businessName`/
 * `businessSlug`/`providerDisplayName` added for Customer Marketplace
 * Design Batch 02, since `organizationId`/`branchId`/
 * `assignedStaffProfileId` alone are opaque ids a client cannot turn
 * into a human-readable name) -- `status` is always one of
 * CONFIRMED/CANCELLED/NO_SHOW; there is deliberately no COMPLETED status
 * here, since only a ServiceSession can prove work happened. */
@JsonClass(generateAdapter = true)
data class AppointmentDto(
    val id: String,
    val reference: String,
    val organizationId: String,
    val branchId: String,
    val status: String,
    val source: String,
    val customerProfileId: String?,
    val customerRecordId: String,
    val assignedStaffProfileId: String,
    val startAt: String,
    val endAt: String,
    val occupiedStartAt: String,
    val occupiedEndAt: String,
    val branchTimeZone: String,
    val currency: String,
    val totalPriceMinor: Long,
    val cancelledAt: String?,
    val cancelledReason: String?,
    val noShowMarkedAt: String?,
    val version: Int,
    val createdAt: String,
    val updatedAt: String,
    val items: List<AppointmentItemDto>,
    val businessName: String = "",
    val businessSlug: String? = null,
    val providerDisplayName: String? = null,
)

@JsonClass(generateAdapter = true)
data class AppointmentItemDto(
    val serviceId: String,
    val serviceName: String,
    val durationMinutes: Int,
    val priceMinor: Long,
    val currency: String,
    val displayOrder: Int,
)
