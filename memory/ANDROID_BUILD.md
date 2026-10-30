# Baked Android build (local, in this workspace)
- Workspace is ARM64 with an 8 GB memory limit. /opt is wiped when the pod is moved → re-run `mobile/scripts/setup-android-toolchain.sh` (~3 min).
- Build: `cd /app/mobile && scripts/build-android.sh <test|production> <apk|aab|both>` (run detached with setsid; log to /var/log/baked-build.log). Stop `expo-mobile` supervisor program during builds to save memory. ~19 min first build.
- production forces EXPO_PUBLIC_API_URL / WEB_ORIGIN = https://baked.ci (preview URL never embedded).
- Builds in /opt/baked-build/mobile (rsync mirror; /app volume too small). Hermes x86 compiler via qemu wrapper; community ARM64 SDK/NDK (zhuwanhong/android-sdk-linux-arm64). Only arm64-v8a (armeabi-v7a link fails with community NDK).
- Upload key: /app/signing/baked-upload.jks + upload-key.properties (gitignored). SHA-1 3D:AA:49:01:B1:5D:06:9A:62:B1:E3:90:31:91:4B:1D:07:07:74:1E ; SHA-256 46:29:DE:42:7D:51:E5:A9:88:B1:52:82:3F:94:33:65:88:33:49:23:68:E8:01:20:C3:CA:AF:5C:7D:40:56:34
- Downloads served from /app/frontend/public/downloads/ (gitignored, random names). Test APK v2 (versionCode 2, R8 keep rules for Room/WorkManager): baked-test-v2-fbfd6d2c480d636e.apk
- Production checklist pending: verify https://baked.ci/api, security audit, then build production apk+aab with BAKED_ANDROID_VERSION_CODE.
- Memory: stop frontend + expo-mobile during the R8 step if anon memory > 6 GB (guard pkill pattern does not catch the Gradle java process).
