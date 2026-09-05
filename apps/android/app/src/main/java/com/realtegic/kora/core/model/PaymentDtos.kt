package com.realtegic.kora.core.model

import com.squareup.moshi.JsonClass

/** Recording categories only -- no payment-gateway integration exists
 * behind any of these (docs task locked rules: never claim a bank,
 * card processor, or mobile-money provider confirmed settlement). */
object PaymentMethod {
    const val CASH = "CASH"
    const val MOBILE_MONEY = "MOBILE_MONEY"
    const val CARD = "CARD"
    const val BANK_TRANSFER = "BANK_TRANSFER"
    const val OTHER = "OTHER"
}

/** [tenderedAmountMinor] and [cashSessionId] are CASH-only fields --
 * the server rejects either on a non-CASH method. [externalReference]
 * is a safe code only (docs task: never a card/account number) --
 * validated server-side, but this app also never accepts anything that
 * looks like a full card/account number in that field. */
@JsonClass(generateAdapter = true)
data class RecordPaymentRequest(
    val method: String,
    val appliedAmountMinor: Long,
    val currency: String,
    val tenderedAmountMinor: Long? = null,
    val externalReference: String? = null,
    val note: String? = null,
    val cashSessionId: String? = null,
)

/** Exact shape of `PaymentRecordView`. [changeMinor] is server-derived
 * (CASH only) -- never computed client-side. A `RECORDED` payment is
 * only ever a claim; nothing in this app treats it as revenue until a
 * `Transaction` is independently confirmed posted (docs task locked
 * rules). */
@JsonClass(generateAdapter = true)
data class PaymentRecordDto(
    val id: String,
    val organizationId: String,
    val branchId: String,
    val checkoutId: String,
    val reference: String,
    val method: String,
    val status: String,
    val appliedAmountMinor: Long,
    val tenderedAmountMinor: Long?,
    val changeMinor: Long?,
    val currency: String,
    val externalReference: String?,
    val note: String?,
    val recordedByMembershipId: String,
    val confirmationRequiredByStaffProfileId: String?,
    val confirmedByMembershipId: String?,
    val recordedAt: String,
    val confirmedAt: String?,
    val disputedAt: String?,
    val voidedAt: String?,
    val voidedByMembershipId: String?,
    val voidReason: String?,
    val version: Int,
    val createdAt: String,
    val updatedAt: String,
)

/** [reason] is optional for an ordinary self-confirmation but mandatory
 * for a management override -- the server enforces this; the client
 * only prompts for it when [PaymentDto]'s own eligibility already
 * indicates an override is what's happening (docs task Phase 10). */
@JsonClass(generateAdapter = true)
data class ConfirmPaymentRequest(val reason: String? = null)

@JsonClass(generateAdapter = true)
data class DisputePaymentRequest(val reason: String)

@JsonClass(generateAdapter = true)
data class VoidPaymentRequest(val reason: String)

object PaymentDisputeResolution {
    const val CONFIRM_PAYMENT = "CONFIRM_PAYMENT"
    const val REJECT_PAYMENT = "REJECT_PAYMENT"
}

@JsonClass(generateAdapter = true)
data class ResolvePaymentDisputeRequest(
    val resolution: String,
    val resolutionNote: String? = null,
)

/** Exact shape of `PaymentDisputeView`. */
/** [payment] is the safe payment-claim summary this dispute is about --
 * embedded server-side since no standalone "get payment by id"
 * endpoint exists (docs task Phase 10). */
@JsonClass(generateAdapter = true)
data class PaymentDisputeDto(
    val id: String,
    val organizationId: String,
    val paymentRecordId: String,
    val status: String,
    val reason: String,
    val openedByMembershipId: String,
    val openedAt: String,
    val resolvedByMembershipId: String?,
    val resolvedAt: String?,
    val resolution: String?,
    val resolutionNote: String?,
    val payment: PaymentRecordDto? = null,
)
