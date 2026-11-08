# Witch Card for Android

The Android app is the web app in a Capacitor shell: the same `index.html`, `app.css`, `app.js`, `engine.js`,
`data/`, `vendor/`, `fonts/`, `img/` and `icons/` from the repo root, packaged into the app, plus
`www/native.js` (built from `src/native.js`) which gives the app its native parts:

- the state file `files/witchcard/state.json`, written on every save and read at start, which Android backs
  up to the person's Google account and carries to a new phone (`res/xml/backup_rules.xml` and
  `data_extraction_rules.xml` back up only that file; the WebView's own storage is rebuilt from it)
- the back button (closes a sheet, goes back to Pay, then leaves the app), the system bars (edge to edge, icons
  light or dark to match the look) and the splash screen (the mascot on the night sky, up until the first screen
  is drawn)

Location and the camera need no plugin: the WebView's own `navigator.geolocation` and `getUserMedia` work once
the app holds the Android permissions (declared in `AndroidManifest.xml`; Capacitor asks the person the first
time the app uses them). The store lookup and the card scanner are the same code as on the web.

Nothing in the web app changes for the browser: `app.js` looks for `window.WCNative` and uses the normal paths
when it is not there. No service worker runs inside the app; its files are in the package.

## Build

GitHub Actions does it (`.github/workflows/android.yml`) on every push that touches the app: tests, assemble,
the native path check, `cap sync`, `gradlew bundleRelease`, then the debug build on an emulator (start, state
file, Auto Backup round trip). The bundle is in the run's artifacts. It is signed with the upload key when
these repository secrets exist (Settings, Secrets and variables, Actions):

| Secret | Value |
| --- | --- |
| `WITCHCARD_KEYSTORE_BASE64` | the upload keystore, base64 (`base64 -w0 witchcard-upload.jks`) |
| `WITCHCARD_KEYSTORE_PASSWORD` | its password |
| `WITCHCARD_KEY_ALIAS` | `upload` |
| `WITCHCARD_KEY_PASSWORD` | the same password |

Without the secrets the bundle is built unsigned; sign it by hand before Play Console:

```
jarsigner -keystore witchcard-upload.jks -storepass '...' -sigalg SHA256withRSA -digestalg SHA-256 app-release.aab upload
```

Play App Signing holds the real signing key; the upload key only proves a bundle came from us, and Play Console
can reset it if it is ever lost.

Version code: 100 plus the Actions run number; hand builds use 1 to 99. Version name: `1.0.0` or the
`versionName` input when the workflow is run by hand.

By hand (needs Node 22, Java 21 and the Android SDK with `ANDROID_HOME` set):

```
cd native && npm ci
python3 ../tools/assemble_native.py      # web app plus native.js into www/
npx cap sync android                     # into android/app/src/main/assets/public
cd android && ./gradlew bundleRelease -PversionCode=2 -PversionName=1.0.1
```

Icons and splash: `native/assets/` holds the sources (the mascot tile from `icons/mascot-1024.jpg`, the
flying mascot on the night sky for the splash); `npx capacitor-assets generate --android --iconBackgroundColor '#22113D'
--splashBackgroundColor '#22113D'` draws the Android sizes from them.

## Tests

- `python3 tests/native_check.py` (after assembling): the app with the shell stubbed, in Chromium.
- `native/smoke/smoke.sh app-debug.apk`: on an emulator or a phone with USB debugging.
