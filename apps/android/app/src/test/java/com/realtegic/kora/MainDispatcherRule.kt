package com.realtegic.kora

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestDispatcher
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.rules.TestWatcher
import org.junit.runner.Description

/**
 * Every ViewModel in this app uses `viewModelScope`, which dispatches on
 * `Dispatchers.Main` -- unset in a plain JVM unit test. This rule installs
 * a [TestDispatcher] as Main for the duration of each test. Defaults to
 * [UnconfinedTestDispatcher] so `viewModelScope.launch { ... }` runs
 * eagerly up to its first real suspension point, letting a test call an
 * action and immediately assert the resulting state without manually
 * pumping a scheduler.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class MainDispatcherRule(val dispatcher: TestDispatcher = UnconfinedTestDispatcher()) : TestWatcher() {
    override fun starting(description: Description) {
        Dispatchers.setMain(dispatcher)
    }

    override fun finished(description: Description) {
        Dispatchers.resetMain()
    }
}
