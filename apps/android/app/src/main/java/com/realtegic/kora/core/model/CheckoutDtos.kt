package com.realtegic.kora.core.model

import com.squareup.moshi.JsonClass

object CheckoutAdjustmentType {
    const val DISCOUNT = "DISCOUNT"
    const val SURCHARGE = "SURCHARGE"
}

@JsonClass(generateAdapter = true)
data class CreateCheckoutAdjustmentRequest(
    val type: String,
    val amountMinor: Long,
    val reason: String,
)

@JsonClass(generateAdapter = true)
data class VoidCheckoutRequest(val reason: String)

/** Exact shape of `CheckoutView` -- deliberately has no "paid"/"balance"
 * field; a caller derives outstanding balance from [status] plus the
 * separately fetched payment list (docs task Phase 7). Every money
 * field is already server-computed; this app never recalculates
 * [subtotalMinor]/[adjustmentTotalMinor]/[totalMinor]. */
@JsonClass(generateAdapter = true)
data class CheckoutDto(
    val id: String,
    val organizationId: String,
    val branchId: String,
    val serviceSessionId: String,
    val customerRecordId: String?,
    val assignedStaffProfileId: String,
    val reference: String,
    val status: String,
    val currency: String,
    val subtotalMinor: Long,
    val adjustmentTotalMinor: Long,
    val totalMinor: Long,
    val version: Int,
    val createdByMembershipId: String,
    val createdAt: String,
    val updatedAt: String,
    val settledAt: String?,
    val voidedAt: String?,
    val voidedByMembershipId: String?,
    val voidReason: String?,
    val items: List<CheckoutItemDto>,
    val adjustments: List<CheckoutAdjustmentDto>,
)

@JsonClass(generateAdapter = true)
data class CheckoutItemDto(
    val id: String,
    val serviceId: String,
    val staffProfileId: String,
    val serviceName: String,
    val durationMinutes: Int,
    val priceMinor: Long,
    val currency: String,
    val displayOrder: Int,
)

@JsonClass(generateAdapter = true)
data class CheckoutAdjustmentDto(
    val id: String,
    val type: String,
    val amountMinor: Long,
    val reason: String,
    val createdByMembershipId: String,
    val createdAt: String,
)
