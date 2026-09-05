package com.realtegic.kora.core.model

import com.squareup.moshi.JsonClass

/**
 * The standard Kora API response envelope (docs/API_SPEC.md section 4):
 * every success response is `{ data, page?, meta }`; `page` is a sibling
 * of `data`, present only when the handler returned a paginated result.
 */
@JsonClass(generateAdapter = true)
data class ApiSuccessEnvelope<T>(
    val data: T,
    val page: PageInfo? = null,
    val meta: ApiMeta,
)

/** The standard Kora API error envelope (docs/API_SPEC.md section 5):
 * `{ error: { code, message, retryable }, meta }` -- never a `data` key. */
@JsonClass(generateAdapter = true)
data class ApiErrorEnvelope(
    val error: ApiErrorBody,
    val meta: ApiMeta,
)

@JsonClass(generateAdapter = true)
data class ApiErrorBody(
    val code: String,
    val message: String,
    val retryable: Boolean = false,
)

@JsonClass(generateAdapter = true)
data class ApiMeta(
    val requestId: String,
)

@JsonClass(generateAdapter = true)
data class PageInfo(
    val hasMore: Boolean,
    val nextCursor: String?,
)

/** A currency-separated minor-units amount, used throughout reporting
 * and money display -- never a Double/Float (docs task Phase 7: "never
 * use Double/Float for calculations"). */
@JsonClass(generateAdapter = true)
data class CurrencyAmountDto(
    val currency: String,
    val amountMinor: Long,
)
