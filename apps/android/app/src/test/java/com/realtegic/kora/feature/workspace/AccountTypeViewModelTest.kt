package com.realtegic.kora.feature.workspace

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The account-type screen's own state is pure navigation intent (docs
 * task Phase 5: "this choice is navigation intent, not authorization") --
 * this view model never talks to the network, never creates a role or
 * membership, and never persists anything by itself. Whatever the caller
 * does with [AccountTypeViewModel.select]'s result is what actually
 * decides which real, server-authorized path the user enters.
 */
class AccountTypeViewModelTest {

    @Test
    fun `defaults to customer selected`() {
        val viewModel = AccountTypeViewModel()
        assertEquals(AccountType.CUSTOMER, viewModel.state.value.selected)
    }

    @Test
    fun `selecting business updates state`() {
        val viewModel = AccountTypeViewModel()
        viewModel.select(AccountType.BUSINESS)
        assertEquals(AccountType.BUSINESS, viewModel.state.value.selected)
    }

    @Test
    fun `selecting back to customer updates state`() {
        val viewModel = AccountTypeViewModel()
        viewModel.select(AccountType.BUSINESS)
        viewModel.select(AccountType.CUSTOMER)
        assertEquals(AccountType.CUSTOMER, viewModel.state.value.selected)
    }
}
