package com.realtegic.kora.core.navigation

/**
 * Every navigation destination, grouped by graph (docs task Phase 10:
 * "separate authenticated graphs -- AuthGraph, WorkspaceGraph,
 * CustomerGraph, BusinessGraph"). A booking is deliberately one
 * destination with internal wizard steps (branch/service/provider/date/
 * time/review are state within [com.realtegic.kora.feature.customer.booking.BookingViewModel],
 * not separate back-stack entries) rather than one route per micro-step
 * -- the flow is strictly linear and sharing one ViewModel-held idempotency
 * key and selection state across real navigation destinations would be
 * more fragile than the wizard-within-one-screen it actually is.
 */
object KoraRoutes {
    const val SPLASH = "splash"

    // Auth graph
    const val AUTH_GRAPH = "auth"
    const val AUTH_WELCOME = "auth/welcome"
    const val AUTH_EMAIL_ENTRY = "auth/email"
    const val AUTH_OTP_VERIFY = "auth/otp"

    // Reached only for a genuinely undecided, membership-less account
    // (docs task Phase 5) -- a standalone top-level route, not nested in
    // any graph, matching how ONBOARDING and INVITATION_PREVIEW are
    // already reached directly from the workspace-resolution decision.
    const val ACCOUNT_TYPE = "account-type"

    // Workspace graph
    const val WORKSPACE_GRAPH = "workspace"
    const val WORKSPACE_CHOOSER = "workspace/chooser"

    // Reached only the first time an account actually enters the
    // customer workspace, and only while its CustomerProfile still has
    // no phone number on file (docs task Phase 7) -- a standalone route
    // outside CUSTOMER_GRAPH itself, exactly like ACCOUNT_TYPE and
    // ONBOARDING, so back-navigation and the pop-through-on-success
    // semantics work the same well-understood way.
    const val CUSTOMER_PROFILE_SETUP = "customer/profile-setup"

    // Customer graph
    const val CUSTOMER_GRAPH = "customer"
    const val CUSTOMER_HOME = "customer/home"
    const val CUSTOMER_SEARCH = "customer/search"
    const val CUSTOMER_BUSINESS_DETAIL = "customer/business/{slug}"
    const val CUSTOMER_BRANCH_SERVICES = "customer/business/{slug}/branch/{branchId}"
    const val CUSTOMER_BOOKING = "customer/business/{slug}/branch/{branchId}/book"
    const val CUSTOMER_BOOKING_CONFIRMATION = "customer/booking-confirmation/{appointmentId}"
    const val CUSTOMER_APPOINTMENTS = "customer/appointments"
    const val CUSTOMER_APPOINTMENT_DETAIL = "customer/appointments/{appointmentId}"
    const val CUSTOMER_PROFILE = "customer/profile"
    const val CUSTOMER_FAVORITES = "customer/favorites"
    const val ACCOUNT_SETTINGS = "account/settings"
    const val ONBOARDING = "onboarding"

    // Invitation deep link -- a top-level route reachable regardless of
    // current auth state, since the preview itself needs no auth (docs
    // task "Invitation Deep Link and Acceptance").
    const val INVITATION_PREVIEW = "invitation/{token}"

    // Business graph -- the organizationId is carried as part of the
    // graph's own route pattern (rather than a SavedStateHandle hand-off
    // from the previous entry), since the previous entry is very often
    // popped with `inclusive = true` in the same navigate call (arriving
    // from Splash or the workspace chooser) and would take a
    // SavedStateHandle-held value down with it.
    const val BUSINESS_GRAPH_PATTERN = "business/{organizationId}"
    const val BUSINESS_DASHBOARD = "business/dashboard"
    const val BUSINESS_PROFILE = "business/profile"
    const val BUSINESS_SUBSCRIPTION = "business/subscription"

    fun businessDetail(slug: String) = "customer/business/$slug"
    fun branchServices(slug: String, branchId: String) = "customer/business/$slug/branch/$branchId"
    fun booking(slug: String, branchId: String) = "customer/business/$slug/branch/$branchId/book"
    fun bookingConfirmation(appointmentId: String) = "customer/booking-confirmation/$appointmentId"
    fun appointmentDetail(appointmentId: String) = "customer/appointments/$appointmentId"
    fun businessGraph(organizationId: String) = "business/$organizationId"
    fun invitationPreview(token: String) = "invitation/$token"
}
