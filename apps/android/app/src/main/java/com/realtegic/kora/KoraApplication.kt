package com.realtegic.kora

import android.app.Application
import com.realtegic.kora.core.di.AppContainer

class KoraApplication : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
    }
}
