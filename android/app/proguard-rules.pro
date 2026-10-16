# Сеть — HttpURLConnection и org.json из Android, правила для сторонних библиотек не нужны
# Кнопки виджета Glance создаёт по имени класса
-keep class * implements androidx.glance.appwidget.action.ActionCallback { <init>(); }
