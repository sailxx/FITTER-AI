package com.sailxx.fitter.data

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import android.net.Uri
import android.util.Base64
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.io.File

/**
 * Фото еды: файл для камеры и сжатие перед отправкой.
 * Нейросети хватает 1280 px по длинной стороне — так фото весит 150–300 КБ и уходит быстро.
 */
object Photos {
    private const val MAX_SIDE = 1280

    /** Куда камера сохранит снимок: временный файл в кэше приложения, без разрешений на память. */
    fun cameraUri(context: Context): Uri {
        val dir = File(context.cacheDir, "photos").apply { mkdirs() }
        val file = File(dir, "meal.jpg")
        return FileProvider.getUriForFile(context, "${context.packageName}.photos", file)
    }

    /** Уменьшить, повернуть по EXIF и отдать JPEG в base64. Миниатюра — для предпросмотра на экране. */
    suspend fun encode(context: Context, uri: Uri): Pair<String, Bitmap> = withContext(Dispatchers.IO) {
        val cr = context.contentResolver
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        cr.openInputStream(uri).use { BitmapFactory.decodeStream(it, null, bounds) }
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
        bmp.compress(Bitmap.CompressFormat.JPEG, 82, out)
        Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP) to bmp
    }
}
