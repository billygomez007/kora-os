package com.example.data.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.TypeConverters
import com.example.data.model.Appointment
import com.example.data.model.Branch
import com.example.data.model.Customer
import com.example.data.model.Organization
import com.example.data.model.QueueEntry
import com.example.data.model.RoomConverters
import com.example.data.model.Service
import com.example.data.model.Staff
import com.example.data.model.Transaction

@Database(
    entities = [
        Organization::class,
        Branch::class,
        Staff::class,
        Service::class,
        Customer::class,
        Appointment::class,
        QueueEntry::class,
        Transaction::class
    ],
    version = 1,
    exportSchema = false
)
@TypeConverters(RoomConverters::class)
abstract class AppDatabase : RoomDatabase() {
    abstract fun chairsideDao(): ChairsideDao

    companion object {
        @Volatile
        private var INSTANCE: AppDatabase? = null

        fun getDatabase(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "chairside_db"
                ).fallbackToDestructiveMigration()
                 .build()
                INSTANCE = instance
                instance
            }
        }
    }
}
