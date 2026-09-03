package com.example.data.model

import androidx.room.Entity
import androidx.room.PrimaryKey
import androidx.room.TypeConverter
import androidx.room.TypeConverters
import org.json.JSONArray
import org.json.JSONObject

@Entity(tableName = "organizations")
data class Organization(
    @PrimaryKey val id: String,
    val name: String,
    val phone: String,
    val location: String,
    val plan: String = "FREE",
    val createdAt: Long = System.currentTimeMillis()
)

@Entity(tableName = "branches")
data class Branch(
    @PrimaryKey val id: String,
    val organizationId: String,
    val name: String = "Main Branch"
)

@Entity(tableName = "staff")
data class Staff(
    @PrimaryKey val id: String,
    val organizationId: String,
    val branchId: String,
    val name: String,
    val phone: String,
    val role: String, // "owner" or "staff"
    val serviceIds: List<String>,
    val commissionPercent: Double = 30.0, // Flat % e.g. 30.0 for 30%
    val avatarColor: Long = 0xFFC88A22
)

@Entity(tableName = "services")
data class Service(
    @PrimaryKey val id: String,
    val organizationId: String,
    val name: String,
    val price: Double, // In GH₵ (Ghana Cedis)
    val durationMinutes: Int,
    val active: Boolean = true,
    val eligibleStaffIds: List<String>
)

@Entity(tableName = "customers")
data class Customer(
    @PrimaryKey val id: String,
    val organizationId: String,
    val name: String,
    val phone: String,
    val visitHistoryCount: Int = 1,
    val lastVisit: Long = System.currentTimeMillis()
)

enum class AppointmentStatus {
    CONFIRMED,
    CHECKED_IN,
    COMPLETED,
    CANCELLED
}

@Entity(tableName = "appointments")
data class Appointment(
    @PrimaryKey val id: String,
    val organizationId: String,
    val branchId: String,
    val customerId: String,
    val customerName: String,
    val customerPhone: String,
    val serviceId: String,
    val serviceName: String,
    val staffId: String,
    val staffName: String,
    val status: String = AppointmentStatus.CONFIRMED.name,
    val scheduledAt: Long // Timestamp in ms
)

enum class QueueStatus {
    WAITING,
    IN_SERVICE,
    COMPLETED
}

@Entity(tableName = "queue_entries")
data class QueueEntry(
    @PrimaryKey val id: String,
    val organizationId: String,
    val branchId: String,
    val customerId: String,
    val customerName: String,
    val customerPhone: String,
    val serviceId: String,
    val serviceName: String,
    val staffId: String,
    val staffName: String,
    val status: String = QueueStatus.WAITING.name,
    val createdAt: Long = System.currentTimeMillis(),
    val notes: String = "",
    val price: Double = 0.0,
    val checkoutTransactionId: String? = null
)

enum class TransactionStatus {
    PAYMENT_RECORDED,
    CONFIRMED,
    DISPUTED
}

data class LineItem(
    val serviceId: String,
    val serviceName: String,
    val price: Double
)

@Entity(tableName = "transactions")
data class Transaction(
    @PrimaryKey val id: String,
    val organizationId: String,
    val branchId: String,
    val customerId: String,
    val customerName: String,
    val staffId: String,
    val staffName: String,
    val cashierId: String,
    val cashierName: String,
    val lineItemsJson: String, // Serialized JSON array of LineItem
    val totalAmount: Double, // GH₵
    val paymentMethod: String, // "Cash", "MTN MoMo", "Vodafone Cash", "AT Money", "Card", "Other"
    val status: String = TransactionStatus.PAYMENT_RECORDED.name,
    val commissionPercent: Double = 0.0,
    val commissionAmount: Double = 0.0,
    val disputeReason: String? = null,
    val createdAt: Long = System.currentTimeMillis(),
    val confirmedAt: Long? = null
) {
    fun parseLineItems(): List<LineItem> {
        val list = mutableListOf<LineItem>()
        try {
            val array = JSONArray(lineItemsJson)
            for (i in 0 until array.length()) {
                val obj = array.getJSONObject(i)
                list.add(
                    LineItem(
                        serviceId = obj.optString("serviceId"),
                        serviceName = obj.optString("serviceName"),
                        price = obj.optDouble("price", 0.0)
                    )
                )
            }
        } catch (e: Exception) {
            // fallback
        }
        return list
    }
}

class RoomConverters {
    @TypeConverter
    fun fromStringList(value: List<String>?): String {
        return value?.joinToString(",") ?: ""
    }

    @TypeConverter
    fun toStringList(value: String?): List<String> {
        if (value.isNullOrEmpty()) return emptyList()
        return value.split(",").filter { it.isNotBlank() }
    }
}
