package com.realtegic.kora

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.FormatListNumbered
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material.icons.filled.Store
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.realtegic.kora.data.model.QueueEntry
import com.realtegic.kora.data.model.Transaction
import com.realtegic.kora.data.model.TransactionStatus
import com.realtegic.kora.ui.components.RoleStaffSwitcher
import com.realtegic.kora.ui.dialogs.AddWalkInDialog
import com.realtegic.kora.ui.dialogs.BookAppointmentDialog
import com.realtegic.kora.ui.dialogs.CheckoutDialog
import com.realtegic.kora.ui.dialogs.DisputeDialog
import com.realtegic.kora.ui.dialogs.OnboardingDialog
import com.realtegic.kora.ui.dialogs.ReceiptDialog
import com.realtegic.kora.ui.screens.AppointmentsScreen
import com.realtegic.kora.ui.screens.DashboardScreen
import com.realtegic.kora.ui.screens.QueueScreen
import com.realtegic.kora.ui.screens.ServicesStaffScreen
import com.realtegic.kora.ui.screens.StaffConfirmationsScreen
import com.realtegic.kora.ui.theme.GoldContainer
import com.realtegic.kora.ui.theme.GoldPrimary
import com.realtegic.kora.ui.theme.KoraTheme
import com.realtegic.kora.ui.theme.SlateDark
import com.realtegic.kora.ui.theme.StatusRed
import com.realtegic.kora.ui.viewmodel.KoraViewModel
import kotlinx.coroutines.launch

enum class MainTab(val title: String, val icon: ImageVector) {
    DASHBOARD("Overview", Icons.Default.Dashboard),
    QUEUE("Queue", Icons.Default.FormatListNumbered),
    CONFIRMATIONS("Verifications", Icons.Default.CheckCircle),
    APPOINTMENTS("Appointments", Icons.Default.CalendarMonth),
    SERVICES_STAFF("Services & Staff", Icons.Default.Store)
}

class MainActivity : ComponentActivity() {

    private val viewModel: KoraViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            KoraTheme {
                KoraApp(viewModel = viewModel)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun KoraApp(viewModel: KoraViewModel) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }

    val organization by viewModel.currentOrganization.collectAsState()
    val staffList by viewModel.staffList.collectAsState()
    val servicesList by viewModel.servicesList.collectAsState()
    val queueList by viewModel.queueList.collectAsState()
    val appointmentsList by viewModel.appointmentsList.collectAsState()
    val transactionsList by viewModel.transactionsList.collectAsState()
    val currentStaffUser by viewModel.currentStaffUser.collectAsState()

    var currentTab by remember { mutableStateOf(MainTab.DASHBOARD) }

    // Dialog state
    var showCheckoutDialog by remember { mutableStateOf(false) }
    var checkoutQueueEntry by remember { mutableStateOf<QueueEntry?>(null) }

    var showAddWalkInDialog by remember { mutableStateOf(false) }
    var showBookAppointmentDialog by remember { mutableStateOf(false) }
    var showOnboardingDialog by remember { mutableStateOf(false) }

    var viewingReceiptTransaction by remember { mutableStateOf<Transaction?>(null) }
    var disputingTransaction by remember { mutableStateOf<Transaction?>(null) }

    val pendingCount = transactionsList.count { it.status == TransactionStatus.PAYMENT_RECORDED.name }
    val disputedCount = transactionsList.count { it.status == TransactionStatus.DISPUTED.name }
    val waitingQueueCount = queueList.count { it.status == "WAITING" }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.clickable { showOnboardingDialog = true }
                    ) {
                        Box(
                            modifier = Modifier
                                .size(34.dp)
                                .clip(RoundedCornerShape(8.dp))
                                .background(SlateDark),
                            contentAlignment = Alignment.Center
                        ) {
                            Image(
                                painter = painterResource(R.drawable.kora_logo),
                                contentDescription = "Kora OS",
                                modifier = Modifier.fillMaxSize()
                            )
                        }
                        Spacer(modifier = Modifier.width(10.dp))
                        Column {
                            Text(
                                text = organization?.name ?: "Urban Crown Salon",
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Black,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                            Text(
                                text = "${organization?.location ?: "Kumasi, Ghana"} • Setup / Edit ▾",
                                fontSize = 11.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                },
                actions = {
                    // Quick POS Checkout Action
                    IconButton(
                        onClick = {
                            checkoutQueueEntry = null
                            showCheckoutDialog = true
                        },
                        modifier = Modifier.testTag("topbar_quick_pos")
                    ) {
                        Box(
                            modifier = Modifier
                                .size(36.dp)
                                .clip(CircleShape)
                                .background(GoldPrimary),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Default.Payments,
                                contentDescription = "Quick POS",
                                tint = Color.White,
                                modifier = Modifier.size(20.dp)
                            )
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            )
        },
        bottomBar = {
            NavigationBar(
                containerColor = MaterialTheme.colorScheme.surface,
                tonalElevation = 6.dp
            ) {
                MainTab.values().forEach { tab ->
                    val isSelected = currentTab == tab
                    val badgeCount = when (tab) {
                        MainTab.QUEUE -> waitingQueueCount
                        MainTab.CONFIRMATIONS -> pendingCount + disputedCount
                        else -> 0
                    }

                    NavigationBarItem(
                        selected = isSelected,
                        onClick = { currentTab = tab },
                        icon = {
                            if (badgeCount > 0) {
                                BadgedBox(
                                    badge = {
                                        Badge(
                                            containerColor = if (tab == MainTab.CONFIRMATIONS && disputedCount > 0) StatusRed else GoldPrimary,
                                            contentColor = Color.White
                                        ) {
                                            Text("$badgeCount")
                                        }
                                    }
                                ) {
                                    Icon(tab.icon, contentDescription = tab.title)
                                }
                            } else {
                                Icon(tab.icon, contentDescription = tab.title)
                            }
                        },
                        label = {
                            Text(
                                text = tab.title,
                                fontSize = 11.sp,
                                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal
                            )
                        },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = GoldPrimary,
                            selectedTextColor = GoldPrimary,
                            indicatorColor = GoldContainer
                        ),
                        modifier = Modifier.testTag("nav_tab_${tab.name.lowercase()}")
                    )
                }
            }
        }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            // User / Role Switcher Header (Simulating Owner / Stylist perspective with 1 tap)
            if (staffList.isNotEmpty()) {
                RoleStaffSwitcher(
                    staffList = staffList,
                    currentStaff = currentStaffUser,
                    onSelectStaff = { viewModel.selectStaffUser(it.id) }
                )
            }

            // Main Tab Content
            when (currentTab) {
                MainTab.DASHBOARD -> {
                    DashboardScreen(
                        organization = organization,
                        staffList = staffList,
                        queueList = queueList,
                        transactionsList = transactionsList,
                        currentStaffUser = currentStaffUser,
                        onNavigateToQueue = { currentTab = MainTab.QUEUE },
                        onNavigateToConfirmations = { currentTab = MainTab.CONFIRMATIONS },
                        onViewReceipt = { viewingReceiptTransaction = it },
                        onResolveDispute = { tx ->
                            viewModel.resolveDispute(tx)
                            coroutineScope.launch {
                                snackbarHostState.showSnackbar("Dispute resolved & commission verified for ${tx.staffName}!")
                            }
                        },
                        onStartCheckout = {
                            checkoutQueueEntry = null
                            showCheckoutDialog = true
                        },
                        onAddWalkIn = { showAddWalkInDialog = true }
                    )
                }
                MainTab.QUEUE -> {
                    QueueScreen(
                        queueList = queueList,
                        currentStaffUser = currentStaffUser,
                        onUpdateStatus = { entry, status ->
                            viewModel.updateQueueStatus(entry, status)
                        },
                        onCheckout = { entry ->
                            checkoutQueueEntry = entry
                            showCheckoutDialog = true
                        },
                        onRemove = { entryId ->
                            viewModel.removeQueueEntry(entryId)
                        },
                        onAddWalkIn = { showAddWalkInDialog = true }
                    )
                }
                MainTab.CONFIRMATIONS -> {
                    StaffConfirmationsScreen(
                        transactionsList = transactionsList,
                        currentStaffUser = currentStaffUser,
                        onConfirm = { tx ->
                            viewModel.confirmPayment(tx)
                            coroutineScope.launch {
                                snackbarHostState.showSnackbar("Payment confirmed! Commission of GH₵${String.format(java.util.Locale.US, "%.2f", tx.commissionAmount)} added to ${tx.staffName}.")
                            }
                        },
                        onOpenDispute = { tx ->
                            disputingTransaction = tx
                        },
                        onViewReceipt = { viewingReceiptTransaction = it },
                        onShareVerificationWhatsApp = { tx ->
                            val text = viewModel.generateStaffVerificationNotificationText(tx)
                            val phone = staffList.find { it.id == tx.staffId }?.phone
                            viewModel.shareToWhatsApp(context, text, phone)
                        },
                        onCopyVerificationText = { tx ->
                            val text = viewModel.generateStaffVerificationNotificationText(tx)
                            viewModel.copyToClipboard(context, text, "Verification Alert")
                            coroutineScope.launch {
                                snackbarHostState.showSnackbar("Verification text copied to clipboard!")
                            }
                        }
                    )
                }
                MainTab.APPOINTMENTS -> {
                    AppointmentsScreen(
                        appointmentsList = appointmentsList,
                        currentStaffUser = currentStaffUser,
                        onCheckIn = { appt ->
                            viewModel.checkInAppointment(appt)
                            currentTab = MainTab.QUEUE
                            coroutineScope.launch {
                                snackbarHostState.showSnackbar("${appt.customerName} checked in to Walk-In Queue!")
                            }
                        },
                        onCancel = { appt ->
                            viewModel.cancelAppointment(appt)
                        },
                        onBookAppointment = { showBookAppointmentDialog = true }
                    )
                }
                MainTab.SERVICES_STAFF -> {
                    ServicesStaffScreen(
                        servicesList = servicesList,
                        staffList = staffList,
                        onToggleService = { viewModel.toggleServiceActive(it) },
                        onAddService = { name, price, duration, eligible ->
                            viewModel.addService(name, price, duration, eligible)
                            coroutineScope.launch {
                                snackbarHostState.showSnackbar("Service '$name' added!")
                            }
                        },
                        onAddStaff = { name, phone, role, commission, serviceIds ->
                            viewModel.addStaff(name, phone, role, commission, serviceIds)
                            coroutineScope.launch {
                                snackbarHostState.showSnackbar("Staff member '$name' added!")
                            }
                        }
                    )
                }
            }
        }
    }

    // Checkout POS Dialog
    if (showCheckoutDialog) {
        CheckoutDialog(
            queueEntry = checkoutQueueEntry,
            allServices = servicesList,
            allStaff = staffList,
            currentCashier = currentStaffUser,
            onDismiss = {
                showCheckoutDialog = false
                checkoutQueueEntry = null
            },
            onConfirmPayment = { customerId, customerName, staff, cashier, items, paymentMethod, queueEntryId ->
                viewModel.completeCheckout(
                    customerId = customerId,
                    customerName = customerName,
                    staff = staff,
                    cashier = cashier,
                    lineItems = items,
                    paymentMethod = paymentMethod,
                    queueEntryId = queueEntryId
                )
                showCheckoutDialog = false
                checkoutQueueEntry = null
                coroutineScope.launch {
                    snackbarHostState.showSnackbar("Payment recorded in PAYMENT_RECORDED status. Notification sent to ${staff.name}!")
                }
            }
        )
    }

    // Add Walk-In Dialog
    if (showAddWalkInDialog) {
        AddWalkInDialog(
            services = servicesList,
            staffList = staffList,
            onDismiss = { showAddWalkInDialog = false },
            onAdd = { name, phone, service, staff, notes ->
                viewModel.addWalkIn(name, phone, service, staff, notes)
                coroutineScope.launch {
                    snackbarHostState.showSnackbar("$name added to waiting queue for ${staff.name}!")
                }
            }
        )
    }

    // Book Appointment Dialog
    if (showBookAppointmentDialog) {
        BookAppointmentDialog(
            services = servicesList,
            staffList = staffList,
            onDismiss = { showBookAppointmentDialog = false },
            onBook = { name, phone, service, staff, timestamp ->
                viewModel.bookAppointment(name, phone, service, staff, timestamp) { success, message ->
                    coroutineScope.launch {
                        snackbarHostState.showSnackbar(message)
                    }
                }
            }
        )
    }

    // Receipt Dialog
    viewingReceiptTransaction?.let { tx ->
        val receiptText = viewModel.generateReceiptText(tx)
        ReceiptDialog(
            transaction = tx,
            organization = organization,
            currentStaff = currentStaffUser,
            receiptText = receiptText,
            onDismiss = { viewingReceiptTransaction = null },
            onCopy = {
                viewModel.copyToClipboard(context, receiptText, "Receipt")
                coroutineScope.launch {
                    snackbarHostState.showSnackbar("Receipt copied to clipboard!")
                }
            },
            onShareWhatsApp = { phone ->
                viewModel.shareToWhatsApp(context, receiptText, phone)
            },
            onConfirmPayment = { targetTx ->
                viewModel.confirmPayment(targetTx)
                viewingReceiptTransaction = null
                coroutineScope.launch {
                    snackbarHostState.showSnackbar("Payment confirmed!")
                }
            },
            onOpenDispute = { targetTx ->
                viewingReceiptTransaction = null
                disputingTransaction = targetTx
            }
        )
    }

    // Dispute Dialog
    disputingTransaction?.let { tx ->
        DisputeDialog(
            transaction = tx,
            onDismiss = { disputingTransaction = null },
            onSubmitDispute = { targetTx, reason ->
                viewModel.disputePayment(targetTx, reason)
                coroutineScope.launch {
                    snackbarHostState.showSnackbar("Dispute flagged: Owner alerted on dashboard.")
                }
            }
        )
    }

    // Onboarding Dialog
    if (showOnboardingDialog) {
        OnboardingDialog(
            onDismiss = { showOnboardingDialog = false },
            onComplete = { name, phone, location, services, staffName, staffCommission ->
                viewModel.createNewOrganization(name, phone, location, services, staffName, staffCommission)
                coroutineScope.launch {
                    snackbarHostState.showSnackbar("Salon '$name' configured successfully!")
                }
            }
        )
    }
}
