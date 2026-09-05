package com.realtegic.kora.feature.business.dashboard

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Checklist
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.Storefront
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.realtegic.kora.core.data.OrganizationsRepository
import com.realtegic.kora.core.data.ReportsRepository
import com.realtegic.kora.core.data.SchedulingRepository
import com.realtegic.kora.core.data.ServiceCatalogueRepository
import com.realtegic.kora.core.data.StaffRepository
import com.realtegic.kora.core.data.SubscriptionRepository
import com.realtegic.kora.core.data.WorkspacesRepository
import com.realtegic.kora.core.designsystem.ErrorStateView
import com.realtegic.kora.core.designsystem.LoadingStateView
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.WorkspaceOrganizationDto
import com.realtegic.kora.core.navigation.koraViewModel
import com.realtegic.kora.feature.business.schedule.BusinessHoursScreen
import com.realtegic.kora.feature.business.schedule.BusinessHoursViewModel
import com.realtegic.kora.feature.business.services.ServicesScreen
import com.realtegic.kora.feature.business.services.ServicesViewModel
import com.realtegic.kora.feature.business.setup.SetupScreen
import com.realtegic.kora.feature.business.setup.SetupViewModel
import com.realtegic.kora.feature.business.team.TeamScreen
import com.realtegic.kora.feature.business.team.TeamViewModel

private enum class BusinessTab(val label: String) { OVERVIEW("Overview"), SETUP("Setup"), SERVICES("Services"), TEAM("Team"), MORE("More") }

/**
 * Permission-driven business navigation (docs task "Business
 * Navigation"): only destinations backed by real, connected
 * functionality are ever shown -- no queue, checkout, payments, cash
 * session, correction, or commission-management tab exists here, since
 * none of those are wired to Android this stage. Every tab's own
 * ViewModel is constructed only once the workspace has actually loaded,
 * so none of them ever has to guess at a fallback organization currency
 * or permission set.
 */
@Composable
fun BusinessHomeScreen(
    organizationId: String,
    workspacesRepository: WorkspacesRepository,
    reportsRepository: ReportsRepository,
    organizationsRepository: OrganizationsRepository,
    serviceCatalogueRepository: ServiceCatalogueRepository,
    schedulingRepository: SchedulingRepository,
    staffRepository: StaffRepository,
    subscriptionRepository: SubscriptionRepository,
    onSwitchWorkspace: () -> Unit,
    onSubscription: () -> Unit,
    onBusinessProfile: () -> Unit,
) {
    val dashboardViewModel = koraViewModel { BusinessDashboardViewModel(organizationId, workspacesRepository, reportsRepository) }
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
            BusinessTabs(
                org = org,
                dashboardViewModel = dashboardViewModel,
                organizationsRepository = organizationsRepository,
                serviceCatalogueRepository = serviceCatalogueRepository,
                schedulingRepository = schedulingRepository,
                staffRepository = staffRepository,
                subscriptionRepository = subscriptionRepository,
                onSwitchWorkspace = onSwitchWorkspace,
                onSubscription = onSubscription,
                onBusinessProfile = onBusinessProfile,
            )
        }
        ScreenState.Empty, ScreenState.AuthenticationExpired -> Unit
    }
}

@Composable
private fun BusinessTabs(
    org: WorkspaceOrganizationDto,
    dashboardViewModel: BusinessDashboardViewModel,
    organizationsRepository: OrganizationsRepository,
    serviceCatalogueRepository: ServiceCatalogueRepository,
    schedulingRepository: SchedulingRepository,
    staffRepository: StaffRepository,
    subscriptionRepository: SubscriptionRepository,
    onSwitchWorkspace: () -> Unit,
    onSubscription: () -> Unit,
    onBusinessProfile: () -> Unit,
) {
    var selectedTab by rememberSaveable { mutableStateOf(BusinessTab.OVERVIEW) }
    val canReadServices = "services.read" in org.permissionCodes
    val canReadStaff = "staff.read" in org.permissionCodes
    val primaryBranchId = org.branches.firstOrNull()?.branchId

    val tabs = buildList {
        add(BusinessTab.OVERVIEW)
        add(BusinessTab.SETUP)
        if (canReadServices) add(BusinessTab.SERVICES)
        if (canReadStaff) add(BusinessTab.TEAM)
        add(BusinessTab.MORE)
    }
    if (selectedTab !in tabs) selectedTab = BusinessTab.OVERVIEW

    Scaffold(
        bottomBar = {
            NavigationBar {
                tabs.forEach { tab ->
                    NavigationBarItem(
                        selected = selectedTab == tab,
                        onClick = { selectedTab = tab },
                        icon = { Icon(iconFor(tab), contentDescription = tab.label) },
                        label = { Text(tab.label) },
                    )
                }
            }
        },
    ) { padding ->
        // Every tab's own screen must be inset against the bottom
        // NavigationBar this Scaffold owns -- omitting this (as only the
        // MORE tab previously did) let bottom-aligned content (a form
        // field, a FloatingActionButton) render underneath the nav bar,
        // invisible and untappable. A real bug found during manual
        // verification, not a style choice.
        Box(modifier = Modifier.padding(padding)) {
            when (selectedTab) {
                BusinessTab.OVERVIEW -> BusinessDashboardScreen(dashboardViewModel, onSwitchWorkspace)
                BusinessTab.SETUP -> {
                    val setupViewModel = koraViewModel { SetupViewModel(org.organizationId, organizationsRepository) }
                    SetupScreen(
                        viewModel = setupViewModel,
                        onBack = {},
                        onBusinessProfile = onBusinessProfile,
                        onServices = { selectedTab = BusinessTab.SERVICES },
                        onHours = { selectedTab = BusinessTab.MORE },
                        onTeam = { selectedTab = BusinessTab.TEAM },
                    )
                }
                BusinessTab.SERVICES -> {
                    val servicesViewModel = koraViewModel { ServicesViewModel(org.organizationId, org.defaultCurrency, serviceCatalogueRepository) }
                    ServicesScreen(viewModel = servicesViewModel, onBack = {})
                }
                BusinessTab.TEAM -> {
                    val teamViewModel = koraViewModel { TeamViewModel(org.organizationId, staffRepository) }
                    TeamScreen(viewModel = teamViewModel, onBack = {})
                }
                BusinessTab.MORE -> MoreTab(
                    org = org,
                    primaryBranchId = primaryBranchId,
                    schedulingRepository = schedulingRepository,
                    onSubscription = onSubscription,
                    onBusinessProfile = onBusinessProfile,
                    onSwitchWorkspace = onSwitchWorkspace,
                )
            }
        }
    }
}

@Composable
private fun MoreTab(
    org: WorkspaceOrganizationDto,
    primaryBranchId: String?,
    schedulingRepository: SchedulingRepository,
    onSubscription: () -> Unit,
    onBusinessProfile: () -> Unit,
    onSwitchWorkspace: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var showHours by remember { mutableStateOf(false) }
    if (showHours && primaryBranchId != null) {
        val hoursViewModel = koraViewModel { BusinessHoursViewModel(org.organizationId, primaryBranchId, schedulingRepository) }
        BusinessHoursScreen(viewModel = hoursViewModel, onBack = { showHours = false })
        return
    }

    MoreMenu(
        modifier = modifier,
        onBusinessProfile = onBusinessProfile,
        onHours = { if (primaryBranchId != null) showHours = true },
        onSubscription = onSubscription,
        onSwitchWorkspace = onSwitchWorkspace,
    )
}

@Composable
private fun MoreMenu(
    modifier: Modifier = Modifier,
    onBusinessProfile: () -> Unit,
    onHours: () -> Unit,
    onSubscription: () -> Unit,
    onSwitchWorkspace: () -> Unit,
) {
    Column(modifier = modifier.padding(top = 8.dp)) {
        ListItem(
            headlineContent = { Text("Business profile") },
            modifier = Modifier.fillMaxWidth().clickable(onClick = onBusinessProfile),
        )
        ListItem(
            headlineContent = { Text("Business hours") },
            modifier = Modifier.fillMaxWidth().clickable(onClick = onHours),
        )
        ListItem(
            headlineContent = { Text("Subscription") },
            modifier = Modifier.fillMaxWidth().clickable(onClick = onSubscription),
        )
        HorizontalDivider()
        ListItem(
            headlineContent = { Text("Switch workspace") },
            modifier = Modifier.fillMaxWidth().clickable(onClick = onSwitchWorkspace),
        )
    }
}

private fun iconFor(tab: BusinessTab) = when (tab) {
    BusinessTab.OVERVIEW -> Icons.Default.Dashboard
    BusinessTab.SETUP -> Icons.Default.Checklist
    BusinessTab.SERVICES -> Icons.Default.Storefront
    BusinessTab.TEAM -> Icons.Default.Groups
    BusinessTab.MORE -> Icons.Default.MoreHoriz
}
