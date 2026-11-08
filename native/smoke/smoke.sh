#!/usr/bin/env bash
# Runs the debug build on an Android emulator and checks that it starts, shows the app, restores its state file,
# and survives an Auto Backup round trip (backup, wipe, restore). Used by .github/workflows/android.yml.
# Usage: smoke.sh path/to/app-debug.apk
set -euo pipefail
APK="$1"
PKG=com.tompkinssoftwaresystems.witchcard
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="${SMOKE_OUT:-$HERE/out}"
mkdir -p "$OUT"

fail() { echo "FAIL  $1"; adb logcat -d > "$OUT/logcat.txt" || true; exit 1; }
ok() { echo "ok    $1"; }
in_front() { adb shell dumpsys activity activities 2>/dev/null | grep -q "ResumedActivity.*$PKG"; }
# The emulator's Google Play services die now and then and take the app with them, which no real phone does; start again if so.
launch() {
  local n
  for n in 1 2 3; do
    adb shell am start -W -n "$PKG/.MainActivity" > /dev/null
    sleep "${1:-10}"
    in_front && return 0
    echo "      (the app was not in front after start $n; starting it again)"
  done
  return 1
}
screen() { adb exec-out screencap -p > "$OUT/$1.png"; }
# The page text, read through the WebView's remote debugging (uiautomator cannot see inside a WebView).
ui_text() {
  local t
  if t="$(node "$HERE/pagetext.mjs" "$PKG" 2>/dev/null)" && [ -n "$t" ]; then echo "$t"; return; fi
  adb shell uiautomator dump /sdcard/ui.xml > /dev/null 2>&1 || true
  adb shell cat /sdcard/ui.xml 2>/dev/null || true
}
crashed() { adb logcat -d | grep -E "FATAL EXCEPTION" | grep -q . ; }

adb wait-for-device
adb shell settings put global window_animation_scale 0 || true
adb shell settings put global transition_animation_scale 0 || true
adb shell settings put global animator_duration_scale 0 || true
adb logcat -c || true

# 1. Fresh install: the app starts on the welcome note.
adb install -r "$APK"
launch 12
screen 01-fresh
crashed && fail "the app crashed on a fresh start"
ok "fresh start, no crash"
UI="$(ui_text)"; echo "$UI" > "$OUT/01-text.txt"
echo "$UI" | grep -qi "witch card\|math\|Let" || fail "the first screen does not show the welcome note (WebView did not render?)"
ok "the first screen renders"

# 2. The state file alone brings the wallet back (a restored phone has the file, not the WebView storage).
adb shell am force-stop "$PKG"
adb shell run-as "$PKG" mkdir -p files/witchcard
adb push "$HERE/state.json" /data/local/tmp/state.json > /dev/null
adb shell "run-as $PKG sh -c 'cat /data/local/tmp/state.json > files/witchcard/state.json'"
launch 12
screen 02-from-state-file
UI="$(ui_text)"; echo "$UI" > "$OUT/02-text.txt"
echo "$UI" | grep -q "Sapphire Reserve\|Freedom Unlimited\|Costco" || fail "the wallet from the state file is not on screen"
ok "the state file restores the wallet"

# 3. Auto Backup round trip through the local transport: back up, wipe the app, restore, launch.
adb shell bmgr enable true
adb shell bmgr transport com.android.localtransport/.LocalTransport || adb shell bmgr transport android/com.android.internal.backup.LocalTransport
adb shell bmgr backupnow "$PKG" | tee "$OUT/backupnow.txt"
grep -qi "Backup finished with result: Success" "$OUT/backupnow.txt" || fail "bmgr backupnow did not succeed"
ok "Auto Backup ran"
adb shell pm clear "$PKG" > /dev/null
TOKEN="$(adb shell bmgr list sets | awk 'NR==1 {print $1}')"; TOKEN="${TOKEN:-1}"
adb shell bmgr restore "$TOKEN" "$PKG" | tee "$OUT/restore.txt"
sleep 3
adb shell run-as "$PKG" ls files/witchcard/state.json > /dev/null 2>&1 || fail "the restore did not bring the state file back"
ok "the restore brought the state file back"
launch 12
screen 03-after-restore
UI="$(ui_text)"; echo "$UI" > "$OUT/03-text.txt"
echo "$UI" | grep -q "Sapphire Reserve\|Freedom Unlimited\|Costco" || fail "after the restore the wallet is not on screen"
ok "after the restore the app opens with its wallet"
crashed && fail "a crash was logged during the run"
adb logcat -d > "$OUT/logcat.txt" || true
echo
echo "ALL PASSED"
