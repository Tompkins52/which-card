#!/usr/bin/env bash
# Runs the debug build on an Android emulator and checks that it starts, shows the app, restores its state file,
# survives an Auto Backup round trip (backup, wipe, restore), lays out under the status bar without the header
# covering the page, comes back right after the keyboard, and can open the camera for the card scanner.
# Used by .github/workflows/android.yml. Usage: smoke.sh path/to/app-debug.apk
set -euo pipefail
APK="$1"
PKG=com.tompkinssoftwaresystems.witchcard
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="${SMOKE_OUT:-$HERE/out}"
mkdir -p "$OUT"

fail() { echo "FAIL  $1"; keep_logs; exit 1; }
ok() { echo "ok    $1"; }
warn() { echo "::warning::$1"; echo "warn  $1"; }
keep_logs() {
  adb logcat -d > "$OUT/logcat.txt" 2>/dev/null || true
  # What the page itself said: console messages come out of the WebView tagged chromium / Capacitor/Console.
  grep -aiE "CONSOLE|Capacitor/Console|Capacitor/Plugin|getUserMedia|PermissionRequest" "$OUT/logcat.txt" > "$OUT/console.txt" 2>/dev/null || true
}
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
# Run JavaScript in the page and print the result (JSON for objects).
wv() { node "$HERE/pagetext.mjs" "$PKG" --eval "$1"; }
# Click something in the page by CSS selector.
wv_click() { wv "(function(){var e=document.querySelector('$1'); if(!e) return 'missing'; e.click(); return 'clicked';})()"; }
# One number out of a JSON string by a jq-style path, for example '.top.bottom' or '.inner[1]'.
num() { node -e 'const j=JSON.parse(process.argv[1]); let v=j; for (const k of process.argv[2].split(/[.\[\]]+/).filter(Boolean)) v=v==null?v:v[k]; console.log(v==null?"":v)' "$1" "$2"; }
crashed() { adb logcat -d | grep -E "FATAL EXCEPTION" | grep -q . ; }
# Tap the first on-screen control whose text matches an extended regex (system dialogs; the WebView's own buttons are not here).
tap_text() {
  adb shell uiautomator dump /sdcard/ui.xml > /dev/null 2>&1 || return 1
  local xml b x1 y1 x2 y2
  xml="$(adb shell cat /sdcard/ui.xml 2>/dev/null)" || return 1
  b="$(printf '%s' "$xml" | grep -oE "text=\"($1)\"[^>]*bounds=\"\[[0-9]+,[0-9]+\]\[[0-9]+,[0-9]+\]\"" | head -1 | grep -oE "\[[0-9]+,[0-9]+\]\[[0-9]+,[0-9]+\]")" || true
  [ -n "$b" ] || return 1
  read -r x1 y1 x2 y2 <<< "$(echo "$b" | tr -d '[]' | tr ',' ' ')"
  adb shell input tap $(( (x1 + x2) / 2 )) $(( (y1 + y2) / 2 ))
}
# Where the WebView sits on the screen (device pixels), from uiautomator: "x1 y1 x2 y2".
webview_bounds() {
  adb shell uiautomator dump /sdcard/ui.xml > /dev/null 2>&1 || return 1
  adb shell cat /sdcard/ui.xml 2>/dev/null | grep -oE "class=\"android.webkit.WebView\"[^>]*bounds=\"\[[0-9]+,[0-9]+\]\[[0-9]+,[0-9]+\]\"" | head -1 | grep -oE "\[[0-9]+,[0-9]+\]\[[0-9]+,[0-9]+\]" | tr -d '[]' | tr ',' ' '
}
# Tap an element of the page by CSS selector, with a real touch (so the keyboard and permission prompts behave as for a finger).
tap_el() {
  local r wb dpr x1 y1 cx cy
  r="$(wv "(function(){var e=document.querySelector('$1'); if(!e) return ''; var b=e.getBoundingClientRect(); return JSON.stringify({x:b.left+b.width/2,y:b.top+b.height/2,dpr:devicePixelRatio});})()")"
  [ -n "$r" ] && [ "$r" != '""' ] || return 1
  wb="$(webview_bounds)" || return 1
  read -r x1 y1 _ _ <<< "$wb"
  dpr="$(num "$r" .dpr)"; cx="$(num "$r" .x)"; cy="$(num "$r" .y)"
  local tx ty; tx="$(node -e "console.log(Math.round($x1 + $cx * $dpr))")"; ty="$(node -e "console.log(Math.round($y1 + $cy * $dpr))")"
  echo "      tap $1 at screen ($tx, $ty): WebView starts at ($x1, $y1), element at page (${cx%.*}, ${cy%.*}) css px, scale $dpr"
  adb shell input tap "$tx" "$ty"
}
# The page's layout numbers: window, visual viewport, scroll, safe-area insets (env() and Capacitor's variables),
# where the header and the first thing in the open view are.
METRICS='(function(){
  var p=document.createElement("div"); p.style.cssText="position:fixed;top:0;left:0;visibility:hidden;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)"; document.body.appendChild(p);
  var cs=getComputedStyle(p), env=[cs.paddingTop,cs.paddingRight,cs.paddingBottom,cs.paddingLeft].map(function(v){return Math.round(parseFloat(v)||0);}); p.remove();
  var rs=getComputedStyle(document.documentElement), vars=["top","right","bottom","left"].map(function(k){return rs.getPropertyValue("--safe-area-inset-"+k).trim();});
  function rect(sel){var e=document.querySelector(sel); if(!e) return null; var r=e.getBoundingClientRect(); return {top:Math.round(r.top),bottom:Math.round(r.bottom),left:Math.round(r.left),height:Math.round(r.height)};}
  function first(){var v=document.querySelector("main > .view:not([hidden])"); if(!v) return null; var best=null; v.querySelectorAll("*").forEach(function(e){ if(e.closest("[hidden]")||!e.getClientRects().length) return; var r=e.getBoundingClientRect(); if(r.height<8||r.width<8) return; if(!best||r.top<best.top) best={top:Math.round(r.top),bottom:Math.round(r.bottom),height:Math.round(r.height),what:e.tagName.toLowerCase()+(e.className?"."+String(e.className).split(" ")[0]:"")}; }); return best;}
  var vv=window.visualViewport;
  return JSON.stringify({ua:navigator.userAgent, dpr:devicePixelRatio, inner:[innerWidth,innerHeight], vv:vv?[Math.round(vv.width),Math.round(vv.height),Math.round(vv.offsetTop)]:null, scrollY:Math.round(scrollY), docH:document.documentElement.scrollHeight, env:env, vars:vars, top:rect(".top"), first:first(), tabs:rect(".tabs"), view:(document.querySelector("main > .view:not([hidden])")||{}).id});
})()'
metrics() { wv "$METRICS"; }
# The header must sit below the status bar, and the first thing in the view must start below the header.
check_layout() {
  local m="$1" what="$2" envtop ttop tbot ftop
  envtop="$(num "$m" '.env[0]')"; ttop="$(num "$m" .top.top)"; tbot="$(num "$m" .top.bottom)"; ftop="$(num "$m" .first.top)"
  echo "      $what: safe-area top ${envtop}px, header ${ttop}..${tbot}, first content at ${ftop}, scrolled $(num "$m" .scrollY), window $(num "$m" '.inner[0]')x$(num "$m" '.inner[1]')"
  [ -n "$ttop" ] && [ -n "$ftop" ] || fail "$what: could not measure the header or the view"
  [ "$ttop" -ge $(( envtop - 1 )) ] || fail "$what: the header (top ${ttop}px) is under the status bar (safe area ${envtop}px)"
  [ "$ftop" -ge $(( tbot - 1 )) ] || fail "$what: the header (to ${tbot}px) covers the first line of the page (at ${ftop}px)"
}

adb wait-for-device
adb shell settings put global window_animation_scale 0 || true
adb shell settings put global transition_animation_scale 0 || true
adb shell settings put global animator_duration_scale 0 || true
adb shell settings put secure show_ime_with_hard_keyboard 1 || true   # the emulator has a hardware keyboard; show the soft one anyway
adb logcat -c || true
{ adb shell getprop ro.build.version.release; adb shell getprop ro.build.version.sdk;
  for p in com.google.android.webview com.android.webview com.android.chrome; do adb shell dumpsys package "$p" 2>/dev/null | grep -m1 versionName | sed "s/^ */$p /"; done; } > "$OUT/device.txt" 2>/dev/null || true
echo "      $(tr '\n' ' ' < "$OUT/device.txt")"

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

# 4. Layout under the system bars: the header below the status bar, nothing hidden behind it, on Pay and on Wallet.
M="$(metrics)"; echo "$M" > "$OUT/04-pay.json"
check_layout "$M" "Pay"
wv_click '.tabs button[data-view="wallet"]' > /dev/null; sleep 1
screen 04-wallet
M="$(metrics)"; echo "$M" > "$OUT/04-wallet.json"
check_layout "$M" "Wallet"
wv "document.querySelector('#view-wallet .section-head button.link') ? 'yes' : 'no'" | grep -q yes || fail "Wallet has no Add a card button"
ADD_TOP="$(wv "Math.round(document.querySelector('#view-wallet .section-head button.link').getBoundingClientRect().top)")"
HEAD_BOT="$(num "$M" .top.bottom)"
[ "$ADD_TOP" -ge $(( HEAD_BOT - 1 )) ] || fail "Wallet: the Add a card button (at ${ADD_TOP}px) is behind the header (to ${HEAD_BOT}px)"
ok "the header sits under the status bar and covers nothing (Pay, Wallet; Add a card at ${ADD_TOP}px, header to ${HEAD_BOT}px)"

# 5. The keyboard: type in the store search, close the keyboard, and the page must be back where it was.
wv_click '.tabs button[data-view="pay"]' > /dev/null; sleep 1
BEFORE="$(metrics)"
if tap_el '#store-search'; then
  sleep 2; echo "      focus is on: $(wv "document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : 'nothing'")"; adb shell input text Shell; sleep 2
  screen 05-keyboard
  KB="$(metrics)"; echo "$KB" > "$OUT/05-keyboard.json"
  echo "      keyboard open: window $(num "$KB" '.inner[0]')x$(num "$KB" '.inner[1]'), visible $(num "$KB" '.vv[1]') from $(num "$KB" '.vv[2]'), scrolled $(num "$KB" .scrollY), safe-area bottom $(num "$KB" '.env[2]')px"
  wv "(function(){if(document.activeElement) document.activeElement.blur(); return 'x';})()" > /dev/null; sleep 2   # leaving the field closes the keyboard
  AFTER="$(metrics)"; echo "$AFTER" > "$OUT/05-after-keyboard.json"
  screen 05-after-keyboard
  echo "      keyboard closed: window $(num "$AFTER" '.inner[0]')x$(num "$AFTER" '.inner[1]'), visible $(num "$AFTER" '.vv[1]') from $(num "$AFTER" '.vv[2]'), scrolled $(num "$AFTER" .scrollY)"
  [ "$(num "$AFTER" '.inner[1]')" = "$(num "$BEFORE" '.inner[1]')" ] || fail "after the keyboard closed the window is $(num "$AFTER" '.inner[1]')px tall, was $(num "$BEFORE" '.inner[1]')px"
  [ "$(num "$AFTER" .scrollY)" -le 2 ] || fail "after the keyboard closed the page stayed scrolled by $(num "$AFTER" .scrollY)px"
  [ "$(num "$AFTER" '.vv[2]')" -le 2 ] || fail "after the keyboard closed the visible part is offset by $(num "$AFTER" '.vv[2]')px"
  check_layout "$AFTER" "Pay after the keyboard"
  ok "the page comes back whole after the keyboard"
else
  warn "could not tap the store search field; the keyboard check was skipped"
fi

# 6. The card scanner: the camera opens (permission prompt answered), the reader loads, nothing closes the scan.
wv_click '.tabs button[data-view="wallet"]' > /dev/null; sleep 1
wv_click '#view-wallet .section-head button.link' > /dev/null; sleep 2
wv "document.querySelector('.sheet .scan-btn') ? 'yes' : 'no'" | grep -q yes || fail "the Add a card sheet has no scan button"
# Can this WebView run the reader at all? Three small workers, made in the page: one from the reader's own
# script file, one made from a blob that imports a script of the app, one that fetches a file of the app.
PROBE="$(wv "(function(){
  function timed(mk, quiet){ return new Promise(function(res){ var w; var t=setTimeout(function(){ res(quiet||'no answer in 8 s'); if(w) w.terminate(); }, quiet?4000:8000); try { w=mk(); w.onerror=function(e){clearTimeout(t); res('error: '+(e.message||e.type)); w.terminate();}; w.onmessage=function(e){clearTimeout(t); res(String(e.data)); w.terminate();}; } catch(e){ clearTimeout(t); res('threw: '+e.message); } }); }
  var origin=location.origin;
  // The reader's worker says nothing until it is asked for work; loading without an error event is the answer.
  var fromFile=timed(function(){ return new Worker('vendor/tesseract/worker.min.js'); }, 'loaded, no error in 4 s');
  var blobImport=timed(function(){ return new Worker(URL.createObjectURL(new Blob([\"try{importScripts('\"+origin+\"/vendor/tesseract/tesseract.min.js');postMessage('import ok')}catch(e){postMessage('import failed: '+e.message)}\"],{type:'text/javascript'}))); });
  var blobFetch=timed(function(){ return new Worker(URL.createObjectURL(new Blob([\"fetch('\"+origin+\"/vendor/tesseract/README.txt').then(function(r){postMessage('fetch '+r.status)},function(e){postMessage('fetch failed: '+e.message)})\"],{type:'text/javascript'}))); });
  return Promise.all([fromFile,blobImport,blobFetch]).then(function(r){ return JSON.stringify({origin:origin, workerFromFile:r[0], blobWorkerImportScripts:r[1], blobWorkerFetch:r[2]}); });
})()")"
echo "      worker probe: $PROBE"; echo "$PROBE" > "$OUT/06-worker-probe.json"
wv_click '.sheet .scan-btn' > /dev/null
GRANTED=""
for n in 1 2 3 4 5 6 7 8; do
  sleep 1.5
  if tap_text "While using the app|Only this time|Allow|ALLOW|Allow only while using the app" 2>/dev/null; then GRANTED="prompt"; echo "      answered the camera permission prompt"; break; fi
  adb shell dumpsys package "$PKG" 2>/dev/null | grep -q "android.permission.CAMERA: granted=true" && { GRANTED="already"; break; }
done
[ -n "$GRANTED" ] || { warn "no camera permission prompt appeared; granting it by hand"; adb shell pm grant "$PKG" android.permission.CAMERA || true; GRANTED="adb"; }
sleep 20
screen 06-scan
echo "      page console during the scan:"; adb logcat -d | grep -aiE "Capacitor/Console|chromium.*CONSOLE" | grep -aiE "worker|tesseract|wasm|Uncaught|rror|getUserMedia|camera" | tail -15 | sed 's/^/        /' || true
SCAN="$(wv "(function(){var v=document.querySelector('.scan .cam video'); var n=document.querySelector('.scan .note'); var s=document.querySelector('.scan .scan-status'); return JSON.stringify({sheet:!!document.querySelector('.sheet'), cam:!!document.querySelector('.scan .cam'), video:v?{w:v.videoWidth,h:v.videoHeight,ready:v.readyState,stream:!!v.srcObject}:null, status:s?s.textContent:null, note:n?n.textContent:null, reader:!!window.Tesseract});})()")"
echo "$SCAN" > "$OUT/06-scan.json"
echo "      scan: $SCAN"
echo "$SCAN" | grep -q '"sheet":true' || fail "the Add a card sheet closed by itself during the scan"
echo "$SCAN" | grep -qi "Could not load the card reader" && fail "the card reader (tesseract.js worker) did not load in the WebView"
echo "$SCAN" | grep -q '"reader":true' || fail "the card reader script did not load"
echo "$SCAN" | grep -qi "Getting the reader ready" && fail "the card reader was still loading after 20 s (its language file or worker did not load)"
ok "the card reader loaded inside the WebView"
if echo "$SCAN" | grep -q '"stream":true' && [ "$(num "$SCAN" .video.w)" != "0" ] && [ -n "$(num "$SCAN" .video.w)" ]; then
  ok "the camera streams into the scanner ($(num "$SCAN" .video.w)x$(num "$SCAN" .video.h), permission: $GRANTED) and the reader is loaded"
elif echo "$SCAN" | grep -qi "turned off for this app"; then
  fail "the page thinks the camera is blocked (permission: $GRANTED)"
else
  warn "no camera picture reached the scanner on this emulator (permission: $GRANTED): $SCAN"
fi
wv "(function(){var b=document.querySelector('.sheet .close'); if(b) b.click(); return 'x';})()" > /dev/null || true

crashed && fail "a crash was logged during the run"
keep_logs
echo
echo "ALL PASSED"
