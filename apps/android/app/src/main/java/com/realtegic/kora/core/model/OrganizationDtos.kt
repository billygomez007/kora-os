package com.realtegic.kora.core.model

import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class CreatePrimaryBranchRequest(
    val name: String,
    val code: String,
)

@JsonClass(generateAdapter = true)
data class CreateOrganizationRequest(
    val name: String,
    val slug: String,
    val businessType: String,
    val defaultCurrency: String,
    val timeZone: String,
    val countryCode: String,
    val primaryBranch: CreatePrimaryBranchRequest,
)

@JsonClass(generateAdapter = true)
data class OrganizationDto(
    val id: String,
    val name: String,
    val slug: String,
    val businessType: String,
    val defaultCurrency: String,
    val timeZone: String,
    val countryCode: String,
    val status: String,
)

@JsonClass(generateAdapter = true)
data class OrganizationMembershipDto(
    val id: String,
    val organizationId: String,
    val userId: String,
    val status: String,
)

@JsonClass(generateAdapter = true)
data class BranchDto(
    val id: String,
    val organizationId: String,
    val name: String,
    val code: String,
    val countryCode: String,
    val timeZone: String,
    val currency: String,
    val status: String,
)

@JsonClass(generateAdapter = true)
data class OrganizationSubscriptionSummaryDto(
    val id: String,
    val organizationId: String,
    val status: String,
)

/** `entitlements` values are dynamically typed (boolean/number/string
 * depending on the entitlement) -- kept as `Any` and read defensively,
 * mirroring how the backend itself resolves them from data rather than
 * a fixed schema. */
@JsonClass(generateAdapter = true)
data class OnboardOrganizationResponseDto(
    val organization: OrganizationDto,
    val ownerMembership: OrganizationMembershipDto,
    val primaryBranch: BranchDto,
    val subscription: OrganizationSubscriptionSummaryDto,
    val entitlements: Map<String, Any>,
)

@JsonClass(generateAdapter = true)
data class OrganizationSummaryDto(
    val id: String,
    val name: String,
    val slug: String,
    val status: String,
    val membershipId: String,
)

/** Every boolean here is computed by the server from real database
 * state -- the client only ever renders it, never sets it (docs task
 * "Business Onboarding Contract"). */
@JsonClass(generateAdapter = true)
data class OrganizationSetupStatusDto(
    val organizationCreated: Boolean,
    val firstBranchCreated: Boolean,
    val businessProfileConfigured: Boolean,
    val serviceCreated: Boolean,
    val branchHoursConfigured: Boolean,
    val staffInvitationSent: Boolean,
    val profilePublicationEligible: Boolean,
)
