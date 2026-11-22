package com.sailxx.fitter.data

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import android.util.Base64
import androidx.core.content.FileProvider
import androidx.exifinterface.media.ExifInterface
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.io.File

/**
 * Фото еды: файл для камеры и сжатие перед отправкой.
 * Нейросети хватает 1024 px по длинной стороне — так фото весит 100–200 КБ и уходит быстро.
 */
object Photos {
    private const val MAX_SIDE = 1024

    /** Куда камера сохранит снимок: временный файл в кэше приложения, без разрешений на память. */
    fun cameraUri(context: Context): Uri {
        val dir = File(context.cacheDir, "photos").apply { mkdirs() }
        val olderThan = System.currentTimeMillis() - 24 * 60 * 60 * 1000L
        dir.listFiles()?.filter { it.isFile && it.lastModified() < olderThan }?.forEach { it.delete() }
        val file = File.createTempFile("meal-", ".jpg", dir)
        return FileProvider.getUriForFile(context, "${context.packageName}.photos", file)
    }

    fun removeCameraPhoto(context: Context, uri: Uri) {
        runCatching { context.contentResolver.delete(uri, null, null) }
    }

    /** Уменьшить, повернуть по EXIF и отдать JPEG в base64. Миниатюра — для предпросмотра на экране. */
    suspend fun encode(context: Context, uri: Uri): Pair<String, Bitmap> = withContext(Dispatchers.IO) {
        val cr = context.contentResolver
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        requireNotNull(cr.openAssetFileDescriptor(uri, "r")).use { descriptor ->
            require(descriptor.length <= 40L * 1024 * 1024) { "Image file is too large" }
            descriptor.createInputStream().use { BitmapFactory.decodeStream(it, null, bounds) }
        }
        require(bounds.outWidth > 0 && bounds.outHeight > 0 && bounds.outWidth.toLong() * bounds.outHeight <= 120_000_000) { "Invalid image dimensions" }
        var sample = 1
        while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= MAX_SIDE) sample *= 2
        val raw = cr.openInputStream(uri).use { BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample }) }
            ?: error("not an image")
        val rotation = runCatching {
            cr.openInputStream(uri).use { s ->
                when (ExifInterface(s!!).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
                    ExifInterface.ORIENTATION_ROTATE_90 -> 90f
                    ExifInterface.ORIENTATION_ROTATE_180 -> 180f
                    ExifInterface.ORIENTATION_ROTATE_270 -> 270f
                    else -> 0f
                }
            }
        }.getOrDefault(0f)
        val scale = minOf(1f, MAX_SIDE.toFloat() / maxOf(raw.width, raw.height))
        val m = Matrix().apply { postScale(scale, scale); postRotate(rotation) }
        val bmp = Bitmap.createBitmap(raw, 0, 0, raw.width, raw.height, m, true)
        val out = ByteArrayOutputStream()
        bmp.compress(Bitmap.CompressFormat.JPEG, 78, out)
        Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP) to bmp
    }
}
