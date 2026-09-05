package com.realtegic.kora.core.model

import com.squareup.moshi.JsonClass

object CommissionAccrualKind {
    const val EARNED = "EARNED"
    const val REFUNDED = "REFUNDED"
    const val REVERSED = "REVERSED"
}

/** Exact shape of `MyEarningsLineView`. The caller's own StaffProfile is
 * always resolved server-side from the authenticated membership -- this
 * app never supplies a staffProfileId to this endpoint, and never
 * derives an earnings figure from a locally cached commission rate or
 * mutable Service price (docs task Phase 12). */
@JsonClass(generateAdapter = true)
data class MyEarningsLineDto(
    val id: String,
    val organizationId: String,
    val transactionId: String,
    val transactionLineItemId: String?,
    val staffProfileId: String,
    val commissionRuleId: String?,
    val kind: String,
    val originalAccrualId: String?,
    val source: String,
    val ruleTypeSnapshot: String?,
    val rateBasisPointsSnapshot: Int?,
    val fixedAmountMinorSnapshot: Long?,
    val basisSnapshot: String?,
    val basisAmountMinor: Long,
    val calculatedAmountMinor: Long,
    val currency: String,
    val calculatedAt: String,
    val createdAt: String,
    val transactionReference: String,
    val transactionPostedAt: String,
    val serviceId: String?,
    val serviceName: String?,
)
