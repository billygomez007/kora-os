package com.realtegic.kora.core.navigation

import androidx.compose.runtime.Composable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory

/** The explicit-DI equivalent of Hilt's `hiltViewModel()` (docs task
 * Phase 1): builds a [ViewModel] from a plain constructor lambda closing
 * over [com.realtegic.kora.core.di.AppContainer]'s already-built
 * dependencies, with no reflection, annotation processing, or global
 * service locator involved. */
@Composable
inline fun <reified VM : ViewModel> koraViewModel(crossinline creator: () -> VM): VM {
    return viewModel(factory = viewModelFactory { initializer { creator() } })
}
