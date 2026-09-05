package com.realtegic.kora.core.model

import com.squareup.moshi.JsonClass

object TransactionKind {
    const val SALE = "SALE"
    const val REFUND = "REFUND"
    const val REVERSAL = "REVERSAL"
}

/** Exact shape of `TransactionView`. There is no create/update/delete
 * endpoint for this resource anywhere -- posting is fully internal,
 * triggered only by a fully-confirmed checkout settlement (docs task
 * locked rules: "only a POSTED Transaction counts as revenue"). This
 * app only ever reads one, never constructs or infers one locally. */
@JsonClass(generateAdapter = true)
data class TransactionDto(
    val id: String,
    val organizationId: String,
    val branchId: String,
    val checkoutId: String?,
    val serviceSessionId: String?,
    val customerRecordId: String?,
    val assignedStaffProfileId: String?,
    val reference: String,
    val status: String,
    val kind: String,
    val correctedTransactionId: String?,
    val currency: String,
    val subtotalMinor: Long,
    val adjustmentTotalMinor: Long,
    val totalMinor: Long,
    val postedAt: String,
    val createdAt: String,
    val items: List<TransactionItemDto>,
    val allocations: List<TransactionAllocationDto>,
)

@JsonClass(generateAdapter = true)
data class TransactionItemDto(
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
data class TransactionAllocationDto(
    val id: String,
    val paymentRecordId: String,
    val appliedAmountMinor: Long,
    val createdAt: String,
)
