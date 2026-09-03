package com.example.ui.dialogs

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ContentCut
import androidx.compose.material.icons.filled.Store
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
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
import com.example.ui.theme.GoldPrimary

@Composable
fun OnboardingDialog(
    onDismiss: () -> Unit,
    onComplete: (
        name: String,
        phone: String,
        location: String,
        services: List<Pair<String, Double>>,
        staffName: String,
        staffCommission: Double
    ) -> Unit
) {
    var step by remember { mutableStateOf(1) } // 1 = Business, 2 = Services & Staff

    var businessName by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var location by remember { mutableStateOf("Accra, Ghana") }

    var svc1Name by remember { mutableStateOf("Haircut") }
    var svc1Price by remember { mutableStateOf("70") }

    var svc2Name by remember { mutableStateOf("Beard Trim") }
    var svc2Price by remember { mutableStateOf("35") }

    var svc3Name by remember { mutableStateOf("Braids") }
    var svc3Price by remember { mutableStateOf("140") }

    var staffName by remember { mutableStateOf("Kofi Barimah") }
    var staffCommission by remember { mutableStateOf("35") }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Card(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            modifier = Modifier
                .fillMaxWidth(0.95f)
                .padding(16.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(20.dp)
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                // Header
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(36.dp)
                                .clip(CircleShape)
                                .background(GoldPrimary),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(Icons.Default.Store, contentDescription = null, tint = Color.White, modifier = Modifier.size(20.dp))
                        }
                        Spacer(modifier = Modifier.width(10.dp))
                        Column {
                            Text(
                                text = "Setup Your Salon in 2 Mins",
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Bold
                            )
                            Text(
                                text = "Step $step of 2",
                                fontSize = 12.sp,
                                color = GoldPrimary,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                    IconButton(onClick = onDismiss) {
                        Icon(imageVector = Icons.Default.Close, contentDescription = "Close")
                    }
                }

                if (step == 1) {
                    Text(
                        text = "Enter your salon or barbershop details in Ghana:",
                        fontSize = 13.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )

                    OutlinedTextField(
                        value = businessName,
                        onValueChange = { businessName = it },
                        label = { Text("Salon / Shop Name *") },
                        placeholder = { Text("e.g. Golden Cuts Barbershop") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth().testTag("onboard_shop_name")
                    )

                    OutlinedTextField(
                        value = location,
                        onValueChange = { location = it },
                        label = { Text("Location in Ghana *") },
                        placeholder = { Text("e.g. Osu, Accra or Adum, Kumasi") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth().testTag("onboard_shop_location")
                    )

                    OutlinedTextField(
                        value = phone,
                        onValueChange = { phone = it },
                        label = { Text("Business Phone / WhatsApp *") },
                        placeholder = { Text("e.g. 0244 123 456") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth().testTag("onboard_shop_phone")
                    )

                    Button(
                        onClick = {
                            if (businessName.isNotBlank() && location.isNotBlank()) {
                                step = 2
                            }
                        },
                        enabled = businessName.isNotBlank(),
                        colors = ButtonDefaults.buttonColors(containerColor = GoldPrimary),
                        shape = RoundedCornerShape(10.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(48.dp)
                            .testTag("onboard_next_step")
                    ) {
                        Text("Next: Services & Staff", fontWeight = FontWeight.Bold)
                    }
                } else {
                    Text(
                        text = "Add your initial services (in GH₵) and first team member:",
                        fontSize = 13.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )

                    // Services
                    Text("Top Services (GH₵):", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        OutlinedTextField(
                            value = svc1Name,
                            onValueChange = { svc1Name = it },
                            label = { Text("Service 1") },
                            modifier = Modifier.weight(2f)
                        )
                        OutlinedTextField(
                            value = svc1Price,
                            onValueChange = { svc1Price = it },
                            label = { Text("GH₵") },
                            modifier = Modifier.weight(1f)
                        )
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        OutlinedTextField(
                            value = svc2Name,
                            onValueChange = { svc2Name = it },
                            label = { Text("Service 2") },
                            modifier = Modifier.weight(2f)
                        )
                        OutlinedTextField(
                            value = svc2Price,
                            onValueChange = { svc2Price = it },
                            label = { Text("GH₵") },
                            modifier = Modifier.weight(1f)
                        )
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        OutlinedTextField(
                            value = svc3Name,
                            onValueChange = { svc3Name = it },
                            label = { Text("Service 3") },
                            modifier = Modifier.weight(2f)
                        )
                        OutlinedTextField(
                            value = svc3Price,
                            onValueChange = { svc3Price = it },
                            label = { Text("GH₵") },
                            modifier = Modifier.weight(1f)
                        )
                    }

                    // Staff
                    Text("First Team Member & Commission %:", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        OutlinedTextField(
                            value = staffName,
                            onValueChange = { staffName = it },
                            label = { Text("Staff Name") },
                            modifier = Modifier.weight(2f)
                        )
                        OutlinedTextField(
                            value = staffCommission,
                            onValueChange = { staffCommission = it },
                            label = { Text("Comm %") },
                            modifier = Modifier.weight(1f)
                        )
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Button(
                            onClick = { step = 1 },
                            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
                            modifier = Modifier.weight(1f).height(48.dp)
                        ) {
                            Text("Back", color = MaterialTheme.colorScheme.onSurface)
                        }

                        Button(
                            onClick = {
                                val servicesList = mutableListOf<Pair<String, Double>>()
                                svc1Price.toDoubleOrNull()?.let { servicesList.add(Pair(svc1Name, it)) }
                                svc2Price.toDoubleOrNull()?.let { servicesList.add(Pair(svc2Name, it)) }
                                svc3Price.toDoubleOrNull()?.let { servicesList.add(Pair(svc3Name, it)) }

                                val comm = staffCommission.toDoubleOrNull() ?: 35.0
                                onComplete(
                                    businessName.trim(),
                                    phone.trim(),
                                    location.trim(),
                                    servicesList,
                                    staffName.trim(),
                                    comm
                                )
                                onDismiss()
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = GoldPrimary),
                            shape = RoundedCornerShape(10.dp),
                            modifier = Modifier
                                .weight(2f)
                                .height(48.dp)
                                .testTag("onboard_finish_btn")
                        ) {
                            Text("Launch Salon", fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }
    }
}
