package com.realtegic.kora.ui.components

import androidx.compose.foundation.layout.size
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.realtegic.kora.MainTab
import com.realtegic.kora.ui.theme.GoldContainer
import com.realtegic.kora.ui.theme.GoldPrimary
import com.realtegic.kora.ui.theme.SlateDark
import com.realtegic.kora.ui.theme.StatusRed

@Composable
fun KoraBottomNavigation(
    currentTab: MainTab,
    waitingQueueCount: Int,
    pendingVerificationCount: Int,
    disputedVerificationCount: Int,
    onTabSelected: (MainTab) -> Unit
) {
    NavigationBar(
        containerColor = SlateDark,
        tonalElevation = 0.dp
    ) {
        MainTab.values().forEach { tab ->
            val selected = currentTab == tab
            val badgeCount = when (tab) {
                MainTab.QUEUE -> waitingQueueCount
                MainTab.CONFIRMATIONS ->
                    pendingVerificationCount + disputedVerificationCount
                else -> 0
            }

            NavigationBarItem(
                selected = selected,
                onClick = { onTabSelected(tab) },
                icon = {
                    if (badgeCount > 0) {
                        BadgedBox(
                            badge = {
                                Badge(
                                    containerColor =
                                        if (
                                            tab == MainTab.CONFIRMATIONS &&
                                            disputedVerificationCount > 0
                                        ) {
                                            StatusRed
                                        } else {
                                            GoldPrimary
                                        },
                                    contentColor = Color.White
                                ) {
                                    Text(
                                        if (badgeCount > 99) {
                                            "99+"
                                        } else {
                                            badgeCount.toString()
                                        }
                                    )
                                }
                            }
                        ) {
                            Icon(
                                imageVector = tab.icon,
                                contentDescription = tab.title,
                                modifier = Modifier.size(23.dp)
                            )
                        }
                    } else {
                        Icon(
                            imageVector = tab.icon,
                            contentDescription = tab.title,
                            modifier = Modifier.size(23.dp)
                        )
                    }
                },
                label = {
                    Text(
                        text = tab.title,
                        maxLines = if (tab == MainTab.SERVICES_STAFF) 2 else 1,
                        softWrap = tab == MainTab.SERVICES_STAFF,
                        overflow = TextOverflow.Ellipsis,
                        textAlign = TextAlign.Center,
                        fontSize = 9.sp,
                        lineHeight = 10.sp,
                        fontWeight =
                            if (selected) FontWeight.Bold else FontWeight.Medium
                    )
                },
                colors = NavigationBarItemDefaults.colors(
                    selectedIconColor = GoldPrimary,
                    selectedTextColor = GoldPrimary,
                    indicatorColor = GoldContainer,
                    unselectedIconColor = Color(0xFFCBD5E1),
                    unselectedTextColor = Color(0xFFCBD5E1)
                ),
                modifier =
                    Modifier.testTag("nav_tab_${tab.name.lowercase()}")
            )
        }
    }
}
