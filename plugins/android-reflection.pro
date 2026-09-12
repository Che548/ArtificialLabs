# Expo SDK 54 converts Record options using Kotlin reflection at runtime.
# Keeping Record fields alone is insufficient in an optimized release: the
# reflection implementation must retain its metadata-driven lookup contract.
# Keep this boundary intact while allowing R8 to optimize the rest of the app.
-keep class kotlin.reflect.** { *; }
-keep class expo.modules.kotlin.records.** { *; }
