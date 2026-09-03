package com.realtegic.kora.ui.viewmodel

import android.app.Application
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.realtegic.kora.data.db.AppDatabase
import com.realtegic.kora.data.model.Appointment
import com.realtegic.kora.data.model.AppointmentStatus
import com.realtegic.kora.data.model.LineItem
import com.realtegic.kora.data.model.Organization
import com.realtegic.kora.data.model.QueueEntry
import com.realtegic.kora.data.model.QueueStatus
import com.realtegic.kora.data.model.Service
import com.realtegic.kora.data.model.Staff
import com.realtegic.kora.data.model.Transaction
import com.realtegic.kora.data.model.TransactionStatus
import com.realtegic.kora.data.repository.KoraRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.net.URLEncoder
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

data class StaffCommissionSummary(
    val staff: Staff,
    val todayCommission: Double,
    val weekCommission: Double,
    val confirmedCount: Int
)

class KoraViewModel(application: Application) : AndroidViewModel(application) {

    private val repository: KoraRepository

    init {
        val db = AppDatabase.getDatabase(application)
        repository = KoraRepository(db.chairsideDao())
    }

    private val _currentOrgId = MutableStateFlow<String?>("org_urban_crown")
    val currentOrgId: StateFlow<String?> = _currentOrgId.asStateFlow()

    private val _currentStaffId = MutableStateFlow<String?>("stf_owner") // "stf_owner", "stf_michael", "stf_sarah"
    val currentStaffId: StateFlow<String?> = _currentStaffId.asStateFlow()

    private val _selectedTab = MutableStateFlow("dashboard") // dashboard, queue, appointments, confirmations, services_staff
    val selectedTab: StateFlow<String> = _selectedTab.asStateFlow()

    private val _activeReceipt = MutableStateFlow<Transaction?>(null)
    val activeReceipt: StateFlow<Transaction?> = _activeReceipt.asStateFlow()

    private val _checkoutQueueEntry = MutableStateFlow<QueueEntry?>(null)
    val checkoutQueueEntry: StateFlow<QueueEntry?> = _checkoutQueueEntry.asStateFlow()

    private val _disputeDialogTx = MutableStateFlow<Transaction?>(null)
    val disputeDialogTx: StateFlow<Transaction?> = _disputeDialogTx.asStateFlow()

    private val _toastMessage = MutableStateFlow<String?>(null)
    val toastMessage: StateFlow<String?> = _toastMessage.asStateFlow()

    val allOrganizations = repository.allOrganizations.stateIn(
        viewModelScope,
        SharingStarted.WhileSubscribed(5000),
        emptyList()
    )

    private val _currentOrg = MutableStateFlow<Organization?>(null)
    val currentOrganization: StateFlow<Organization?> = _currentOrg.asStateFlow()

    private val _staffList = MutableStateFlow<List<Staff>>(emptyList())
    val staffList: StateFlow<List<Staff>> = _staffList.asStateFlow()

    private val _servicesList = MutableStateFlow<List<Service>>(emptyList())
    val servicesList: StateFlow<List<Service>> = _servicesList.asStateFlow()

    private val _queueList = MutableStateFlow<List<QueueEntry>>(emptyList())
    val queueList: StateFlow<List<QueueEntry>> = _queueList.asStateFlow()

    private val _appointmentsList = MutableStateFlow<List<Appointment>>(emptyList())
    val appointmentsList: StateFlow<List<Appointment>> = _appointmentsList.asStateFlow()

    private val _transactionsList = MutableStateFlow<List<Transaction>>(emptyList())
    val transactionsList: StateFlow<List<Transaction>> = _transactionsList.asStateFlow()

    init {
        // Initialize with seed data if database is brand new
        viewModelScope.launch {
            repository.allOrganizations.collectLatest { orgs ->
                if (orgs.isEmpty()) {
                    val seededId = repository.seedDemoData()
                    _currentOrgId.value = seededId
                } else if (_currentOrgId.value == null || orgs.none { it.id == _currentOrgId.value }) {
                    _currentOrgId.value = orgs.first().id
                }
            }
        }

        // Subscribe to current organization data
        viewModelScope.launch {
            _currentOrgId.collectLatest { orgId ->
                if (orgId != null) {
                    launch { repository.getOrganization(orgId).collectLatest { _currentOrg.value = it } }
                    launch { repository.getStaff(orgId).collectLatest { list ->
                        _staffList.value = list
                        if (list.isNotEmpty() && list.none { it.id == _currentStaffId.value }) {
                            _currentStaffId.value = list.first().id
                        }
                    } }
                    launch { repository.getServices(orgId).collectLatest { _servicesList.value = it } }
                    launch { repository.getQueueEntries(orgId).collectLatest { _queueList.value = it } }
                    launch { repository.getAppointments(orgId).collectLatest { _appointmentsList.value = it } }
                    launch { repository.getTransactions(orgId).collectLatest { _transactionsList.value = it } }
                }
            }
        }
    }

    val currentStaffUser: StateFlow<Staff?> = combine(_staffList, _currentStaffId) { staffList, staffId ->
        staffList.find { it.id == staffId } ?: staffList.firstOrNull()
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    fun selectTab(tab: String) {
        _selectedTab.value = tab
    }

    fun selectStaffUser(staffId: String) {
        _currentStaffId.value = staffId
    }

    fun selectOrganization(orgId: String) {
        _currentOrgId.value = orgId
    }

    fun showReceipt(tx: Transaction?) {
        _activeReceipt.value = tx
    }

    fun startCheckout(entry: QueueEntry?) {
        _checkoutQueueEntry.value = entry
    }

    fun openDisputeDialog(tx: Transaction?) {
        _disputeDialogTx.value = tx
    }

    fun clearToast() {
        _toastMessage.value = null
    }

    private fun showToast(message: String) {
        _toastMessage.value = message
        Toast.makeText(getApplication(), message, Toast.LENGTH_SHORT).show()
    }

    // Actions
    fun resetDemoData() {
        viewModelScope.launch {
            val orgId = repository.seedDemoData()
            _currentOrgId.value = orgId
            _currentStaffId.value = "stf_owner"
            showToast("Reset to Urban Crown Salon demo data")
        }
    }

    fun createNewOrganization(name: String, phone: String, location: String, initialServices: List<Pair<String, Double>>, initialStaffName: String, initialStaffCommission: Double) {
        viewModelScope.launch {
            val org = repository.createOrganization(name, phone, location)
            _currentOrgId.value = org.id

            // Add owner
            val owner = repository.addStaff(
                organizationId = org.id,
                branchId = "br_" + org.id,
                name = "$name Owner",
                phone = phone,
                role = "owner",
                serviceIds = emptyList(),
                commissionPercent = 100.0
            )

            // Add sample staff if provided
            if (initialStaffName.isNotBlank()) {
                repository.addStaff(
                    organizationId = org.id,
                    branchId = "br_" + org.id,
                    name = initialStaffName,
                    phone = phone,
                    role = "staff",
                    serviceIds = emptyList(),
                    commissionPercent = initialStaffCommission
                )
            }

            // Add initial services
            initialServices.forEach { (svcName, price) ->
                repository.addService(
                    organizationId = org.id,
                    name = svcName,
                    price = price,
                    durationMinutes = 30,
                    eligibleStaffIds = emptyList()
                )
            }

            _currentStaffId.value = owner.id
            showToast("Created ${org.name} successfully!")
        }
    }

    fun addWalkIn(customerName: String, customerPhone: String, service: Service, staff: Staff, notes: String) {
        val orgId = _currentOrgId.value ?: return
        viewModelScope.launch {
            val branch = "br_main"
            repository.addWalkIn(
                organizationId = orgId,
                branchId = branch,
                customerName = customerName,
                customerPhone = customerPhone,
                service = service,
                staff = staff,
                notes = notes
            )
            showToast("Added $customerName to Queue")
        }
    }

    fun updateQueueStatus(entry: QueueEntry, newStatus: QueueStatus) {
        viewModelScope.launch {
            repository.updateQueueStatus(entry, newStatus)
            showToast("Queue status updated: ${newStatus.name.replace('_', ' ')}")
        }
    }

    fun removeQueueEntry(id: String) {
        viewModelScope.launch {
            repository.deleteQueueEntry(id)
            showToast("Removed from queue")
        }
    }

    fun bookAppointment(
        customerName: String,
        customerPhone: String,
        service: Service,
        staff: Staff,
        scheduledAt: Long,
        onResult: (Boolean, String) -> Unit
    ) {
        val orgId = _currentOrgId.value ?: return
        viewModelScope.launch {
            val (success, message) = repository.bookAppointment(
                organizationId = orgId,
                branchId = "br_main",
                customerName = customerName,
                customerPhone = customerPhone,
                service = service,
                staff = staff,
                scheduledAt = scheduledAt
            )
            showToast(message)
            onResult(success, message)
        }
    }

    fun checkInAppointment(appointment: Appointment) {
        viewModelScope.launch {
            val service = _servicesList.value.find { it.id == appointment.serviceId }
            val price = service?.price ?: 0.0
            repository.checkInAppointment(appointment, price)
            showToast("Checked in ${appointment.customerName} to Today's Queue")
        }
    }

    fun cancelAppointment(appointment: Appointment) {
        viewModelScope.launch {
            repository.updateAppointmentStatus(appointment, AppointmentStatus.CANCELLED)
            showToast("Appointment cancelled")
        }
    }

    fun completeCheckout(
        customerId: String,
        customerName: String,
        staff: Staff,
        cashier: Staff,
        lineItems: List<LineItem>,
        paymentMethod: String,
        queueEntryId: String?
    ) {
        val orgId = _currentOrgId.value ?: return
        viewModelScope.launch {
            val tx = repository.recordPayment(
                organizationId = orgId,
                branchId = "br_main",
                customerId = customerId,
                customerName = customerName,
                staffId = staff.id,
                staffName = staff.name,
                cashierId = cashier.id,
                cashierName = cashier.name,
                lineItems = lineItems,
                paymentMethod = paymentMethod,
                queueEntryId = queueEntryId
            )
            _checkoutQueueEntry.value = null
            _activeReceipt.value = tx
            showToast("Payment recorded! Awaiting ${staff.name}'s confirmation.")
        }
    }

    fun confirmPayment(transaction: Transaction) {
        viewModelScope.launch {
            val updated = repository.confirmTransaction(transaction)
            showToast("Payment confirmed! GH₵${String.format(Locale.US, "%.2f", updated.commissionAmount)} commission credited to ${transaction.staffName}.")
            if (_activeReceipt.value?.id == transaction.id) {
                _activeReceipt.value = updated
            }
        }
    }

    fun disputePayment(transaction: Transaction, reason: String) {
        viewModelScope.launch {
            val updated = repository.disputeTransaction(transaction, reason)
            _disputeDialogTx.value = null
            showToast("Transaction flagged as DISPUTED. Owner notified for resolution.")
            if (_activeReceipt.value?.id == transaction.id) {
                _activeReceipt.value = updated
            }
        }
    }

    fun resolveDispute(transaction: Transaction) {
        viewModelScope.launch {
            val updated = repository.resolveDispute(transaction)
            showToast("Dispute marked resolved. Payment CONFIRMED.")
            if (_activeReceipt.value?.id == transaction.id) {
                _activeReceipt.value = updated
            }
        }
    }

    fun addService(name: String, price: Double, duration: Int, eligibleStaffIds: List<String>) {
        val orgId = _currentOrgId.value ?: return
        viewModelScope.launch {
            repository.addService(orgId, name, price, duration, eligibleStaffIds)
            showToast("Service '$name' added (GH₵${String.format(Locale.US, "%.2f", price)})")
        }
    }

    fun toggleServiceActive(service: Service) {
        viewModelScope.launch {
            repository.updateService(service.copy(active = !service.active))
            showToast("Service ${if (!service.active) "activated" else "deactivated"}")
        }
    }

    fun addStaff(name: String, phone: String, role: String, commissionPercent: Double, serviceIds: List<String>) {
        val orgId = _currentOrgId.value ?: return
        viewModelScope.launch {
            repository.addStaff(orgId, "br_main", name, phone, role, serviceIds, commissionPercent)
            showToast("Staff '$name' added (${commissionPercent.toInt()}% commission)")
        }
    }

    // Receipt and WhatsApp Sharing
    fun generateReceiptText(tx: Transaction): String {
        val orgName = _currentOrg.value?.name ?: "Kora Salon"
        val orgPhone = _currentOrg.value?.phone ?: ""
        val orgLocation = _currentOrg.value?.location ?: "Ghana"
        val sdf = SimpleDateFormat("dd MMM yyyy, hh:mm a", Locale.getDefault())
        val dateStr = sdf.format(Date(tx.createdAt))
        val items = tx.parseLineItems()

        val sb = StringBuilder()
        sb.append("🧾 *RECEIPT — $orgName*\n")
        sb.append("📍 $orgLocation\n")
        if (orgPhone.isNotBlank()) sb.append("📞 $orgPhone\n")
        sb.append("--------------------------------\n")
        sb.append("Date: $dateStr\n")
        sb.append("Customer: ${tx.customerName}\n")
        sb.append("Staff: ${tx.staffName}\n")
        sb.append("Cashier: ${tx.cashierName}\n")
        sb.append("Status: ${tx.status}\n")
        sb.append("Payment: ${tx.paymentMethod}\n")
        sb.append("--------------------------------\n")
        sb.append("*SERVICES:*\n")
        items.forEach { item ->
            sb.append("• ${item.serviceName} : GH₵${String.format(Locale.US, "%.2f", item.price)}\n")
        }
        sb.append("--------------------------------\n")
        sb.append("*TOTAL PAID: GH₵${String.format(Locale.US, "%.2f", tx.totalAmount)}*\n")
        if (tx.status == TransactionStatus.CONFIRMED.name) {
            sb.append("✅ Payment Verified & Confirmed by Staff\n")
        } else if (tx.status == TransactionStatus.PAYMENT_RECORDED.name) {
            sb.append("⏳ Payment Recorded — Pending Staff Confirmation\n")
        } else if (tx.status == TransactionStatus.DISPUTED.name) {
            sb.append("⚠️ Transaction Disputed\n")
        }
        sb.append("--------------------------------\n")
        sb.append("Thank you for choosing $orgName! ✨")

        return sb.toString()
    }

    fun generateStaffVerificationNotificationText(tx: Transaction): String {
        val items = tx.parseLineItems()
        val servicesStr = items.joinToString(", ") { it.serviceName }
        return "👋 Hello ${tx.staffName},\n${tx.cashierName} recorded a *GH₵${String.format(Locale.US, "%.2f", tx.totalAmount)}* payment via *${tx.paymentMethod}* for *$servicesStr* you did for *${tx.customerName}*.\n\nPlease open Kora to *Confirm* or *Dispute*."
    }

    fun copyToClipboard(context: Context, text: String, label: String = "Receipt") {
        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        val clip = ClipData.newPlainText(label, text)
        clipboard.setPrimaryClip(clip)
        Toast.makeText(context, "Copied to clipboard!", Toast.LENGTH_SHORT).show()
    }

    fun shareToWhatsApp(context: Context, text: String, phone: String? = null) {
        try {
            val cleanPhone = phone?.replace(Regex("[^0-9]"), "") ?: ""
            val url = if (cleanPhone.isNotBlank()) {
                "https://api.whatsapp.com/send?phone=$cleanPhone&text=${URLEncoder.encode(text, "UTF-8")}"
            } else {
                "https://api.whatsapp.com/send?text=${URLEncoder.encode(text, "UTF-8")}"
            }
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            context.startActivity(intent)
        } catch (e: Exception) {
            // fallback to general share
            val sendIntent = Intent(Intent.ACTION_SEND).apply {
                putExtra(Intent.EXTRA_TEXT, text)
                type = "text/plain"
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            context.startActivity(Intent.createChooser(sendIntent, "Share Receipt via").apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            })
        }
    }
}
