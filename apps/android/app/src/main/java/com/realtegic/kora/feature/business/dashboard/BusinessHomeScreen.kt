package com.realtegic.kora.feature.business.dashboard

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AttachMoney
import androidx.compose.material.icons.filled.BarChart
import androidx.compose.material.icons.filled.Checklist
import androidx.compose.material.icons.automirrored.filled.EventNote
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.FormatListNumbered
import androidx.compose.material.icons.filled.Gavel
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.Receipt
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material.icons.filled.Work
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.realtegic.kora.core.designsystem.ErrorStateView
import com.realtegic.kora.core.designsystem.LoadingStateView
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.di.AppContainer
import com.realtegic.kora.core.model.BranchDto
import com.realtegic.kora.core.model.WorkspaceOrganizationDto
import com.realtegic.kora.core.navigation.koraViewModel
import com.realtegic.kora.core.network.ApiResult
import com.realtegic.kora.feature.business.appointments.AppointmentDetailScreen
import com.realtegic.kora.feature.business.appointments.AppointmentDetailViewModel
import com.realtegic.kora.feature.business.appointments.OrganizationAppointmentsScreen
import com.realtegic.kora.feature.business.appointments.OrganizationAppointmentsViewModel
import com.realtegic.kora.feature.business.branchservices.BranchServicesScreen
import com.realtegic.kora.feature.business.branchservices.BranchServicesViewModel
import com.realtegic.kora.feature.business.checkout.CheckoutScreen
import com.realtegic.kora.feature.business.checkout.CheckoutSessionsScreen
import com.realtegic.kora.feature.business.checkout.CheckoutSessionsViewModel
import com.realtegic.kora.feature.business.checkout.CheckoutViewModel
import com.realtegic.kora.feature.business.earnings.StaffEarningsScreen
import com.realtegic.kora.feature.business.earnings.StaffEarningsViewModel
import com.realtegic.kora.feature.business.mywork.ActiveServiceScreen
import com.realtegic.kora.feature.business.mywork.ActiveServiceViewModel
import com.realtegic.kora.feature.business.mywork.MyWorkScreen
import com.realtegic.kora.feature.business.mywork.MyWorkViewModel
import com.realtegic.kora.feature.business.payments.RecordPaymentScreen
import com.realtegic.kora.feature.business.payments.RecordPaymentViewModel
import com.realtegic.kora.feature.business.queue.QueueEntryDetailScreen
import com.realtegic.kora.feature.business.queue.QueueEntryDetailViewModel
import com.realtegic.kora.feature.business.queue.QueueScreen
import com.realtegic.kora.feature.business.queue.QueueViewModel
import com.realtegic.kora.feature.business.receipts.ReceiptScreen
import com.realtegic.kora.feature.business.receipts.ReceiptViewModel
import com.realtegic.kora.feature.business.receipts.ReceiptsListScreen
import com.realtegic.kora.feature.business.receipts.ReceiptsListViewModel
import com.realtegic.kora.feature.business.reports.ReportsScreen
import com.realtegic.kora.feature.business.reports.ReportsViewModel
import com.realtegic.kora.feature.business.resolution.DisputeResolutionDetailScreen
import com.realtegic.kora.feature.business.resolution.DisputeResolutionDetailViewModel
import com.realtegic.kora.feature.business.resolution.DisputeResolutionListScreen
import com.realtegic.kora.feature.business.resolution.DisputeResolutionListViewModel
import com.realtegic.kora.feature.business.schedule.BusinessHoursScreen
import com.realtegic.kora.feature.business.schedule.BusinessHoursViewModel
import com.realtegic.kora.feature.business.services.ServicesScreen
import com.realtegic.kora.feature.business.services.ServicesViewModel
import com.realtegic.kora.feature.business.setup.SetupScreen
import com.realtegic.kora.feature.business.setup.SetupViewModel
import com.realtegic.kora.feature.business.team.TeamScreen
import com.realtegic.kora.feature.business.team.TeamViewModel
import com.realtegic.kora.feature.business.transactions.TransactionDetailScreen
import com.realtegic.kora.feature.business.transactions.TransactionDetailViewModel
import com.realtegic.kora.feature.business.transactions.TransactionsListScreen
import com.realtegic.kora.feature.business.transactions.TransactionsListViewModel
import com.realtegic.kora.feature.business.verifications.VerificationsScreen
import com.realtegic.kora.feature.business.verifications.VerificationsViewModel
import com.realtegic.kora.feature.business.walkin.WalkInScreen
import com.realtegic.kora.feature.business.walkin.WalkInViewModel

/** Every nested route this business workspace's own [rememberNavController]
 * knows about -- deliberately a real Navigation-Compose graph (not a
 * hand-rolled per-tab stack) so hardware back, deep drill-down (Queue ->
 * entry -> active service -> checkout -> record payment), and argument
 * passing all come from the same, already-proven mechanism the
 * customer-facing graph in [com.realtegic.kora.core.navigation.KoraNavHost]
 * already uses -- never a second, bespoke navigation model. */
private object BizRoutes {
    const val OVERVIEW = "overview"
    const val APPOINTMENTS = "appointments"
    const val APPOINTMENT_DETAIL = "appointments/{appointmentId}"
    const val WALK_IN = "walk-in"
    const val QUEUE = "queue"
    const val QUEUE_ENTRY_DETAIL = "queue/{queueEntryId}"
    const val ACTIVE_SERVICE = "service-sessions/{serviceSessionId}"
    const val CHECKOUT_SESSIONS = "checkout"
    const val CHECKOUT = "checkout/{serviceSessionId}"
    const val RECORD_PAYMENT = "payments/record/{checkoutId}"
    const val MY_WORK = "my-work"
    const val VERIFICATIONS = "verifications"
    const val DISPUTES = "disputes"
    const val DISPUTE_DETAIL = "disputes/{disputeId}"
    const val TRANSACTIONS = "transactions"
    const val TRANSACTION_DETAIL = "transactions/{transactionId}"
    const val RECEIPTS = "receipts"
    const val RECEIPT_DETAIL = "receipts/{receiptId}"
    const val EARNINGS = "earnings"
    const val REPORTS = "reports"
    const val SETUP = "setup"
    const val SERVICES = "services"
    const val BRANCH_SERVICES = "branch-services"
    const val TEAM = "team"
    const val HOURS = "hours"
    const val MORE = "more"

    fun appointmentDetail(id: String) = "appointments/$id"
    fun queueEntryDetail(id: String) = "queue/$id"
    fun activeService(id: String) = "service-sessions/$id"
    fun checkout(id: String) = "checkout/$id"
    fun recordPayment(id: String) = "payments/record/$id"
    fun disputeDetail(id: String) = "disputes/$id"
    fun transactionDetail(id: String) = "transactions/$id"
    fun receiptDetail(id: String) = "receipts/$id"
}

private object Permission {
    const val QUEUE_READ = "queue.read"
    const val APPOINTMENTS_READ = "appointments.read"
    const val SERVICE_SESSIONS_START = "service_sessions.start"
    const val SERVICE_SESSIONS_PERFORM = "service_sessions.perform"
    const val SERVICE_SESSIONS_MANAGE = "service_sessions.manage"
    const val CHECKOUTS_READ = "checkouts.read"
    const val PAYMENTS_VERIFY_OWN = "payments.verify_own"
    const val PAYMENTS_RESOLVE = "payments.resolve"
    const val TRANSACTIONS_READ = "transactions.read"
    const val RECEIPTS_READ = "receipts.read"
    const val COMMISSIONS_READ_OWN = "commissions.read_own"
    const val REPORTS_READ = "reports.read"
    const val SERVICES_READ = "services.read"
    const val STAFF_READ = "staff.read"
}

/** One entry in the permission-driven business navigation (docs task
 * "Business Navigation": "only destinations backed by real, connected
 * functionality are ever shown"). [granted] is evaluated against the
 * workspace's own presentation-only permission codes -- the server
 * remains the sole authority on whether any underlying action actually
 * succeeds. */
private data class BizDestination(
    val route: String,
    val label: String,
    val icon: ImageVector,
    val granted: (WorkspaceOrganizationDto) -> Boolean,
)

private val OVERVIEW_DESTINATION = BizDestination(BizRoutes.OVERVIEW, "Overview", Icons.Default.Dashboard) { true }
private val PRIMARY_CANDIDATES = listOf(
    BizDestination(BizRoutes.QUEUE, "Queue", Icons.Default.FormatListNumbered) { Permission.QUEUE_READ in it.permissionCodes },
    BizDestination(BizRoutes.APPOINTMENTS, "Appts", Icons.AutoMirrored.Filled.EventNote) { Permission.APPOINTMENTS_READ in it.permissionCodes },
    BizDestination(BizRoutes.MY_WORK, "My Work", Icons.Default.Work) {
        Permission.SERVICE_SESSIONS_START in it.permissionCodes || Permission.SERVICE_SESSIONS_PERFORM in it.permissionCodes || Permission.SERVICE_SESSIONS_MANAGE in it.permissionCodes
    },
    BizDestination(BizRoutes.CHECKOUT_SESSIONS, "Checkout", Icons.Default.ShoppingCart) { Permission.CHECKOUTS_READ in it.permissionCodes },
    BizDestination(BizRoutes.REPORTS, "Reports", Icons.Default.BarChart) { Permission.REPORTS_READ in it.permissionCodes },
    BizDestination(BizRoutes.TRANSACTIONS, "Txns", Icons.Default.Receipt) { Permission.TRANSACTIONS_READ in it.permissionCodes },
    BizDestination(BizRoutes.VERIFICATIONS, "Verify", Icons.Default.VerifiedUser) { Permission.PAYMENTS_VERIFY_OWN in it.permissionCodes },
    BizDestination(BizRoutes.DISPUTES, "Disputes", Icons.Default.Gavel) { Permission.PAYMENTS_RESOLVE in it.permissionCodes },
    BizDestination(BizRoutes.EARNINGS, "Earnings", Icons.Default.AttachMoney) { Permission.COMMISSIONS_READ_OWN in it.permissionCodes },
    BizDestination(BizRoutes.RECEIPTS, "Receipts", Icons.Default.Receipt) { Permission.RECEIPTS_READ in it.permissionCodes },
)
private const val MAX_PRIMARY_TABS = 4

/**
 * Permission-driven business navigation (docs task "Business
 * Navigation"): the bottom bar surfaces Overview plus up to four more
 * destinations this membership actually holds real permission for,
 * ranked by [PRIMARY_CANDIDATES]'s order; everything else -- plus setup,
 * catalogue/team management, and account-level actions -- lives in
 * "More" so the bar never clips a label or exceeds a legible item count
 * (docs task Phase 13: "no clipped labels").
 */
@Composable
fun BusinessHomeScreen(
    organizationId: String,
    container: AppContainer,
    onSwitchWorkspace: () -> Unit,
    onSubscription: () -> Unit,
    onBusinessProfile: () -> Unit,
) {
    val dashboardViewModel = koraViewModel { BusinessDashboardViewModel(organizationId, container.workspacesRepository, container.reportsRepository) }
    val dashboardState by dashboardViewModel.state.collectAsState()

    when (val workspace = dashboardState.workspace) {
        ScreenState.Initial, ScreenState.Loading -> LoadingStateView()
        is ScreenState.Error -> ErrorStateView(error = workspace.error, onRetry = dashboardViewModel::load)
        is ScreenState.Content -> {
            val org = workspace.data
            if (org.accessMode == "BLOCKED") {
                BusinessDashboardScreen(dashboardViewModel, onSwitchWorkspace)
                return
            }
            var primaryBranch by remember { mutableStateOf<BranchDto?>(null) }
            LaunchedEffect(org.organizationId) {
                val result = container.organizationsRepository.listBranches(org.organizationId)
                primaryBranch = (result as? ApiResult.Success)?.value?.firstOrNull()
            }
            BusinessShell(
                org = org,
                dashboardViewModel = dashboardViewModel,
                branchTimeZone = primaryBranch?.timeZone ?: "UTC",
                container = container,
                onSwitchWorkspace = onSwitchWorkspace,
                onSubscription = onSubscription,
                onBusinessProfile = onBusinessProfile,
            )
        }
        ScreenState.Empty, ScreenState.AuthenticationExpired -> Unit
    }
}

@Composable
private fun BusinessShell(
    org: WorkspaceOrganizationDto,
    dashboardViewModel: BusinessDashboardViewModel,
    branchTimeZone: String,
    container: AppContainer,
    onSwitchWorkspace: () -> Unit,
    onSubscription: () -> Unit,
    onBusinessProfile: () -> Unit,
) {
    val navController = rememberNavController()
    val branchId = org.branches.firstOrNull()?.branchId
    val primaryTabs = remember(org.permissionCodes) { PRIMARY_CANDIDATES.filter { it.granted(org) }.take(MAX_PRIMARY_TABS) }
    val tabs = listOf(OVERVIEW_DESTINATION) + primaryTabs
    val moreDestinations = remember(org.permissionCodes) { PRIMARY_CANDIDATES.filter { it.granted(org) && it !in primaryTabs } }

    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = backStackEntry?.destination?.route

    Scaffold(
        bottomBar = {
            NavigationBar {
                tabs.forEach { tab ->
                    NavigationBarItem(
                        selected = currentRoute == tab.route,
                        onClick = {
                            navController.navigate(tab.route) {
                                popUpTo(BizRoutes.OVERVIEW) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        icon = { Icon(tab.icon, contentDescription = tab.label) },
                        label = { Text(tab.label) },
                    )
                }
                NavigationBarItem(
                    selected = currentRoute == BizRoutes.MORE,
                    onClick = {
                        navController.navigate(BizRoutes.MORE) {
                            popUpTo(BizRoutes.OVERVIEW) { saveState = true }
                            launchSingleTop = true
                            restoreState = true
                        }
                    },
                    icon = { Icon(Icons.Default.MoreHoriz, contentDescription = "More") },
                    label = { Text("More") },
                )
            }
        },
    ) { padding ->
        Box(modifier = Modifier.padding(padding)) {
            NavHost(navController = navController, startDestination = BizRoutes.OVERVIEW) {
                composable(BizRoutes.OVERVIEW) { BusinessDashboardScreen(dashboardViewModel, onSwitchWorkspace) }

                businessOperationsGraph(
                    navController = navController,
                    org = org,
                    branchId = branchId,
                    branchTimeZone = branchTimeZone,
                    container = container,
                )

                composable(BizRoutes.MORE) {
                    MoreScreen(
                        org = org,
                        moreDestinations = moreDestinations,
                        onDestinationTapped = { route ->
                            navController.navigate(route) {
                                popUpTo(BizRoutes.OVERVIEW) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        onSetup = { navController.navigate(BizRoutes.SETUP) },
                        onBusinessProfile = onBusinessProfile,
                        onSubscription = onSubscription,
                        onSwitchWorkspace = onSwitchWorkspace,
                    )
                }
                composable(BizRoutes.SETUP) {
                    val viewModel = koraViewModel { SetupViewModel(org.organizationId, container.organizationsRepository) }
                    SetupScreen(
                        viewModel = viewModel,
                        onBack = { navController.popBackStack() },
                        onBusinessProfile = onBusinessProfile,
                        onServices = { navController.navigate(BizRoutes.SERVICES) },
                        onHours = { navController.navigate(BizRoutes.HOURS) },
                        onTeam = { navController.navigate(BizRoutes.TEAM) },
                    )
                }
                composable(BizRoutes.SERVICES) {
                    val viewModel = koraViewModel { ServicesViewModel(org.organizationId, org.defaultCurrency, container.serviceCatalogueRepository) }
                    ServicesScreen(viewModel = viewModel, onBack = { navController.popBackStack() })
                }
                composable(BizRoutes.BRANCH_SERVICES) {
                    if (branchId == null) return@composable
                    val viewModel = koraViewModel {
                        BranchServicesViewModel(org.organizationId, branchId, org.accessMode, container.serviceCatalogueRepository, container.staffRepository)
                    }
                    BranchServicesScreen(viewModel = viewModel, defaultCurrency = org.defaultCurrency, onBack = { navController.popBackStack() })
                }
                composable(BizRoutes.TEAM) {
                    val viewModel = koraViewModel { TeamViewModel(org.organizationId, container.staffRepository) }
                    TeamScreen(viewModel = viewModel, onBack = { navController.popBackStack() })
                }
                composable(BizRoutes.HOURS) {
                    if (branchId == null) return@composable
                    val viewModel = koraViewModel { BusinessHoursViewModel(org.organizationId, branchId, container.schedulingRepository) }
                    BusinessHoursScreen(viewModel = viewModel, onBack = { navController.popBackStack() })
                }
            }
        }
    }
}

private fun NavGraphBuilder.businessOperationsGraph(
    navController: NavHostController,
    org: WorkspaceOrganizationDto,
    branchId: String?,
    branchTimeZone: String,
    container: AppContainer,
) {
    composable(BizRoutes.APPOINTMENTS) {
        if (branchId == null) return@composable
        val viewModel = koraViewModel { OrganizationAppointmentsViewModel(org.organizationId, branchId, container.organizationAppointmentsRepository) }
        OrganizationAppointmentsScreen(
            viewModel = viewModel,
            onBack = { navController.popBackStack() },
            onAppointmentTapped = { id -> navController.navigate(BizRoutes.appointmentDetail(id)) },
        )
    }
    composable(BizRoutes.APPOINTMENT_DETAIL, arguments = listOf(navArgument("appointmentId") { type = androidx.navigation.NavType.StringType })) { backStackEntry ->
        if (branchId == null) return@composable
        val appointmentId = backStackEntry.arguments?.getString("appointmentId").orEmpty()
        val viewModel = koraViewModel { AppointmentDetailViewModel(org.organizationId, branchId, appointmentId, container.organizationAppointmentsRepository) }
        AppointmentDetailScreen(
            viewModel = viewModel,
            onBack = { navController.popBackStack() },
            onOpenQueueEntry = { queueEntryId -> navController.navigate(BizRoutes.queueEntryDetail(queueEntryId)) },
        )
    }
    composable(BizRoutes.WALK_IN) {
        if (branchId == null) return@composable
        val viewModel = koraViewModel { WalkInViewModel(org.organizationId, branchId, container.queueRepository, container.serviceCatalogueRepository) }
        WalkInScreen(
            viewModel = viewModel,
            onBack = { navController.popBackStack() },
            onCreated = { queueEntryId ->
                navController.navigate(BizRoutes.queueEntryDetail(queueEntryId)) { popUpTo(BizRoutes.WALK_IN) { inclusive = true } }
            },
        )
    }
    composable(BizRoutes.QUEUE) {
        if (branchId == null) return@composable
        val viewModel = koraViewModel { QueueViewModel(org.organizationId, branchId, container.queueRepository) }
        QueueScreen(
            viewModel = viewModel,
            branchTimeZone = branchTimeZone,
            onBack = { navController.popBackStack() },
            onEntryTapped = { id -> navController.navigate(BizRoutes.queueEntryDetail(id)) },
            onAddWalkIn = { navController.navigate(BizRoutes.WALK_IN) },
        )
    }
    composable(BizRoutes.QUEUE_ENTRY_DETAIL, arguments = listOf(navArgument("queueEntryId") { type = androidx.navigation.NavType.StringType })) { backStackEntry ->
        val queueEntryId = backStackEntry.arguments?.getString("queueEntryId").orEmpty()
        val viewModel = koraViewModel { QueueEntryDetailViewModel(org.organizationId, queueEntryId, container.queueRepository, container.staffRepository) }
        QueueEntryDetailScreen(
            viewModel = viewModel,
            branchTimeZone = branchTimeZone,
            onBack = { navController.popBackStack() },
            onServiceStarted = { serviceSessionId -> navController.navigate(BizRoutes.activeService(serviceSessionId)) },
        )
    }
    composable(BizRoutes.MY_WORK) {
        val viewModel = koraViewModel { MyWorkViewModel(org.organizationId, container.authRepository, container.staffRepository, container.serviceSessionsRepository) }
        MyWorkScreen(viewModel = viewModel, onSessionTapped = { id -> navController.navigate(BizRoutes.activeService(id)) })
    }
    composable(BizRoutes.ACTIVE_SERVICE, arguments = listOf(navArgument("serviceSessionId") { type = androidx.navigation.NavType.StringType })) { backStackEntry ->
        val serviceSessionId = backStackEntry.arguments?.getString("serviceSessionId").orEmpty()
        val viewModel = koraViewModel { ActiveServiceViewModel(org.organizationId, serviceSessionId, container.serviceSessionsRepository, container.serviceCatalogueRepository) }
        ActiveServiceScreen(
            viewModel = viewModel,
            onBack = { navController.popBackStack() },
            onCompleted = { completedSessionId -> navController.navigate(BizRoutes.checkout(completedSessionId)) },
        )
    }
    composable(BizRoutes.CHECKOUT_SESSIONS) {
        val viewModel = koraViewModel { CheckoutSessionsViewModel(org.organizationId, branchId, container.serviceSessionsRepository) }
        CheckoutSessionsScreen(viewModel = viewModel, onSessionTapped = { id -> navController.navigate(BizRoutes.checkout(id)) })
    }
    composable(BizRoutes.CHECKOUT, arguments = listOf(navArgument("serviceSessionId") { type = androidx.navigation.NavType.StringType })) { backStackEntry ->
        val serviceSessionId = backStackEntry.arguments?.getString("serviceSessionId").orEmpty()
        val viewModel = koraViewModel { CheckoutViewModel(org.organizationId, serviceSessionId, org.accessMode, container.checkoutsRepository) }
        CheckoutScreen(
            viewModel = viewModel,
            onBack = { navController.popBackStack() },
            onRecordPayment = { checkoutId -> navController.navigate(BizRoutes.recordPayment(checkoutId)) },
        )
    }
    composable(BizRoutes.RECORD_PAYMENT, arguments = listOf(navArgument("checkoutId") { type = androidx.navigation.NavType.StringType })) { backStackEntry ->
        if (branchId == null) return@composable
        val checkoutId = backStackEntry.arguments?.getString("checkoutId").orEmpty()
        val viewModel = koraViewModel {
            RecordPaymentViewModel(org.organizationId, branchId, checkoutId, container.checkoutsRepository, container.paymentsRepository, container.cashPolicyRepository)
        }
        RecordPaymentScreen(viewModel = viewModel, onBack = { navController.popBackStack() }, onRecorded = { navController.popBackStack() })
    }
    composable(BizRoutes.VERIFICATIONS) {
        val viewModel = koraViewModel { VerificationsViewModel(org.organizationId, container.paymentsRepository) }
        VerificationsScreen(viewModel = viewModel)
    }
    composable(BizRoutes.DISPUTES) {
        val viewModel = koraViewModel { DisputeResolutionListViewModel(org.organizationId, container.paymentsRepository) }
        DisputeResolutionListScreen(
            viewModel = viewModel,
            onBack = { navController.popBackStack() },
            onDisputeTapped = { id -> navController.navigate(BizRoutes.disputeDetail(id)) },
        )
    }
    composable(BizRoutes.DISPUTE_DETAIL, arguments = listOf(navArgument("disputeId") { type = androidx.navigation.NavType.StringType })) { backStackEntry ->
        val disputeId = backStackEntry.arguments?.getString("disputeId").orEmpty()
        val viewModel = koraViewModel { DisputeResolutionDetailViewModel(org.organizationId, disputeId, container.paymentsRepository) }
        DisputeResolutionDetailScreen(viewModel = viewModel, onBack = { navController.popBackStack() })
    }
    composable(BizRoutes.TRANSACTIONS) {
        val viewModel = koraViewModel { TransactionsListViewModel(org.organizationId, container.transactionsRepository) }
        TransactionsListScreen(
            viewModel = viewModel,
            onBack = { navController.popBackStack() },
            onTransactionTapped = { id -> navController.navigate(BizRoutes.transactionDetail(id)) },
        )
    }
    composable(BizRoutes.TRANSACTION_DETAIL, arguments = listOf(navArgument("transactionId") { type = androidx.navigation.NavType.StringType })) { backStackEntry ->
        val transactionId = backStackEntry.arguments?.getString("transactionId").orEmpty()
        val viewModel = koraViewModel { TransactionDetailViewModel(org.organizationId, transactionId, container.transactionsRepository, container.receiptsRepository) }
        TransactionDetailScreen(
            viewModel = viewModel,
            onBack = { navController.popBackStack() },
            onOpenReceipt = { receiptId -> navController.navigate(BizRoutes.receiptDetail(receiptId)) },
        )
    }
    composable(BizRoutes.RECEIPTS) {
        val viewModel = koraViewModel { ReceiptsListViewModel(org.organizationId, container.receiptsRepository) }
        ReceiptsListScreen(viewModel = viewModel, onReceiptTapped = { id -> navController.navigate(BizRoutes.receiptDetail(id)) })
    }
    composable(BizRoutes.RECEIPT_DETAIL, arguments = listOf(navArgument("receiptId") { type = androidx.navigation.NavType.StringType })) { backStackEntry ->
        val receiptId = backStackEntry.arguments?.getString("receiptId").orEmpty()
        val viewModel = koraViewModel { ReceiptViewModel(org.organizationId, receiptId, isCustomerView = false, repository = container.receiptsRepository) }
        ReceiptScreen(viewModel = viewModel, onBack = { navController.popBackStack() })
    }
    composable(BizRoutes.EARNINGS) {
        val viewModel = koraViewModel { StaffEarningsViewModel(org.organizationId, container.myEarningsRepository) }
        StaffEarningsScreen(viewModel = viewModel, onBack = { navController.popBackStack() })
    }
    composable(BizRoutes.REPORTS) {
        val viewModel = koraViewModel { ReportsViewModel(org.organizationId, container.reportsRepository) }
        ReportsScreen(viewModel = viewModel, onBack = { navController.popBackStack() })
    }
}

@Composable
private fun MoreScreen(
    org: WorkspaceOrganizationDto,
    moreDestinations: List<BizDestination>,
    onDestinationTapped: (String) -> Unit,
    onSetup: () -> Unit,
    onBusinessProfile: () -> Unit,
    onSubscription: () -> Unit,
    onSwitchWorkspace: () -> Unit,
) {
    val canReadServices = Permission.SERVICES_READ in org.permissionCodes
    val canReadStaff = Permission.STAFF_READ in org.permissionCodes

    Column(modifier = Modifier.padding(top = 8.dp)) {
        moreDestinations.forEach { destination ->
            ListItem(
                headlineContent = { Text(destination.label) },
                leadingContent = { Icon(destination.icon, contentDescription = null) },
                modifier = Modifier.fillMaxWidth().clickable { onDestinationTapped(destination.route) },
            )
        }
        if (moreDestinations.isNotEmpty()) HorizontalDivider()

        ListItem(headlineContent = { Text("Setup") }, modifier = Modifier.fillMaxWidth().clickable(onClick = onSetup))
        if (canReadServices) {
            ListItem(headlineContent = { Text("Services") }, modifier = Modifier.fillMaxWidth().clickable { onDestinationTapped(BizRoutes.SERVICES) })
            ListItem(headlineContent = { Text("Branch services") }, modifier = Modifier.fillMaxWidth().clickable { onDestinationTapped(BizRoutes.BRANCH_SERVICES) })
        }
        if (canReadStaff) {
            ListItem(headlineContent = { Text("Team") }, modifier = Modifier.fillMaxWidth().clickable { onDestinationTapped(BizRoutes.TEAM) })
        }
        ListItem(headlineContent = { Text("Business hours") }, modifier = Modifier.fillMaxWidth().clickable { onDestinationTapped(BizRoutes.HOURS) })
        HorizontalDivider()
        ListItem(headlineContent = { Text("Business profile") }, modifier = Modifier.fillMaxWidth().clickable(onClick = onBusinessProfile))
        ListItem(headlineContent = { Text("Subscription") }, modifier = Modifier.fillMaxWidth().clickable(onClick = onSubscription))
        HorizontalDivider()
        ListItem(headlineContent = { Text("Switch workspace") }, modifier = Modifier.fillMaxWidth().clickable(onClick = onSwitchWorkspace))
    }
}
