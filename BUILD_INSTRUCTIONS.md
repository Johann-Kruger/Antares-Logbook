# Antares Logbook — building the Android app

This folder is a ready-to-build Android app that wraps the Antares tuna logbook as a real, installable app (not a web page). Once built into a `.apk`,
it runs fully offline, with normal native GPS access — no browser, no
account, no internet connection needed to use it.

## Before you start: the logbook lives on the phone

The logbook are stored only inside the app on the phone. **Uninstalling
the app deletes them.** So:

- Always install a new APK **over** the existing app. Never uninstall first.
- Make a backup before installing anything: menu (⋮) → **Backup & restore**
  → **Back up all data now**, and save the file to a safe place (Google Drive, email to yourself). The file holds crew ID numbers, so keep it out of group chats.
- A phone can only update between APKs signed with the **same key**. See
  [Release signing](#release-signing) before switching key.

## What you need (one-time setup)

1. **Android Studio** (free): https://developer.android.com/studio. Open it once
   and let it install the Android SDK. In *Settings → Languages & Frameworks →
   Android SDK*, make sure **Android 16 (API 36)** is installed.
2. **JDK 21.** Android Studio's bundled JDK works.
3. **Node.js** LTS: https://nodejs.org.
4. Tell the command line where the SDK is. Add this to `~/.zshrc` on a Mac, then
   open a new Terminal:
   ```
   export ANDROID_HOME="$HOME/Library/Android/sdk"
   export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
   ```
   (`build_apk.sh` also looks in those places itself if they aren't set.)

## Building (one command)

From the project folder:

```
./build_apk.sh                          # test build of www/index.html
./build_apk.sh ~/Downloads/new.html     # copy a new index.html in first, then build
./build_apk.sh --release                # signed release build (see Release signing)
```

The first run installs the exact Capacitor versions from `package-lock.json`
(`npm ci`). The script stops with a plain message if a tool is missing. The APK
is copied to your Desktop (set `APK_OUT_DIR` to change that), named to the
naming convention:

- `yyyymmdd_antares_app_test_v0_NN.apk` (from v0_01): test build (debug key)
- `yyyymmdd_antares_app_release_v1_NN.apk` (from v1_00): release build (release key)

Every build gets a higher Android `versionCode` automatically (minutes since
1 Jan 2026), so a newer APK always installs over an older one. To set it by
hand: `cd android && ./gradlew assembleRelease -PversionCode=<n>`.

If `./build_apk.sh` says `permission denied`, run `chmod +x build_apk.sh` once.

### Manual build (if the script won't run)

```
npm ci
npx cap sync android
cd android && ./gradlew assembleDebug
```

The APK is at `android/app/build/outputs/apk/debug/app-debug.apk`.

## Installing on a phone

1. Make a backup in the app first (see the top of this page).
2. Copy the APK to the phone (USB, email or a Google Drive link).
3. Tap the file. Android asks once to allow installs from that app; allow it.
4. Choose **Update** / install over the existing app. If Android says the app
   "conflicts with an existing package" or "isn't installed", **stop**. The
   APK was signed with a different key. Don't uninstall; see below.

## Release signing

Test builds are signed with the debug key of whichever Mac built them, so a
build from a different Mac can't update the phone. A release key fixes that: one
key, kept safe, used for every build from now on.

### 1. Create the key (once, on the build Mac)

```
keytool -genkeypair -v -keystore ~/antares-keys/antares-release.jks \
  -alias antares -keyalg RSA -keysize 4096 -validity 10000
```

Choose strong passwords. **Back up the `.jks` file and both passwords** to a
safe place off the Mac. If the key is lost, the phones can
never be updated again without wiping them.

### 2. Point the build at it

Create `android/keystore.properties`. It's git-ignored and must never be committed.

```
storeFile=/Users/<you>/antares-keys/antares-release.jks
storePassword=<store password>
keyAlias=antares
keyPassword=<key password>
```

Then `./build_apk.sh --release`.

### 3. Switching a phone from test builds to release builds (one time)

The phones currently run debug-signed builds. Moving to the release key needs
one uninstall, which wipes the logbook, so the data goes across using the app's
own backup:

1. On the phone, in the **current** app: Backup & restore → Back up all data now.
   Save the file to Google Drive or email **and** check it's there and isn't empty.
2. Uninstall the old app.
3. Install the release APK.
4. Open it → Backup & restore → **Restore from a backup file** → pick that file.
5. Check the trips, stops and weights are all there before going to sea.

Do this on shore, on a quiet day, one phone at a time. From then on, always use
`--release` builds.

## Project layout

- `www/index.html`: the whole app (one self-contained, offline file)
- `android/`: the native Android/Capacitor wrapper
- `capacitor.config.ts`: app name and ID (`com.antares.logbook`; never change it)
- `build_apk.sh`: one-command build (see above)
- `tests/`: browser tests for the app (`tests/run.sh`, see `tests/README.md`)
