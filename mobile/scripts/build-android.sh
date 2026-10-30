#!/usr/bin/env bash
# Build the Baked Android app.  Usage: scripts/build-android.sh <test|production> [apk|aab|both]
# test       -> uses EXPO_PUBLIC_* from mobile/.env (preview backend)
# production -> forces https://baked.ci for API + web origin (never the preview URL)
set -euo pipefail
TARGET="${1:-test}"; KIND="${2:-apk}"
SRC="$(cd "$(dirname "$0")/.." && pwd)"
# Build outside /app (small volume): mirror the project to /opt/baked-build.
WORK=/opt/baked-build/mobile
mkdir -p "$WORK"
rsync -a --delete --exclude /android --exclude /ios --exclude /dist --exclude /.expo "$SRC/" "$WORK/"
cd "$WORK"

export ANDROID_HOME=/opt/android/sdk ANDROID_SDK_ROOT=/opt/android/sdk
export JAVA_HOME="$(dirname "$(dirname "$(readlink -f "$(which java)")")")"
export NODE_ENV=production

if [ "$TARGET" = "production" ]; then
  export EXPO_PUBLIC_API_URL=https://baked.ci
  export EXPO_PUBLIC_WEB_ORIGIN=https://baked.ci
fi
echo "Building $TARGET ($KIND) against ${EXPO_PUBLIC_API_URL:-$(grep EXPO_PUBLIC_API_URL .env | cut -d= -f2)}"

# ARM64 host: run the x86_64 static Hermes compiler through qemu.
H=node_modules/hermes-compiler/hermesc/linux64-bin
if [ "$(uname -m)" = "aarch64" ] && [ ! -f "$H/hermesc.x86" ]; then
  mv "$H/hermesc" "$H/hermesc.x86"
  printf '#!/bin/sh\nexec /usr/bin/qemu-x86_64-static "$(dirname "$0")/hermesc.x86" "$@"\n' > "$H/hermesc"; chmod +x "$H/hermesc"
fi

npx expo prebuild --platform android --clean --no-install >/dev/null
# CMake from the OS with a ninja capped at 4 jobs (keeps memory use safe in this workspace).
mkdir -p /opt/android/cmake/bin
ln -sf /usr/bin/cmake /opt/android/cmake/bin/cmake
printf '#!/bin/sh\nexec /usr/bin/ninja -j2 "$@"\n' > /opt/android/cmake/bin/ninja; chmod +x /opt/android/cmake/bin/ninja
printf 'sdk.dir=%s\ncmake.dir=/opt/android/cmake\n' "$ANDROID_HOME" > android/local.properties
# Only ship 64/32-bit ARM phones (covers all modern Android devices).
sed -i "s/^reactNativeArchitectures=.*/reactNativeArchitectures=${BAKED_ABIS:-arm64-v8a}/" android/gradle.properties

# ARM64 host: tell the React Native plugin where the (qemu-wrapped) Hermes compiler is.
[ "$(uname -m)" = "aarch64" ] && sed -i "s#^\(\s*\)hermesCommand = .*%OS-BIN%.*#\1hermesCommand = \"$WORK/$H/hermesc\"#" android/app/build.gradle
cd android
TASKS=()
[ "$KIND" = "apk" ] || [ "$KIND" = "both" ] && TASKS+=(assembleRelease)
[ "$KIND" = "aab" ] || [ "$KIND" = "both" ] && TASKS+=(bundleRelease)
# Memory guard: this workspace has an 8 GB limit; stop the build before the workspace itself is evicted.
( while sleep 3; do m=$(awk '/^anon /{print $2}' /sys/fs/cgroup/memory.stat 2>/dev/null || echo 0); if [ "$m" -gt 6800000000 ]; then echo "MEMORY GUARD: stopping build at $m bytes"; pkill -f GradleWrapperMain; pkill -f "org.gradle"; pkill -f clang; break; fi; done ) &
GUARD=$!
trap 'kill $GUARD 2>/dev/null || true' EXIT
nice -n 10 ./gradlew "${TASKS[@]}" --no-daemon --console=plain --max-workers=2
