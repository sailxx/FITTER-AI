package com.sailxx.fitter

import android.app.Application
import com.sailxx.fitter.data.Lang

/** Язык читаем до всего остального: виджеты, напоминания и фоновая синхронизация запускаются без экрана. */
class FitterApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Lang.load(this)
    }
}
