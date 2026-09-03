package com.example.ui.dialogs

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.example.data.model.Service
import com.example.data.model.Staff
import com.example.ui.theme.GoldPrimary
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BookAppointmentDialog(
    services: List<Service>,
    staffList: List<Staff>,
    onDismiss: () -> Unit,
    onBook: (name: String, phone: String, service: Service, staff: Staff, timestamp: Long) -> Unit
) {
    var name by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }

    var selectedService by remember { mutableStateOf(services.firstOrNull { it.active }) }
    var selectedStaff by remember { mutableStateOf(staffList.firstOrNull()) }

    var selectedDayOffset by remember { mutableStateOf(0) } // 0=Today, 1=Tomorrow, 2=+2 days
    var selectedHour by remember { mutableStateOf(10) } // 10:00 AM default
    var selectedMinute by remember { mutableStateOf(0) }

    var serviceDropdownExpanded by remember { mutableStateOf(false) }
    var staffDropdownExpanded by remember { mutableStateOf(false) }

    val times = listOf(
        Pair(9, 0), Pair(10, 0), Pair(11, 0), Pair(12, 0),
        Pair(13, 0), Pair(14, 0), Pair(15, 0), Pair(16, 0), Pair(17, 0), Pair(18, 0)
    )

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Card(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            modifier = Modifier
                .fillMaxWidth(0.92f)
                .padding(16.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Book Appointment",
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold
                    )
                    IconButton(onClick = onDismiss) {
                        Icon(imageVector = Icons.Default.Close, contentDescription = "Close")
                    }
                }

                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Customer Name *") },
                    placeholder = { Text("e.g. Abena Serwaa") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth().testTag("appt_input_name")
                )

                OutlinedTextField(
                    value = phone,
                    onValueChange = { phone = it },
                    label = { Text("Phone Number *") },
                    placeholder = { Text("e.g. 0559876543") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth().testTag("appt_input_phone")
                )

                // Select Service
                ExposedDropdownMenuBox(
                    expanded = serviceDropdownExpanded,
                    onExpandedChange = { serviceDropdownExpanded = it }
                ) {
                    OutlinedTextField(
                        value = selectedService?.let { "${it.name} — GH₵${String.format(Locale.US, "%.2f", it.price)}" } ?: "Select Service",
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("Service *") },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = serviceDropdownExpanded) },
                        modifier = Modifier
                            .menuAnchor()
                            .fillMaxWidth()
                    )
                    ExposedDropdownMenu(
                        expanded = serviceDropdownExpanded,
                        onDismissRequest = { serviceDropdownExpanded = false }
                    ) {
                        services.filter { it.active }.forEach { svc ->
                            DropdownMenuItem(
                                text = { Text("${svc.name} — GH₵${String.format(Locale.US, "%.2f", svc.price)} (${svc.durationMinutes} min)") },
                                onClick = {
                                    selectedService = svc
                                    serviceDropdownExpanded = false
                                }
                            )
                        }
                    }
                }

                // Select Staff
                ExposedDropdownMenuBox(
                    expanded = staffDropdownExpanded,
                    onExpandedChange = { staffDropdownExpanded = it }
                ) {
                    OutlinedTextField(
                        value = selectedStaff?.let { "${it.name}" } ?: "Select Staff",
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("Stylist / Barber *") },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = staffDropdownExpanded) },
                        modifier = Modifier
                            .menuAnchor()
                            .fillMaxWidth()
                    )
                    ExposedDropdownMenu(
                        expanded = staffDropdownExpanded,
                        onDismissRequest = { staffDropdownExpanded = false }
                    ) {
                        staffList.forEach { stf ->
                            DropdownMenuItem(
                                text = { Text(stf.name) },
                                onClick = {
                                    selectedStaff = stf
                                    staffDropdownExpanded = false
                                }
                            )
                        }
                    }
                }

                // Date Picker (Today / Tomorrow / Day After)
                Text("Select Date:", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    listOf("Today", "Tomorrow", "In 2 Days").forEachIndexed { index, label ->
                        val isSelected = selectedDayOffset == index
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = if (isSelected) GoldPrimary else MaterialTheme.colorScheme.surfaceVariant,
                            modifier = Modifier
                                .weight(1f)
                                .clip(RoundedCornerShape(8.dp))
                                .clickable { selectedDayOffset = index }
                        ) {
                            Text(
                                text = label,
                                color = if (isSelected) Color.White else MaterialTheme.colorScheme.onSurface,
                                fontWeight = FontWeight.Bold,
                                fontSize = 12.sp,
                                modifier = Modifier.padding(vertical = 8.dp, horizontal = 4.dp),
                                textAlign = androidx.compose.ui.text.style.TextAlign.Center
                            )
                        }
                    }
                }

                // Time Slots
                Text("Select Time Slot:", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    listOf(Pair(9, "09:00 AM"), Pair(11, "11:00 AM"), Pair(14, "02:00 PM"), Pair(16, "04:00 PM")).forEach { (hour, label) ->
                        val isSelected = selectedHour == hour
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = if (isSelected) GoldPrimary else MaterialTheme.colorScheme.surfaceVariant,
                            modifier = Modifier
                                .weight(1f)
                                .clip(RoundedCornerShape(8.dp))
                                .clickable { selectedHour = hour }
                        ) {
                            Text(
                                text = label,
                                color = if (isSelected) Color.White else MaterialTheme.colorScheme.onSurface,
                                fontWeight = FontWeight.Bold,
                                fontSize = 11.sp,
                                modifier = Modifier.padding(vertical = 8.dp, horizontal = 2.dp),
                                textAlign = androidx.compose.ui.text.style.TextAlign.Center
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(4.dp))

                Button(
                    onClick = {
                        val svc = selectedService ?: return@Button
                        val stf = selectedStaff ?: return@Button
                        if (name.isNotBlank()) {
                            val cal = Calendar.getInstance().apply {
                                add(Calendar.DAY_OF_YEAR, selectedDayOffset)
                                set(Calendar.HOUR_OF_DAY, selectedHour)
                                set(Calendar.MINUTE, selectedMinute)
                                set(Calendar.SECOND, 0)
                            }
                            onBook(name.trim(), phone.trim(), svc, stf, cal.timeInMillis)
                            onDismiss()
                        }
                    },
                    enabled = name.isNotBlank() && selectedService != null && selectedStaff != null,
                    colors = ButtonDefaults.buttonColors(containerColor = GoldPrimary),
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp)
                        .testTag("submit_book_appt")
                ) {
                    Text("Confirm Booking", fontWeight = FontWeight.Bold, fontSize = 15.sp)
                }
            }
        }
    }
}
