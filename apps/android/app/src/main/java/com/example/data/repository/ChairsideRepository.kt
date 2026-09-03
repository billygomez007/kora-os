package com.example.data.repository

import com.example.data.db.ChairsideDao
import com.example.data.model.Appointment
import com.example.data.model.AppointmentStatus
import com.example.data.model.Branch
import com.example.data.model.Customer
import com.example.data.model.LineItem
import com.example.data.model.Organization
import com.example.data.model.QueueEntry
import com.example.data.model.QueueStatus
import com.example.data.model.Service
import com.example.data.model.Staff
import com.example.data.model.Transaction
import com.example.data.model.TransactionStatus
import kotlinx.coroutines.flow.Flow
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

class ChairsideRepository(private val dao: ChairsideDao) {

    val allOrganizations: Flow<List<Organization>> = dao.getAllOrganizations()

    fun getOrganization(id: String): Flow<Organization?> = dao.getOrganization(id)

    fun getBranches(organizationId: String): Flow<List<Branch>> = dao.getBranches(organizationId)

    fun getStaff(organizationId: String): Flow<List<Staff>> = dao.getStaff(organizationId)

    fun getServices(organizationId: String): Flow<List<Service>> = dao.getServices(organizationId)

    fun getCustomers(organizationId: String): Flow<List<Customer>> = dao.getCustomers(organizationId)

    fun getAppointments(organizationId: String): Flow<List<Appointment>> = dao.getAppointments(organizationId)

    fun getQueueEntries(organizationId: String): Flow<List<QueueEntry>> = dao.getQueueEntries(organizationId)

    fun getTransactions(organizationId: String): Flow<List<Transaction>> = dao.getTransactions(organizationId)

    fun getTransactionsForStaff(staffId: String): Flow<List<Transaction>> = dao.getTransactionsForStaff(staffId)

    suspend fun createOrganization(name: String, phone: String, location: String): Organization {
        val orgId = "org_" + UUID.randomUUID().toString().take(8)
        val branchId = "br_" + UUID.randomUUID().toString().take(8)
        val org = Organization(
            id = orgId,
            name = name,
            phone = phone,
            location = location,
            plan = "FREE"
        )
        val branch = Branch(id = branchId, organizationId = orgId, name = "Main Branch")
        dao.insertOrganization(org)
        dao.insertBranch(branch)
        return org
    }

    suspend fun addService(
        organizationId: String,
        name: String,
        price: Double,
        durationMinutes: Int,
        eligibleStaffIds: List<String>
    ): Service {
        val service = Service(
            id = "svc_" + UUID.randomUUID().toString().take(8),
            organizationId = organizationId,
            name = name,
            price = price,
            durationMinutes = durationMinutes,
            active = true,
            eligibleStaffIds = eligibleStaffIds
        )
        dao.insertService(service)
        return service
    }

    suspend fun updateService(service: Service) {
        dao.updateService(service)
    }

    suspend fun deleteService(service: Service) {
        dao.deleteService(service)
    }

    suspend fun addStaff(
        organizationId: String,
        branchId: String,
        name: String,
        phone: String,
        role: String,
        serviceIds: List<String>,
        commissionPercent: Double
    ): Staff {
        val colors = listOf(0xFFC88A22, 0xFF2563EB, 0xFF059669, 0xFF7C3AED, 0xFFDB2777)
        val staff = Staff(
            id = "stf_" + UUID.randomUUID().toString().take(8),
            organizationId = organizationId,
            branchId = branchId,
            name = name,
            phone = phone,
            role = role,
            serviceIds = serviceIds,
            commissionPercent = commissionPercent,
            avatarColor = colors.random()
        )
        dao.insertStaff(staff)
        return staff
    }

    suspend fun updateStaff(staff: Staff) {
        dao.updateStaff(staff)
    }

    suspend fun deleteStaff(staff: Staff) {
        dao.deleteStaff(staff)
    }

    suspend fun addWalkIn(
        organizationId: String,
        branchId: String,
        customerName: String,
        customerPhone: String,
        service: Service,
        staff: Staff,
        notes: String = ""
    ): QueueEntry {
        val custId = "cust_" + UUID.randomUUID().toString().take(8)
        val entry = QueueEntry(
            id = "q_" + UUID.randomUUID().toString().take(8),
            organizationId = organizationId,
            branchId = branchId,
            customerId = custId,
            customerName = customerName,
            customerPhone = customerPhone,
            serviceId = service.id,
            serviceName = service.name,
            staffId = staff.id,
            staffName = staff.name,
            status = QueueStatus.WAITING.name,
            price = service.price,
            notes = notes
        )
        dao.insertCustomer(Customer(id = custId, organizationId = organizationId, name = customerName, phone = customerPhone))
        dao.insertQueueEntry(entry)
        return entry
    }

    suspend fun updateQueueStatus(entry: QueueEntry, newStatus: QueueStatus) {
        dao.updateQueueEntry(entry.copy(status = newStatus.name))
    }

    suspend fun deleteQueueEntry(id: String) {
        dao.deleteQueueEntryById(id)
    }

    suspend fun bookAppointment(
        organizationId: String,
        branchId: String,
        customerName: String,
        customerPhone: String,
        service: Service,
        staff: Staff,
        scheduledAt: Long
    ): Pair<Boolean, String> {
        // Prevent double-booking for the staff member within service duration window (±20 mins)
        val window = 20 * 60 * 1000L
        val conflicts = dao.getStaffAppointmentsInRange(
            staffId = staff.id,
            startTime = scheduledAt - window,
            endTime = scheduledAt + window
        )
        if (conflicts.isNotEmpty()) {
            return Pair(false, "${staff.name} is already booked around this time (${conflicts.first().customerName})")
        }

        val custId = "cust_" + UUID.randomUUID().toString().take(8)
        val appointment = Appointment(
            id = "apt_" + UUID.randomUUID().toString().take(8),
            organizationId = organizationId,
            branchId = branchId,
            customerId = custId,
            customerName = customerName,
            customerPhone = customerPhone,
            serviceId = service.id,
            serviceName = service.name,
            staffId = staff.id,
            staffName = staff.name,
            status = AppointmentStatus.CONFIRMED.name,
            scheduledAt = scheduledAt
        )
        dao.insertCustomer(Customer(id = custId, organizationId = organizationId, name = customerName, phone = customerPhone))
        dao.insertAppointment(appointment)
        return Pair(true, "Appointment booked successfully")
    }

    suspend fun checkInAppointment(appointment: Appointment, price: Double = 0.0): QueueEntry {
        dao.updateAppointment(appointment.copy(status = AppointmentStatus.CHECKED_IN.name))
        val entry = QueueEntry(
            id = "q_" + UUID.randomUUID().toString().take(8),
            organizationId = appointment.organizationId,
            branchId = appointment.branchId,
            customerId = appointment.customerId,
            customerName = appointment.customerName,
            customerPhone = appointment.customerPhone,
            serviceId = appointment.serviceId,
            serviceName = appointment.serviceName,
            staffId = appointment.staffId,
            staffName = appointment.staffName,
            status = QueueStatus.WAITING.name,
            price = price,
            notes = "Appt Check-In"
        )
        dao.insertQueueEntry(entry)
        return entry
    }

    suspend fun updateAppointmentStatus(appointment: Appointment, newStatus: AppointmentStatus) {
        dao.updateAppointment(appointment.copy(status = newStatus.name))
    }

    suspend fun recordPayment(
        organizationId: String,
        branchId: String,
        customerId: String,
        customerName: String,
        staffId: String,
        staffName: String,
        cashierId: String,
        cashierName: String,
        lineItems: List<LineItem>,
        paymentMethod: String,
        queueEntryId: String? = null
    ): Transaction {
        val total = lineItems.sumOf { it.price }
        val array = JSONArray()
        lineItems.forEach { item ->
            val obj = JSONObject()
            obj.put("serviceId", item.serviceId)
            obj.put("serviceName", item.serviceName)
            obj.put("price", item.price)
            array.put(obj)
        }

        val staff = dao.getStaffById(staffId)
        val commissionRate = staff?.commissionPercent ?: 30.0
        val commission = total * (commissionRate / 100.0)

        val tx = Transaction(
            id = "tx_" + UUID.randomUUID().toString().take(8),
            organizationId = organizationId,
            branchId = branchId,
            customerId = customerId,
            customerName = customerName,
            staffId = staffId,
            staffName = staffName,
            cashierId = cashierId,
            cashierName = cashierName,
            lineItemsJson = array.toString(),
            totalAmount = total,
            paymentMethod = paymentMethod,
            status = TransactionStatus.PAYMENT_RECORDED.name,
            commissionPercent = commissionRate,
            commissionAmount = commission,
            createdAt = System.currentTimeMillis(),
            confirmedAt = null
        )

        dao.insertTransaction(tx)

        if (queueEntryId != null) {
            dao.deleteQueueEntryById(queueEntryId)
        }

        return tx
    }

    suspend fun confirmTransaction(transaction: Transaction): Transaction {
        val confirmedTx = transaction.copy(
            status = TransactionStatus.CONFIRMED.name,
            confirmedAt = System.currentTimeMillis()
        )
        dao.updateTransaction(confirmedTx)
        return confirmedTx
    }

    suspend fun disputeTransaction(transaction: Transaction, reason: String): Transaction {
        val disputedTx = transaction.copy(
            status = TransactionStatus.DISPUTED.name,
            disputeReason = reason
        )
        dao.updateTransaction(disputedTx)
        return disputedTx
    }

    suspend fun resolveDispute(transaction: Transaction): Transaction {
        val resolvedTx = transaction.copy(
            status = TransactionStatus.CONFIRMED.name,
            disputeReason = null,
            confirmedAt = System.currentTimeMillis()
        )
        dao.updateTransaction(resolvedTx)
        return resolvedTx
    }

    suspend fun seedDemoData(): String {
        dao.clearAllOrganizations()
        dao.clearAllBranches()
        dao.clearAllStaff()
        dao.clearAllServices()
        dao.clearAllCustomers()
        dao.clearAllAppointments()
        dao.clearAllQueueEntries()
        dao.clearAllTransactions()

        val orgId = "org_urban_crown"
        val branchId = "br_kumasi_main"

        val org = Organization(
            id = orgId,
            name = "Urban Crown Salon",
            phone = "+233 24 412 3456",
            location = "Adum, Kumasi, Ghana",
            plan = "FREE"
        )
        val branch = Branch(id = branchId, organizationId = orgId, name = "Kumasi Central")

        dao.insertOrganization(org)
        dao.insertBranch(branch)

        // Services
        val svcHaircut = Service(
            id = "svc_haircut",
            organizationId = orgId,
            name = "Haircut",
            price = 80.0,
            durationMinutes = 30,
            active = true,
            eligibleStaffIds = listOf("stf_michael")
        )
        val svcBeard = Service(
            id = "svc_beard",
            organizationId = orgId,
            name = "Beard Trim",
            price = 40.0,
            durationMinutes = 15,
            active = true,
            eligibleStaffIds = listOf("stf_michael")
        )
        val svcBraids = Service(
            id = "svc_braids",
            organizationId = orgId,
            name = "Braids & Twists",
            price = 150.0,
            durationMinutes = 90,
            active = true,
            eligibleStaffIds = listOf("stf_sarah")
        )
        val svcWash = Service(
            id = "svc_wash",
            organizationId = orgId,
            name = "Wash & Blowdry",
            price = 70.0,
            durationMinutes = 45,
            active = true,
            eligibleStaffIds = listOf("stf_sarah", "stf_michael")
        )

        dao.insertService(svcHaircut)
        dao.insertService(svcBeard)
        dao.insertService(svcBraids)
        dao.insertService(svcWash)

        // Staff
        val staffKwame = Staff(
            id = "stf_owner",
            organizationId = orgId,
            branchId = branchId,
            name = "Kwame Mensah (Owner)",
            phone = "+233 24 412 3456",
            role = "owner",
            serviceIds = listOf("svc_haircut", "svc_beard", "svc_braids", "svc_wash"),
            commissionPercent = 100.0,
            avatarColor = 0xFFC88A22
        )
        val staffMichael = Staff(
            id = "stf_michael",
            organizationId = orgId,
            branchId = branchId,
            name = "Michael Osei",
            phone = "+233 50 123 4567",
            role = "staff",
            serviceIds = listOf("svc_haircut", "svc_beard", "svc_wash"),
            commissionPercent = 35.0, // 35% commission
            avatarColor = 0xFF2563EB
        )
        val staffSarah = Staff(
            id = "stf_sarah",
            organizationId = orgId,
            branchId = branchId,
            name = "Sarah Addo",
            phone = "+233 55 987 6543",
            role = "staff",
            serviceIds = listOf("svc_braids", "svc_wash"),
            commissionPercent = 40.0, // 40% commission
            avatarColor = 0xFF059669
        )

        dao.insertStaff(staffKwame)
        dao.insertStaff(staffMichael)
        dao.insertStaff(staffSarah)

        // Customers
        val cust1 = Customer(id = "cust_kofi", organizationId = orgId, name = "Kofi Boateng", phone = "+233 24 111 2233", visitHistoryCount = 3)
        val cust2 = Customer(id = "cust_akosua", organizationId = orgId, name = "Akosua Mansa", phone = "+233 54 222 3344", visitHistoryCount = 5)
        val cust3 = Customer(id = "cust_yaw", organizationId = orgId, name = "Yaw Mensah", phone = "+233 20 333 4455", visitHistoryCount = 1)
        val cust4 = Customer(id = "cust_abena", organizationId = orgId, name = "Abena Serwaa", phone = "+233 27 444 5566", visitHistoryCount = 2)

        dao.insertCustomer(cust1)
        dao.insertCustomer(cust2)
        dao.insertCustomer(cust3)
        dao.insertCustomer(cust4)

        // Queue entries
        val q1 = QueueEntry(
            id = "q_1",
            organizationId = orgId,
            branchId = branchId,
            customerId = cust1.id,
            customerName = cust1.name,
            customerPhone = cust1.phone,
            serviceId = svcHaircut.id,
            serviceName = svcHaircut.name,
            staffId = staffMichael.id,
            staffName = staffMichael.name,
            status = QueueStatus.WAITING.name,
            price = svcHaircut.price,
            notes = "Prefers skin fade"
        )
        val q2 = QueueEntry(
            id = "q_2",
            organizationId = orgId,
            branchId = branchId,
            customerId = cust2.id,
            customerName = cust2.name,
            customerPhone = cust2.phone,
            serviceId = svcBraids.id,
            serviceName = svcBraids.name,
            staffId = staffSarah.id,
            staffName = staffSarah.name,
            status = QueueStatus.IN_SERVICE.name,
            price = svcBraids.price,
            notes = "Knotless braids"
        )
        val q3 = QueueEntry(
            id = "q_3",
            organizationId = orgId,
            branchId = branchId,
            customerId = cust3.id,
            customerName = cust3.name,
            customerPhone = cust3.phone,
            serviceId = svcBeard.id,
            serviceName = svcBeard.name,
            staffId = staffMichael.id,
            staffName = staffMichael.name,
            status = QueueStatus.COMPLETED.name,
            price = svcBeard.price,
            notes = "Ready for POS checkout"
        )

        dao.insertQueueEntry(q1)
        dao.insertQueueEntry(q2)
        dao.insertQueueEntry(q3)

        // Appointments
        val now = System.currentTimeMillis()
        val appt1 = Appointment(
            id = "apt_1",
            organizationId = orgId,
            branchId = branchId,
            customerId = cust4.id,
            customerName = cust4.name,
            customerPhone = cust4.phone,
            serviceId = svcWash.id,
            serviceName = svcWash.name,
            staffId = staffSarah.id,
            staffName = staffSarah.name,
            status = AppointmentStatus.CONFIRMED.name,
            scheduledAt = now + (2 * 3600 * 1000L) // in 2 hours
        )
        dao.insertAppointment(appt1)

        // Transactions:
        // 1. One CONFIRMED
        val items1 = listOf(LineItem(svcHaircut.id, svcHaircut.name, svcHaircut.price))
        val array1 = JSONArray().apply {
            items1.forEach {
                put(JSONObject().apply {
                    put("serviceId", it.serviceId)
                    put("serviceName", it.serviceName)
                    put("price", it.price)
                })
            }
        }
        val tx1 = Transaction(
            id = "tx_conf_1",
            organizationId = orgId,
            branchId = branchId,
            customerId = cust1.id,
            customerName = cust1.name,
            staffId = staffMichael.id,
            staffName = staffMichael.name,
            cashierId = staffKwame.id,
            cashierName = staffKwame.name,
            lineItemsJson = array1.toString(),
            totalAmount = 80.0,
            paymentMethod = "MTN MoMo",
            status = TransactionStatus.CONFIRMED.name,
            commissionPercent = 35.0,
            commissionAmount = 28.0, // 80 * 0.35
            createdAt = now - (3 * 3600 * 1000L),
            confirmedAt = now - (2 * 3600 * 1000L)
        )

        // 2. One PAYMENT_RECORDED (Awaiting Sarah's Confirmation)
        val items2 = listOf(LineItem(svcBraids.id, svcBraids.name, svcBraids.price))
        val array2 = JSONArray().apply {
            items2.forEach {
                put(JSONObject().apply {
                    put("serviceId", it.serviceId)
                    put("serviceName", it.serviceName)
                    put("price", it.price)
                })
            }
        }
        val tx2 = Transaction(
            id = "tx_pend_2",
            organizationId = orgId,
            branchId = branchId,
            customerId = cust2.id,
            customerName = cust2.name,
            staffId = staffSarah.id,
            staffName = staffSarah.name,
            cashierId = staffKwame.id,
            cashierName = staffKwame.name,
            lineItemsJson = array2.toString(),
            totalAmount = 150.0,
            paymentMethod = "Cash",
            status = TransactionStatus.PAYMENT_RECORDED.name,
            commissionPercent = 40.0,
            commissionAmount = 60.0, // 150 * 0.40
            createdAt = now - (30 * 60 * 1000L),
            confirmedAt = null
        )

        // 3. One DISPUTED (Michael flagged dispute)
        val items3 = listOf(
            LineItem(svcHaircut.id, svcHaircut.name, 80.0),
            LineItem(svcBeard.id, svcBeard.name, 40.0)
        )
        val array3 = JSONArray().apply {
            items3.forEach {
                put(JSONObject().apply {
                    put("serviceId", it.serviceId)
                    put("serviceName", it.serviceName)
                    put("price", it.price)
                })
            }
        }
        val tx3 = Transaction(
            id = "tx_disp_3",
            organizationId = orgId,
            branchId = branchId,
            customerId = cust3.id,
            customerName = cust3.name,
            staffId = staffMichael.id,
            staffName = staffMichael.name,
            cashierId = staffKwame.id,
            cashierName = staffKwame.name,
            lineItemsJson = array3.toString(),
            totalAmount = 120.0,
            paymentMethod = "Vodafone Cash",
            status = TransactionStatus.DISPUTED.name,
            commissionPercent = 35.0,
            commissionAmount = 42.0,
            disputeReason = "Payment recorded as GH₵90 on POS, but customer paid GH₵120 for Haircut + Beard Combo.",
            createdAt = now - (90 * 60 * 1000L),
            confirmedAt = null
        )

        dao.insertTransaction(tx1)
        dao.insertTransaction(tx2)
        dao.insertTransaction(tx3)

        return orgId
    }
}
