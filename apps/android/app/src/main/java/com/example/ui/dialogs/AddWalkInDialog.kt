package com.example.ui.dialogs

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
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.example.data.model.Service
import com.example.data.model.Staff
import com.example.ui.theme.GoldPrimary
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddWalkInDialog(
    services: List<Service>,
    staffList: List<Staff>,
    onDismiss: () -> Unit,
    onAdd: (name: String, phone: String, service: Service, staff: Staff, notes: String) -> Unit
) {
    var name by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var notes by remember { mutableStateOf("") }

    var selectedService by remember { mutableStateOf(services.firstOrNull { it.active }) }
    var selectedStaff by remember { mutableStateOf(staffList.firstOrNull()) }

    var serviceDropdownExpanded by remember { mutableStateOf(false) }
    var staffDropdownExpanded by remember { mutableStateOf(false) }

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
                        text = "Add Walk-In to Queue",
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
                    placeholder = { Text("e.g. Kofi Boateng") },
                    singleLine = true,
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("walkin_input_name")
                )

                OutlinedTextField(
                    value = phone,
                    onValueChange = { phone = it },
                    label = { Text("Phone Number (Optional)") },
                    placeholder = { Text("e.g. 0244123456") },
                    singleLine = true,
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("walkin_input_phone")
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
                        value = selectedStaff?.let { "${it.name} (${it.role})" } ?: "Select Staff",
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("Assigned Stylist / Barber *") },
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
                                text = { Text("${stf.name} — ${stf.commissionPercent.toInt()}% comm.") },
                                onClick = {
                                    selectedStaff = stf
                                    staffDropdownExpanded = false
                                }
                            )
                        }
                    }
                }

                OutlinedTextField(
                    value = notes,
                    onValueChange = { notes = it },
                    label = { Text("Notes / Request (Optional)") },
                    placeholder = { Text("e.g. Skin fade, gentle wash") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )

                Spacer(modifier = Modifier.height(4.dp))

                Button(
                    onClick = {
                        val svc = selectedService ?: return@Button
                        val stf = selectedStaff ?: return@Button
                        if (name.isNotBlank()) {
                            onAdd(name.trim(), phone.trim(), svc, stf, notes.trim())
                            onDismiss()
                        }
                    },
                    enabled = name.isNotBlank() && selectedService != null && selectedStaff != null,
                    colors = ButtonDefaults.buttonColors(containerColor = GoldPrimary),
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp)
                        .testTag("submit_add_walkin")
                ) {
                    Text("Add to Waiting Queue", fontWeight = FontWeight.Bold, fontSize = 15.sp)
                }
            }
        }
    }
}
