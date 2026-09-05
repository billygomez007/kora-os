package com.realtegic.kora.core.model

import com.squareup.moshi.JsonClass

/** Matches the backend's exact `BusinessProfileVisibility` enum values
 * verbatim -- PRIVATE (default), LINK_ONLY (reachable only by direct
 * slug, never in search), or PUBLIC (searchable and directly
 * resolvable). */
object BusinessProfileVisibility {
    const val PRIVATE = "PRIVATE"
    const val LINK_ONLY = "LINK_ONLY"
    const val PUBLIC = "PUBLIC"
}

/** A concrete (non-generic) envelope, deliberately not
 * `ApiSuccessEnvelope&lt;BusinessProfileDto&gt;`: the backend returns
 * `"data": null` (never a 404) for an organization that has not
 * configured a profile yet, and Moshi's generated adapter for the
 * shared generic envelope cannot express a nullable `T` at a specific
 * call site -- it enforces non-null based on the class's own unbound
 * type-parameter declaration regardless of how a caller instantiates
 * it. A concrete class with a directly nullable field does not have
 * this limitation. */
@JsonClass(generateAdapter = true)
data class BusinessProfileEnvelope(
    val data: BusinessProfileDto?,
    val page: PageInfo? = null,
    val meta: ApiMeta,
)

@JsonClass(generateAdapter = true)
data class BusinessProfileDto(
    val id: String,
    val organizationId: String,
    val slug: String,
    val displayName: String,
    val description: String?,
    val logoImageUrl: String?,
    val coverImageUrl: String?,
    val visibility: String,
    val verificationStatus: String,
    val searchKeywords: String?,
    val publishedAt: String?,
)

@JsonClass(generateAdapter = true)
data class UpsertBusinessProfileRequest(
    val slug: String? = null,
    val displayName: String,
    val description: String? = null,
    val logoImageUrl: String? = null,
    val coverImageUrl: String? = null,
    val visibility: String? = null,
    val searchKeywords: String? = null,
    val categoryCodes: List<String>? = null,
)

@JsonClass(generateAdapter = true)
data class UpdateBranchDiscoveryRequest(
    val latitude: Double? = null,
    val longitude: Double? = null,
    val publicPhone: String? = null,
    val publicEmail: String? = null,
    val openingHoursNote: String? = null,
    val isDiscoverable: Boolean? = null,
)
