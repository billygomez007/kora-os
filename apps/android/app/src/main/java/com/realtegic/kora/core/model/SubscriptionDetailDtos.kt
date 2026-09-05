package com.realtegic.kora.core.model

import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class SubscriptionUsageDto(
    val branchesUsed: Int,
    val branchesMax: Int?,
    val staffUsed: Int,
    val staffMax: Int?,
)

/**
 * The one place a plan name, trial end date, or usage-vs-limit figure
 * reaches Android (docs task "Subscription-Aware Setup"). `entitlements`
 * values are dynamically typed by the server (boolean/number/string
 * depending on the entitlement code) -- read defensively, never assumed
 * to be a fixed shape. Never used to make an authorization decision on
 * this device: `accessMode` here is informational display only, and
 * every protected write is still independently authorized server-side
 * regardless of what this screen last showed.
 */
@JsonClass(generateAdapter = true)
data class SubscriptionDetailDto(
    val planCode: String,
    val planName: String,
    val status: String,
    val accessMode: String,
    val trialEndsAt: String?,
    val currentPeriodEndsAt: String?,
    val entitlements: Map<String, Any>,
    val usage: SubscriptionUsageDto,
)
