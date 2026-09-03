package com.example.data.db

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import com.example.data.model.Appointment
import com.example.data.model.Branch
import com.example.data.model.Customer
import com.example.data.model.Organization
import com.example.data.model.QueueEntry
import com.example.data.model.Service
import com.example.data.model.Staff
import com.example.data.model.Transaction
import kotlinx.coroutines.flow.Flow

@Dao
interface ChairsideDao {

    // Organizations
    @Query("SELECT * FROM organizations WHERE id = :id LIMIT 1")
    fun getOrganization(id: String): Flow<Organization?>

    @Query("SELECT * FROM organizations")
    fun getAllOrganizations(): Flow<List<Organization>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertOrganization(organization: Organization)

    // Branches
    @Query("SELECT * FROM branches WHERE organizationId = :organizationId")
    fun getBranches(organizationId: String): Flow<List<Branch>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertBranch(branch: Branch)

    // Staff
    @Query("SELECT * FROM staff WHERE organizationId = :organizationId")
    fun getStaff(organizationId: String): Flow<List<Staff>>

    @Query("SELECT * FROM staff WHERE id = :id LIMIT 1")
    suspend fun getStaffById(id: String): Staff?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertStaff(staff: Staff)

    @Update
    suspend fun updateStaff(staff: Staff)

    @Delete
    suspend fun deleteStaff(staff: Staff)

    // Services
    @Query("SELECT * FROM services WHERE organizationId = :organizationId")
    fun getServices(organizationId: String): Flow<List<Service>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertService(service: Service)

    @Update
    suspend fun updateService(service: Service)

    @Delete
    suspend fun deleteService(service: Service)

    // Customers
    @Query("SELECT * FROM customers WHERE organizationId = :organizationId")
    fun getCustomers(organizationId: String): Flow<List<Customer>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertCustomer(customer: Customer)

    // Appointments
    @Query("SELECT * FROM appointments WHERE organizationId = :organizationId ORDER BY scheduledAt ASC")
    fun getAppointments(organizationId: String): Flow<List<Appointment>>

    @Query("SELECT * FROM appointments WHERE staffId = :staffId AND scheduledAt >= :startTime AND scheduledAt <= :endTime AND status != 'CANCELLED'")
    suspend fun getStaffAppointmentsInRange(staffId: String, startTime: Long, endTime: Long): List<Appointment>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAppointment(appointment: Appointment)

    @Update
    suspend fun updateAppointment(appointment: Appointment)

    @Delete
    suspend fun deleteAppointment(appointment: Appointment)

    // Queue Entries
    @Query("SELECT * FROM queue_entries WHERE organizationId = :organizationId ORDER BY createdAt DESC")
    fun getQueueEntries(organizationId: String): Flow<List<QueueEntry>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertQueueEntry(queueEntry: QueueEntry)

    @Update
    suspend fun updateQueueEntry(queueEntry: QueueEntry)

    @Query("DELETE FROM queue_entries WHERE id = :id")
    suspend fun deleteQueueEntryById(id: String)

    // Transactions
    @Query("SELECT * FROM transactions WHERE organizationId = :organizationId ORDER BY createdAt DESC")
    fun getTransactions(organizationId: String): Flow<List<Transaction>>

    @Query("SELECT * FROM transactions WHERE staffId = :staffId ORDER BY createdAt DESC")
    fun getTransactionsForStaff(staffId: String): Flow<List<Transaction>>

    @Query("SELECT * FROM transactions WHERE id = :id LIMIT 1")
    suspend fun getTransactionById(id: String): Transaction?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertTransaction(transaction: Transaction)

    @Update
    suspend fun updateTransaction(transaction: Transaction)

    // Bulk delete for seed reset
    @Query("DELETE FROM organizations")
    suspend fun clearAllOrganizations()

    @Query("DELETE FROM branches")
    suspend fun clearAllBranches()

    @Query("DELETE FROM staff")
    suspend fun clearAllStaff()

    @Query("DELETE FROM services")
    suspend fun clearAllServices()

    @Query("DELETE FROM customers")
    suspend fun clearAllCustomers()

    @Query("DELETE FROM appointments")
    suspend fun clearAllAppointments()

    @Query("DELETE FROM queue_entries")
    suspend fun clearAllQueueEntries()

    @Query("DELETE FROM transactions")
    suspend fun clearAllTransactions()
}
