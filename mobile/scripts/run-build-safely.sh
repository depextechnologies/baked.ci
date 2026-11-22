#!/usr/bin/env bash
# Runs a build with workspace services paused/unpaused around it (8 GB memory limit).
cd /app/mobile
supervisorctl stop expo-mobile >/dev/null
rm -f /tmp/baked-build-done; ( stopped=0; while sleep 5; do [ -f /tmp/baked-build-done ] && break
  a=$(awk '/^anon /{print $2}' /sys/fs/cgroup/memory.stat); if [ $stopped = 0 ] && [ "$a" -gt 5800000000 ]; then supervisorctl stop frontend >/dev/null; stopped=1; echo "paused frontend at $a"; fi; done ) &
[ -f /opt/android/.toolchain-ok ] || scripts/setup-android-toolchain.sh > /var/log/baked-toolchain.log 2>&1
scripts/build-android.sh "$@" > /var/log/baked-build.log 2>&1; echo "BUILD_EXIT $?" >> /var/log/baked-build.log; touch /tmp/baked-build-done
supervisorctl start frontend >/dev/null; supervisorctl start expo-mobile >/dev/null
