package com.realtegic.kora.feature.workspace

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import com.realtegic.kora.ui.theme.KoraTheme
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.junit.runner.RunWith

/**
 * Matches `kora-auth-account-type-reference.png` (docs task Phase 5). A
 * tall viewport (docs task: same fix as [WorkspaceChooserScreenTest])
 * keeps the "Continue" button within the laid-out screen -- otherwise
 * `verticalScroll` still composes it, but its click coordinates fall
 * outside the clipped viewport and the tap never lands. Confirms only
 * that the right callback fires for the selected card -- this screen has
 * no server calls or permission side effects of its own, so there is
 * nothing else here to fake or assert against.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36], qualifiers = "w360dp-h800dp")
class AccountTypeScreenTest {
    @get:Rule
    val composeRule = createComposeRule()

    private fun setContent(viewModel: AccountTypeViewModel, onCustomer: () -> Unit = {}, onBusiness: () -> Unit = {}) {
        composeRule.setContent {
            KoraTheme {
                AccountTypeScreen(viewModel = viewModel, onCustomerContinue = onCustomer, onBusinessContinue = onBusiness)
            }
        }
    }

    @Test
    fun `continuing with the default selection routes to customer`() {
        var customerCalled = false
        var businessCalled = false
        setContent(AccountTypeViewModel(), onCustomer = { customerCalled = true }, onBusiness = { businessCalled = true })

        composeRule.onNodeWithTag(AccountTypeScreenTestTags.CONTINUE_BUTTON).performClick()

        assertTrue(customerCalled)
        assertFalse(businessCalled)
    }

    @Test
    fun `selecting the business card then continuing routes to business, never customer`() {
        var customerCalled = false
        var businessCalled = false
        setContent(AccountTypeViewModel(), onCustomer = { customerCalled = true }, onBusiness = { businessCalled = true })

        composeRule.onNodeWithTag(AccountTypeScreenTestTags.BUSINESS_CARD).performClick()
        composeRule.onNodeWithTag(AccountTypeScreenTestTags.CONTINUE_BUTTON).performClick()

        assertTrue(businessCalled)
        assertFalse(customerCalled)
    }
}
