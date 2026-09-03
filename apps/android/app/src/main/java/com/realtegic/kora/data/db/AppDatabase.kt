package com.realtegic.kora.data.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.TypeConverters
import com.realtegic.kora.data.model.Appointment
import com.realtegic.kora.data.model.Branch
import com.realtegic.kora.data.model.Customer
import com.realtegic.kora.data.model.Organization
import com.realtegic.kora.data.model.QueueEntry
import com.realtegic.kora.data.model.RoomConverters
import com.realtegic.kora.data.model.Service
import com.realtegic.kora.data.model.Staff
import com.realtegic.kora.data.model.Transaction

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
    abstract fun chairsideDao(): KoraDao

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
