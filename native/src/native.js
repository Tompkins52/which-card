/* Witch Card native glue. Bundled by esbuild into www/native.js and loaded before the app scripts in the
   Android (and later iOS) build. It sets window.WCNative, which app.js uses when present: the state file
   that Android backs up and carries to a new phone, the back button, the system bars and the splash
   screen. Location and the camera need nothing here: the WebView's own navigator.geolocation and
   getUserMedia work once the app holds the Android permissions, which Capacitor asks for on first use.
   In a browser this file does nothing. */
import { Capacitor, SystemBars, SystemBarsStyle } from "@capacitor/core";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { App } from "@capacitor/app";
import { SplashScreen } from "@capacitor/splash-screen";

var STATE_PATH = "witchcard/state.json";

async function saveState(text) {
  await Filesystem.writeFile({ path: STATE_PATH, data: text, directory: Directory.Data, encoding: Encoding.UTF8, recursive: true });
}

async function loadState() {
  try {
    var r = await Filesystem.readFile({ path: STATE_PATH, directory: Directory.Data, encoding: Encoding.UTF8 });
    return typeof r.data === "string" ? r.data : null;
  } catch (e) { return null; }
}

/* Edge to edge: the bars are transparent over the app's own header and tab bar, so only the icon color changes. */
async function setDark(dark) {
  try { await SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }); } catch (e) { }
}

var backHandlers = [];
function onBack(fn) { backHandlers.push(fn); }

var splashHidden = false;
function ready() {
  if (splashHidden) return;
  splashHidden = true;
  SplashScreen.hide({ fadeOutDuration: 150 }).catch(function () { });
}

if (Capacitor.isNativePlatform()) {
  App.addListener("backButton", function () {
    if (backHandlers.length) backHandlers[backHandlers.length - 1]();
    else App.minimizeApp();
  });
  /* Never leave the splash up if the page fails early. */
  setTimeout(ready, 4000);
  window.WCNative = {
    platform: Capacitor.getPlatform(),
    saveState: saveState,
    loadState: loadState,
    setDark: setDark,
    onBack: onBack,
    minimize: function () { return App.minimizeApp(); },
    ready: ready,
    info: function () { return App.getInfo(); }
  };
}
