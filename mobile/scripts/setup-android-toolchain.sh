#!/usr/bin/env bash
# One-time Android toolchain for this ARM64 Linux workspace (installs into /opt/android; re-run after a workspace reset).
set -euo pipefail
A=/opt/android; mkdir -p "$A"; cd "$A"
command -v java >/dev/null || { apt-get update -qq; DEBIAN_FRONTEND=noninteractive apt-get install -y -qq openjdk-17-jdk-headless; }
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq unzip qemu-user-static cmake ninja-build file rsync git >/dev/null
if [ ! -x sdk/cmdline-tools/latest/bin/sdkmanager ]; then
  curl -sSL -o cmd.zip https://dl.google.com/android/repository/commandlinetools-linux-13114758_latest.zip
  rm -rf cmdline-tmp && unzip -q cmd.zip -d cmdline-tmp && mkdir -p sdk/cmdline-tools && mv cmdline-tmp/cmdline-tools sdk/cmdline-tools/latest
fi
yes | sdk/cmdline-tools/latest/bin/sdkmanager --licenses >/dev/null || true
sdk/cmdline-tools/latest/bin/sdkmanager 'platforms;android-37.0' 'platforms;android-36' 'build-tools;37.0.0' >/dev/null
# Native ARM64 host build-tools + NDK 27.1 (community build from AOSP/LLVM sources): github.com/zhuwanhong/android-sdk-linux-arm64
REL=https://github.com/zhuwanhong/android-sdk-linux-arm64/releases/download/v1.0.0
[ -f sdk-arm.tgz ] || curl -sSL -o sdk-arm.tgz $REL/android-sdk-linux-arm64-36.0.0-ours.tar.gz
[ -f ndk-arm.tgz ] || curl -sSL -o ndk-arm.tgz $REL/android-ndk-27.1.12297006-linux-aarch64-ours.tar.gz
[ -d repo ] || git clone -q https://github.com/zhuwanhong/android-sdk-linux-arm64 repo
rm -rf sdk/build-tools/36.0.0
bash repo/tools/install.sh --yes --sdk-root "$A/sdk" --sdk-tgz "$A/sdk-arm.tgz" --ndk-tgz "$A/ndk-arm.tgz" --platform 36 || true
rm -rf armbt && mkdir armbt && tar xzf sdk-arm.tgz -C armbt ./build-tools ./platform-tools
for v in 36.0.0 37.0.0; do mkdir -p sdk/build-tools/$v; cp -a armbt/build-tools/36.0.0/. sdk/build-tools/$v/; done
cp -a armbt/platform-tools/. sdk/platform-tools/
sdk/build-tools/37.0.0/aapt2 version
sdk/ndk/27.1.12297006/toolchains/llvm/prebuilt/linux-aarch64/bin/clang --version | head -1
# Gradle settings (signing values come from /app/signing/upload-key.properties, never from the repo).
mkdir -p ~/.gradle
{ grep -v '^org.gradle.jvmargs' /app/signing/upload-key.properties
  echo "org.gradle.jvmargs=-Xmx2g -XX:MaxMetaspaceSize=768m"
  echo "org.gradle.workers.max=2"
  echo "kotlin.compiler.execution.strategy=in-process"
  echo "android.aapt2FromMavenOverride=$A/sdk/build-tools/37.0.0/aapt2"; } > ~/.gradle/gradle.properties
echo TOOLCHAIN_OK
