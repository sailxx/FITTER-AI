package com.sailxx.fitter.data

import androidx.core.content.edit
import android.content.SharedPreferences
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** The reusable server credential is stored as AES-GCM ciphertext. */
internal object SessionToken {
    private const val ALIAS = "fitter.session.v2"
    private const val PREF = "encrypted_token"
    private var loaded = false
    private var cached: String? = null

    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").run {
            init(KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build())
            generateKey()
        }
    }

    @Synchronized
    fun get(prefs: SharedPreferences): String? {
        if (loaded) return cached
        val stored = prefs.getString(PREF, null)
        cached = stored?.let {
            runCatching {
                val data = Base64.decode(it, Base64.NO_WRAP)
                val cipher = Cipher.getInstance("AES/GCM/NoPadding")
                cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, data.copyOfRange(0, 12)))
                cipher.doFinal(data, 12, data.size - 12).toString(Charsets.UTF_8)
            }.getOrNull()
        }
        if (cached == null && (stored != null || prefs.contains("token"))) prefs.edit { clear() }
        loaded = true
        return cached
    }

    @Synchronized
    fun save(prefs: SharedPreferences, token: String) {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val data = cipher.iv + cipher.doFinal(token.toByteArray(Charsets.UTF_8))
        prefs.edit {
            clear()
            putString(PREF, Base64.encodeToString(data, Base64.NO_WRAP))
        }
        cached = token
        loaded = true
    }

    @Synchronized
    fun clear(prefs: SharedPreferences) {
        prefs.edit { clear() }
        cached = null
        loaded = true
    }
}
