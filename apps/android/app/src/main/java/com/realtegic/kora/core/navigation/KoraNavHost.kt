package com.realtegic.kora.core.navigation

import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.navigation
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.realtegic.kora.core.di.AppContainer
import com.realtegic.kora.core.network.ApiResult
import com.realtegic.kora.core.preferences.SelectedWorkspacePreference
import com.realtegic.kora.core.session.SessionState
import com.realtegic.kora.feature.auth.AuthViewModel
import com.realtegic.kora.feature.workspace.AccountTypeScreen
import com.realtegic.kora.feature.workspace.AccountTypeViewModel
import com.realtegic.kora.feature.auth.EmailEntryScreen
import com.realtegic.kora.feature.auth.OtpVerifyScreen
import com.realtegic.kora.feature.auth.SplashScreen
import com.realtegic.kora.feature.auth.SplashViewModel
import com.realtegic.kora.feature.auth.WelcomeScreen
import com.realtegic.kora.feature.business.dashboard.BusinessHomeScreen
import com.realtegic.kora.feature.business.onboarding.OnboardingScreen
import com.realtegic.kora.feature.business.onboarding.OnboardingViewModel
import com.realtegic.kora.feature.business.profile.BusinessProfileScreen
import com.realtegic.kora.feature.business.profile.BusinessProfileViewModel
import com.realtegic.kora.feature.business.subscription.SubscriptionScreen
import com.realtegic.kora.feature.business.subscription.SubscriptionViewModel
import com.realtegic.kora.feature.customer.appointments.AppointmentDetailScreen
import com.realtegic.kora.feature.customer.appointments.AppointmentDetailViewModel
import com.realtegic.kora.feature.customer.appointments.AppointmentsListScreen
import com.realtegic.kora.feature.customer.appointments.AppointmentsListViewModel
import com.realtegic.kora.feature.customer.booking.BookingConfirmationScreen
import com.realtegic.kora.feature.customer.booking.BookingConfirmationViewModel
import com.realtegic.kora.feature.customer.booking.BookingFlowScreen
import com.realtegic.kora.feature.customer.booking.BookingViewModel
import com.realtegic.kora.core.designsystem.CustomerBottomNavBar
import com.realtegic.kora.core.designsystem.CustomerTab
import com.realtegic.kora.feature.customer.discovery.BranchServicesScreen
import com.realtegic.kora.feature.customer.discovery.BranchServicesViewModel
import com.realtegic.kora.feature.customer.discovery.BusinessDetailScreen
import com.realtegic.kora.feature.customer.discovery.BusinessDetailViewModel
import com.realtegic.kora.feature.customer.discovery.DiscoveryViewModel
import com.realtegic.kora.feature.customer.discovery.SearchResultsScreen
import com.realtegic.kora.feature.customer.home.HomeScreen
import com.realtegic.kora.feature.customer.home.HomeViewModel
import com.realtegic.kora.feature.customer.profile.AccountSettingsScreen
import com.realtegic.kora.feature.customer.profile.AccountSettingsViewModel
import com.realtegic.kora.feature.customer.profile.CustomerProfileSetupScreen
import com.realtegic.kora.feature.customer.profile.CustomerProfileSetupViewModel
import com.realtegic.kora.feature.customer.profile.FavoritesScreen
import com.realtegic.kora.feature.customer.profile.FavoritesViewModel
import com.realtegic.kora.feature.customer.profile.ProfileScreen
import com.realtegic.kora.feature.customer.profile.ProfileViewModel
import com.realtegic.kora.feature.invitation.InvitationScreen
import com.realtegic.kora.feature.invitation.InvitationViewModel
import com.realtegic.kora.feature.workspace.WorkspaceChooserScreen
import com.realtegic.kora.feature.workspace.WorkspaceDecision
import com.realtegic.kora.feature.workspace.WorkspaceViewModel
import com.realtegic.kora.feature.workspace.decideInitialWorkspaceRoute
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

@Composable
fun KoraNavHost(container: AppContainer) {
    val navController = rememberNavController()

    // A staff-invitation deep link takes priority over normal session
    // routing regardless of when it arrives -- a cold start (this runs
    // before Splash's own session-restoration effect resolves, since
    // reading the in-memory token is synchronous) or a warm start (the
    // app already running, a new intent updates this same observed
    // state) both land here (docs task "Invitation Deep Link and
    // Acceptance"). `popUpTo(SPLASH)` is a safe no-op when Splash is not
    // on the back stack (the warm-start case).
    val pendingInvitationToken by container.pendingInvitationToken
    LaunchedEffect(pendingInvitationToken) {
        pendingInvitationToken?.let { token ->
            navController.navigate(KoraRoutes.invitationPreview(token)) {
                popUpTo(KoraRoutes.SPLASH) { inclusive = true }
            }
        }
    }

    NavHost(navController = navController, startDestination = KoraRoutes.SPLASH) {
        composable(KoraRoutes.SPLASH) {
            val splashViewModel = koraViewModel { SplashViewModel(container.authRepository) }
            val sessionState by splashViewModel.sessionState.collectAsState()
            SplashScreen(splashViewModel)

            LaunchedEffect(sessionState) {
                if (container.pendingInvitationToken.value != null) return@LaunchedEffect
                when (sessionState) {
                    is SessionState.SignedIn -> resolveAndNavigate(navController, container, popUpToRoute = KoraRoutes.SPLASH)
                    SessionState.SignedOut -> navController.navigate(KoraRoutes.AUTH_GRAPH) {
                        popUpTo(KoraRoutes.SPLASH) { inclusive = true }
                    }
                    else -> Unit
                }
            }
        }

        authGraph(navController, container)
        accountTypeGraph(navController, container)
        workspaceGraph(navController, container)
        customerProfileSetupGraph(navController, container)
        customerGraph(navController, container)
        businessGraph(navController, container)
        onboardingGraph(navController, container)
        invitationGraph(navController, container)
    }
}

/** Fetches workspaces fresh, revalidates any locally remembered
 * selection against that fresh result, and lands on the right graph --
 * used both after session restoration and immediately after a fresh
 * sign-in (docs task Phase 4). A stale or now-inaccessible remembered
 * organization is cleared and falls back to the normal decision rather
 * than ever being trusted outright. [popUpToRoute] is popped inclusive
 * on every branch, removing whichever entry-point stack segment got the
 * caller here -- Splash when resuming a session, or the auth graph after
 * a fresh OTP sign-in -- so that entry point is never reachable again via
 * the back button (docs task Stage 7 OTP screen: "Remove the OTP screen
 * from the back stack so the user cannot return to it after
 * authentication"). */
private suspend fun resolveAndNavigate(navController: NavHostController, container: AppContainer, popUpToRoute: String) {
    when (val result = container.workspacesRepository.getMyWorkspaces()) {
        is ApiResult.Success -> {
            val workspaces = result.value
            val stored = container.localPreferences.selectedWorkspace.first()
            val validOrganization = (stored as? SelectedWorkspacePreference.Organization)
                ?.let { pref -> workspaces.organizations.firstOrNull { it.organizationId == pref.organizationId } }

            when {
                validOrganization != null -> navigateToBusiness(navController, validOrganization.organizationId, popUpToRoute)
                stored is SelectedWorkspacePreference.Customer && workspaces.customerWorkspaceAvailable ->
                    navigateToCustomerHome(navController, popUpToRoute)
                else -> {
                    if (stored is SelectedWorkspacePreference.Organization) {
                        container.localPreferences.clearSelectedWorkspace()
                    }
                    when (val decision = decideInitialWorkspaceRoute(workspaces)) {
                        WorkspaceDecision.ShowAccountTypeChoice -> navController.navigate(KoraRoutes.ACCOUNT_TYPE) {
                            popUpTo(popUpToRoute) { inclusive = true }
                        }
                        is WorkspaceDecision.BusinessWorkspace -> navigateToBusiness(navController, decision.organizationId, popUpToRoute)
                        WorkspaceDecision.ShowChooser -> navController.navigate(KoraRoutes.WORKSPACE_GRAPH) {
                            popUpTo(popUpToRoute) { inclusive = true }
                        }
                    }
                }
            }
        }
        is ApiResult.Failure -> {
            navController.navigate(KoraRoutes.WORKSPACE_GRAPH) {
                popUpTo(popUpToRoute) { inclusive = true }
            }
        }
    }
}

private fun navigateToCustomerHome(navController: NavHostController, popUpToRoute: String) {
    navController.navigate(KoraRoutes.CUSTOMER_GRAPH) {
        popUpTo(popUpToRoute) { inclusive = true }
    }
}

/** The one place that decides whether a customer-bound account still
 * needs [KoraRoutes.CUSTOMER_PROFILE_SETUP] -- called every time
 * something actually commits to the customer workspace (docs task Phase
 * 7), not just the first time, since a returning customer who already
 * completed setup must reach Home exactly as fast as before. A failed
 * profile fetch fails open to Home rather than blocking entry, matching
 * how [resolveAndNavigate] itself never lets a transient error produce a
 * dead end. */
private suspend fun navigateToCustomerHomeOrProfileSetup(navController: NavHostController, container: AppContainer, popUpToRoute: String) {
    val needsProfileSetup = when (val result = container.customerProfileRepository.get()) {
        is ApiResult.Success -> result.value.phoneE164 == null
        is ApiResult.Failure -> false
    }
    if (needsProfileSetup) {
        navController.navigate(KoraRoutes.CUSTOMER_PROFILE_SETUP) {
            popUpTo(popUpToRoute) { inclusive = true }
        }
    } else {
        navigateToCustomerHome(navController, popUpToRoute)
    }
}

private fun navigateToBusiness(navController: NavHostController, organizationId: String, popUpToRoute: String) {
    navController.navigate(KoraRoutes.businessGraph(organizationId)) {
        popUpTo(popUpToRoute) { inclusive = true }
    }
}

private fun NavGraphBuilder.authGraph(navController: NavHostController, container: AppContainer) {
    navigation(startDestination = KoraRoutes.AUTH_WELCOME, route = KoraRoutes.AUTH_GRAPH) {
        composable(KoraRoutes.AUTH_WELCOME) {
            WelcomeScreen(onContinue = { navController.navigate(KoraRoutes.AUTH_EMAIL_ENTRY) })
        }
        composable(KoraRoutes.AUTH_EMAIL_ENTRY) { backStackEntry ->
            val authViewModel = rememberAuthGraphViewModel(navController, backStackEntry, container)
            val state by authViewModel.state.collectAsState()
            EmailEntryScreen(authViewModel, onBack = { navController.popBackStack() })
            LaunchedEffect(state.step) {
                if (state.step == com.realtegic.kora.feature.auth.AuthStep.OTP_VERIFY) {
                    navController.navigate(KoraRoutes.AUTH_OTP_VERIFY)
                }
            }
        }
        composable(KoraRoutes.AUTH_OTP_VERIFY) { backStackEntry ->
            val authViewModel = rememberAuthGraphViewModel(navController, backStackEntry, container)
            val coroutineScope = androidx.compose.runtime.rememberCoroutineScope()
            OtpVerifyScreen(
                authViewModel,
                onBack = { navController.popBackStack() },
                onSignedIn = {
                    coroutineScope.launch {
                        // A pending staff-invitation deep link takes
                        // priority over the normal post-sign-in
                        // workspace decision -- the user came here only
                        // because they tapped "Sign in to accept" from
                        // the invitation screen (docs task "Invitation
                        // Deep Link and Acceptance": "after
                        // authentication, return to the invitation").
                        val token = container.pendingInvitationToken.value
                        if (token != null) {
                            navController.navigate(KoraRoutes.invitationPreview(token)) {
                                popUpTo(KoraRoutes.AUTH_GRAPH) { inclusive = true }
                                launchSingleTop = true
                            }
                        } else {
                            resolveAndNavigate(navController, container, popUpToRoute = KoraRoutes.AUTH_GRAPH)
                        }
                    }
                },
                onUseDifferentEmail = {
                    authViewModel.changeEmail()
                    navController.popBackStack()
                },
            )
        }
    }
}

@Composable
private fun rememberAuthGraphViewModel(
    navController: NavHostController,
    backStackEntry: androidx.navigation.NavBackStackEntry,
    container: AppContainer,
): AuthViewModel {
    val parentEntry = remember(backStackEntry) { navController.getBackStackEntry(KoraRoutes.AUTH_GRAPH) }
    return viewModel(viewModelStoreOwner = parentEntry, factory = viewModelFactory { initializer { AuthViewModel(container.authRepository) } })
}

private fun NavGraphBuilder.accountTypeGraph(navController: NavHostController, container: AppContainer) {
    composable(KoraRoutes.ACCOUNT_TYPE) {
        val viewModel = koraViewModel { AccountTypeViewModel() }
        val coroutineScope = androidx.compose.runtime.rememberCoroutineScope()
        AccountTypeScreen(
            viewModel = viewModel,
            onCustomerContinue = {
                coroutineScope.launch {
                    container.localPreferences.setSelectedCustomerWorkspace()
                    navigateToCustomerHomeOrProfileSetup(navController, container, popUpToRoute = KoraRoutes.ACCOUNT_TYPE)
                }
            },
            onBusinessContinue = { navController.navigate(KoraRoutes.ONBOARDING) { popUpTo(KoraRoutes.ACCOUNT_TYPE) { inclusive = true } } },
        )
    }
}

private fun NavGraphBuilder.workspaceGraph(navController: NavHostController, container: AppContainer) {
    navigation(startDestination = KoraRoutes.WORKSPACE_CHOOSER, route = KoraRoutes.WORKSPACE_GRAPH) {
        composable(KoraRoutes.WORKSPACE_CHOOSER) {
            val viewModel = koraViewModel { WorkspaceViewModel(container.workspacesRepository, container.localPreferences, container.authRepository) }
            val coroutineScope = androidx.compose.runtime.rememberCoroutineScope()
            WorkspaceChooserScreen(
                viewModel = viewModel,
                onCustomerSelected = {
                    coroutineScope.launch {
                        navigateToCustomerHomeOrProfileSetup(navController, container, popUpToRoute = KoraRoutes.WORKSPACE_GRAPH)
                    }
                },
                onOrganizationSelected = { organizationId -> navigateToBusiness(navController, organizationId, popUpToRoute = KoraRoutes.WORKSPACE_GRAPH) },
                onCreateBusiness = { navController.navigate(KoraRoutes.ONBOARDING) },
                onSignInDifferentEmail = { navigateToSignedOut(navController) },
            )
        }
    }
}

private fun NavGraphBuilder.customerProfileSetupGraph(navController: NavHostController, container: AppContainer) {
    composable(KoraRoutes.CUSTOMER_PROFILE_SETUP) {
        val viewModel = koraViewModel { CustomerProfileSetupViewModel(container.customerProfileRepository, container.locationProvider) }
        CustomerProfileSetupScreen(
            viewModel = viewModel,
            onSaved = { navigateToCustomerHome(navController, popUpToRoute = KoraRoutes.CUSTOMER_PROFILE_SETUP) },
        )
    }
}

/** A top-level customer tab's own content, inset for the shared bottom
 * nav bar (docs task Batch 02 Phase 5). Nesting a `Scaffold` inside
 * another is a proven-safe pattern already established for the business
 * workspace's own per-tab screens (docs/ARCHITECTURE.md section 24) --
 * applying the outer [androidx.compose.foundation.layout.PaddingValues]
 * to every tab uniformly is exactly the fix that section's own
 * navigation-bar-overlap bug required, so it is applied here from the
 * start rather than risking the same bug again. */
@Composable
private fun CustomerTabScaffold(
    navController: NavHostController,
    currentTab: CustomerTab,
    content: @Composable () -> Unit,
) {
    androidx.compose.material3.Scaffold(
        bottomBar = {
            CustomerBottomNavBar(currentRoute = currentTab.route) { tab ->
                if (tab != currentTab) {
                    navController.navigate(tab.route) {
                        popUpTo(KoraRoutes.CUSTOMER_HOME) { saveState = true }
                        launchSingleTop = true
                        restoreState = true
                    }
                }
            }
        },
    ) { padding ->
        androidx.compose.foundation.layout.Box(modifier = androidx.compose.ui.Modifier.padding(padding)) {
            content()
        }
    }
}

private fun NavGraphBuilder.customerGraph(navController: NavHostController, container: AppContainer) {
    navigation(startDestination = KoraRoutes.CUSTOMER_HOME, route = KoraRoutes.CUSTOMER_GRAPH) {
        composable(KoraRoutes.CUSTOMER_HOME) {
            val viewModel = koraViewModel { HomeViewModel(container.discoveryRepository, container.appointmentsRepository, container.customerProfileRepository) }
            CustomerTabScaffold(navController, CustomerTab.HOME) {
                HomeScreen(
                    viewModel = viewModel,
                    onSearchTapped = { navController.navigate(CustomerTab.SEARCH.route) { popUpTo(KoraRoutes.CUSTOMER_HOME) { saveState = true }; launchSingleTop = true; restoreState = true } },
                    onNearYouTapped = { navController.navigate(CustomerTab.SEARCH.route) { popUpTo(KoraRoutes.CUSTOMER_HOME) { saveState = true }; launchSingleTop = true; restoreState = true } },
                    onCategoryTapped = { navController.navigate(CustomerTab.SEARCH.route) { popUpTo(KoraRoutes.CUSTOMER_HOME) { saveState = true }; launchSingleTop = true; restoreState = true } },
                    onBusinessTapped = { slug -> navController.navigate(KoraRoutes.businessDetail(slug)) },
                    onProfileTapped = { navController.navigate(CustomerTab.PROFILE.route) { popUpTo(KoraRoutes.CUSTOMER_HOME) { saveState = true }; launchSingleTop = true; restoreState = true } },
                    onUpcomingAppointmentTapped = { id -> navController.navigate(KoraRoutes.appointmentDetail(id)) },
                )
            }
        }
        composable(KoraRoutes.CUSTOMER_SEARCH) {
            val viewModel = koraViewModel { DiscoveryViewModel(container.discoveryRepository, container.locationProvider) }
            CustomerTabScaffold(navController, CustomerTab.SEARCH) {
                SearchResultsScreen(
                    viewModel = viewModel,
                    onBusinessTapped = { slug -> navController.navigate(KoraRoutes.businessDetail(slug)) },
                )
            }
        }
        composable(
            KoraRoutes.CUSTOMER_BUSINESS_DETAIL,
            arguments = listOf(navArgument("slug") { type = androidx.navigation.NavType.StringType }),
        ) { backStackEntry ->
            val slug = backStackEntry.arguments?.getString("slug").orEmpty()
            val viewModel = koraViewModel { BusinessDetailViewModel(slug, container.discoveryRepository, container.favoritesRepository) }
            BusinessDetailScreen(
                viewModel = viewModel,
                onBack = { navController.popBackStack() },
                onBranchSelected = { branchId -> navController.navigate(KoraRoutes.branchServices(slug, branchId)) },
            )
        }
        composable(
            KoraRoutes.CUSTOMER_BRANCH_SERVICES,
            arguments = listOf(
                navArgument("slug") { type = androidx.navigation.NavType.StringType },
                navArgument("branchId") { type = androidx.navigation.NavType.StringType },
            ),
        ) { backStackEntry ->
            val slug = backStackEntry.arguments?.getString("slug").orEmpty()
            val branchId = backStackEntry.arguments?.getString("branchId").orEmpty()
            val viewModel = koraViewModel { BranchServicesViewModel(slug, branchId, container.discoveryRepository) }
            BranchServicesScreen(
                viewModel = viewModel,
                onBack = { navController.popBackStack() },
                onContinue = { serviceId ->
                    navController.currentBackStackEntry?.savedStateHandle?.set("serviceId", serviceId)
                    navController.navigate(KoraRoutes.booking(slug, branchId))
                },
            )
        }
        composable(
            KoraRoutes.CUSTOMER_BOOKING,
            arguments = listOf(
                navArgument("slug") { type = androidx.navigation.NavType.StringType },
                navArgument("branchId") { type = androidx.navigation.NavType.StringType },
            ),
        ) { backStackEntry ->
            val slug = backStackEntry.arguments?.getString("slug").orEmpty()
            val branchId = backStackEntry.arguments?.getString("branchId").orEmpty()
            val previousEntry = remember(backStackEntry) { navController.previousBackStackEntry }
            val serviceId = previousEntry?.savedStateHandle?.get<String>("serviceId").orEmpty()
            val viewModel = koraViewModel {
                BookingViewModel(slug, branchId, serviceId, container.discoveryRepository, container.appointmentsRepository)
            }
            BookingFlowScreen(
                viewModel = viewModel,
                onBack = { navController.popBackStack() },
                onBooked = { appointmentId ->
                    navController.navigate(KoraRoutes.bookingConfirmation(appointmentId)) {
                        popUpTo(KoraRoutes.CUSTOMER_HOME)
                    }
                },
            )
        }
        composable(
            KoraRoutes.CUSTOMER_BOOKING_CONFIRMATION,
            arguments = listOf(navArgument("appointmentId") { type = androidx.navigation.NavType.StringType }),
        ) { backStackEntry ->
            val appointmentId = backStackEntry.arguments?.getString("appointmentId").orEmpty()
            val viewModel = koraViewModel { BookingConfirmationViewModel(appointmentId, container.appointmentsRepository) }
            BookingConfirmationScreen(
                viewModel = viewModel,
                onViewAppointment = { id ->
                    navController.navigate(KoraRoutes.appointmentDetail(id)) { popUpTo(KoraRoutes.CUSTOMER_HOME) }
                },
                onDone = { navController.popBackStack(KoraRoutes.CUSTOMER_HOME, inclusive = false) },
            )
        }
        composable(KoraRoutes.CUSTOMER_APPOINTMENTS) {
            val viewModel = koraViewModel { AppointmentsListViewModel(container.appointmentsRepository) }
            CustomerTabScaffold(navController, CustomerTab.APPOINTMENTS) {
                AppointmentsListScreen(
                    viewModel = viewModel,
                    onAppointmentTapped = { id -> navController.navigate(KoraRoutes.appointmentDetail(id)) },
                    onBookNew = {
                        navController.navigate(CustomerTab.SEARCH.route) {
                            popUpTo(KoraRoutes.CUSTOMER_HOME) { saveState = true }
                            launchSingleTop = true
                            restoreState = true
                        }
                    },
                )
            }
        }
        composable(
            KoraRoutes.CUSTOMER_APPOINTMENT_DETAIL,
            arguments = listOf(navArgument("appointmentId") { type = androidx.navigation.NavType.StringType }),
        ) { backStackEntry ->
            val appointmentId = backStackEntry.arguments?.getString("appointmentId").orEmpty()
            val viewModel = koraViewModel { AppointmentDetailViewModel(appointmentId, container.appointmentsRepository, container.discoveryRepository) }
            AppointmentDetailScreen(viewModel, onBack = { navController.popBackStack() })
        }
        composable(KoraRoutes.CUSTOMER_PROFILE) {
            val viewModel = koraViewModel { ProfileViewModel(container.authRepository) }
            CustomerTabScaffold(navController, CustomerTab.PROFILE) {
                ProfileScreen(
                    viewModel = viewModel,
                    onFavorites = {
                        navController.navigate(CustomerTab.FAVORITES.route) {
                            popUpTo(KoraRoutes.CUSTOMER_HOME) { saveState = true }
                            launchSingleTop = true
                            restoreState = true
                        }
                    },
                    onAccountSettings = { navController.navigate(KoraRoutes.ACCOUNT_SETTINGS) },
                    onSwitchWorkspace = {
                        navController.navigate(KoraRoutes.WORKSPACE_GRAPH) { popUpTo(KoraRoutes.CUSTOMER_GRAPH) { inclusive = true } }
                    },
                    onCreateBusiness = { navController.navigate(KoraRoutes.ONBOARDING) },
                    onSignedOut = { navigateToSignedOut(navController) },
                )
            }
        }
        composable(KoraRoutes.CUSTOMER_FAVORITES) {
            val viewModel = koraViewModel { FavoritesViewModel(container.favoritesRepository) }
            CustomerTabScaffold(navController, CustomerTab.FAVORITES) {
                FavoritesScreen(
                    viewModel = viewModel,
                    onBusinessTapped = { slug -> navController.navigate(KoraRoutes.businessDetail(slug)) },
                )
            }
        }
        composable(KoraRoutes.ACCOUNT_SETTINGS) {
            val viewModel = koraViewModel { AccountSettingsViewModel(container.authRepository) }
            AccountSettingsScreen(
                viewModel = viewModel,
                onBack = { navController.popBackStack() },
                onSignedOutEverywhere = { navigateToSignedOut(navController) },
            )
        }
    }
}

private fun NavGraphBuilder.businessGraph(navController: NavHostController, container: AppContainer) {
    navigation(
        startDestination = KoraRoutes.BUSINESS_DASHBOARD,
        route = KoraRoutes.BUSINESS_GRAPH_PATTERN,
        arguments = listOf(navArgument("organizationId") { type = androidx.navigation.NavType.StringType }),
    ) {
        composable(KoraRoutes.BUSINESS_DASHBOARD) { backStackEntry ->
            val organizationId = remember(backStackEntry) {
                navController.getBackStackEntry(KoraRoutes.BUSINESS_GRAPH_PATTERN).arguments?.getString("organizationId").orEmpty()
            }
            BusinessHomeScreen(
                organizationId = organizationId,
                container = container,
                onSwitchWorkspace = {
                    navController.navigate(KoraRoutes.WORKSPACE_GRAPH) { popUpTo(KoraRoutes.BUSINESS_GRAPH_PATTERN) { inclusive = true } }
                },
                onSubscription = { navController.navigate(KoraRoutes.BUSINESS_SUBSCRIPTION) },
                onBusinessProfile = { navController.navigate(KoraRoutes.BUSINESS_PROFILE) },
            )
        }
        composable(KoraRoutes.BUSINESS_PROFILE) { backStackEntry ->
            val organizationId = remember(backStackEntry) {
                navController.getBackStackEntry(KoraRoutes.BUSINESS_GRAPH_PATTERN).arguments?.getString("organizationId").orEmpty()
            }
            val viewModel = koraViewModel { BusinessProfileViewModel(organizationId, container.businessProfileRepository) }
            BusinessProfileScreen(viewModel = viewModel, onBack = { navController.popBackStack() })
        }
        composable(KoraRoutes.BUSINESS_SUBSCRIPTION) { backStackEntry ->
            val organizationId = remember(backStackEntry) {
                navController.getBackStackEntry(KoraRoutes.BUSINESS_GRAPH_PATTERN).arguments?.getString("organizationId").orEmpty()
            }
            val viewModel = koraViewModel { SubscriptionViewModel(organizationId, container.subscriptionRepository) }
            SubscriptionScreen(viewModel = viewModel, onBack = { navController.popBackStack() })
        }
    }
}

private fun NavGraphBuilder.onboardingGraph(navController: NavHostController, container: AppContainer) {
    composable(KoraRoutes.ONBOARDING) {
        val viewModel = koraViewModel {
            OnboardingViewModel(
                container.organizationsRepository,
                container.serviceCatalogueRepository,
                container.schedulingRepository,
                container.staffRepository,
                container.localPreferences,
            )
        }
        val coroutineScope = androidx.compose.runtime.rememberCoroutineScope()
        val state by viewModel.state.collectAsState()
        OnboardingScreen(
            viewModel = viewModel,
            onBack = { navController.popBackStack() },
            onDone = {
                val organizationId = state.organizationId
                if (organizationId != null) {
                    coroutineScope.launch {
                        container.localPreferences.setSelectedOrganizationWorkspace(organizationId)
                        navController.navigate(KoraRoutes.businessGraph(organizationId)) {
                            popUpTo(KoraRoutes.ONBOARDING) { inclusive = true }
                        }
                    }
                }
            },
        )
    }
}

private fun NavGraphBuilder.invitationGraph(navController: NavHostController, container: AppContainer) {
    composable(
        KoraRoutes.INVITATION_PREVIEW,
        arguments = listOf(navArgument("token") { type = androidx.navigation.NavType.StringType }),
    ) { backStackEntry ->
        val token = backStackEntry.arguments?.getString("token").orEmpty()
        val viewModel = koraViewModel { InvitationViewModel(token, container.staffRepository, container.authRepository) }
        val coroutineScope = androidx.compose.runtime.rememberCoroutineScope()
        InvitationScreen(
            viewModel = viewModel,
            onSignInRequested = { navController.navigate(KoraRoutes.AUTH_GRAPH) },
            onAccepted = { organizationId ->
                container.pendingInvitationToken.value = null
                coroutineScope.launch {
                    container.localPreferences.setSelectedOrganizationWorkspace(organizationId)
                    // By the time acceptance succeeds, the back stack is
                    // always just [INVITATION_PREVIEW] -- either a raw
                    // deep-link landing (Splash already popped inclusive
                    // by the LaunchedEffect above) or the post-OTP-sign-in
                    // handoff (AUTH_GRAPH already popped inclusive) --
                    // so popping through this route itself is what
                    // actually removes it.
                    navigateToBusiness(navController, organizationId, popUpToRoute = KoraRoutes.INVITATION_PREVIEW)
                }
            },
            onDone = {
                container.pendingInvitationToken.value = null
                navController.popBackStack()
            },
        )
    }
}

/** Clears the entire back stack down to nothing before landing on the
 * auth graph, so pressing back from Welcome exits the app rather than
 * returning to an authenticated screen (docs task Phase 10). */
private fun navigateToSignedOut(navController: NavHostController) {
    navController.navigate(KoraRoutes.AUTH_GRAPH) {
        popUpTo(0) { inclusive = true }
    }
}
