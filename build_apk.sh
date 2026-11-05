#!/bin/bash
# Antares Logbook - one-command rebuild
#
# What this does, every time you have a new index.html:
#   1. Copies the new file into www/index.html (if you pass one)
#   2. Installs the exact Capacitor versions from package-lock.json (first run only)
#   3. Syncs www/ into the native Android project (npx cap sync)
#   4. Builds the APK from the command line (no Android Studio needed)
#   5. Copies the finished APK to your Desktop (or $APK_OUT_DIR)
#
# USAGE (from the project folder):
#   ./build_apk.sh                         rebuild what's in www/index.html (test build)
#   ./build_apk.sh ~/Downloads/new.html    copy that file in first, then build
#   ./build_apk.sh --release [file]        signed release build (needs android/keystore.properties)
#
# Test builds are signed with this Mac's debug key; release builds with the
# vessel's release key. Phones can only update between builds signed with the
# SAME key. Switching a phone from one to the other means an uninstall, which
# wipes the logbook, so read "Switching to release builds" in
# BUILD_INSTRUCTIONS.md first.
#
# Needs: Node.js, JDK 21, Android SDK 36 with ANDROID_HOME set (see BUILD_INSTRUCTIONS.md).

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

BUILD_TYPE="debug"
SOURCE_FILE=""
for arg in "$@"; do
  case "$arg" in
    --release) BUILD_TYPE="release" ;;
    -h|--help) sed -n '2,23p' "$0"; exit 0 ;;
    *) SOURCE_FILE="$arg" ;;
  esac
done

fail(){ echo ""; echo "STOPPED: $1"; exit 1; }

# ---- checks, so a missing tool stops here with a clear message ----
command -v node >/dev/null 2>&1 || fail "Node.js isn't installed (https://nodejs.org, LTS)."
if [ -z "${JAVA_HOME:-}" ] && [ -x /usr/libexec/java_home ]; then
  JAVA_HOME="$(/usr/libexec/java_home -v 21 2>/dev/null || true)"
  [ -n "$JAVA_HOME" ] && export JAVA_HOME
fi
command -v java >/dev/null 2>&1 || [ -n "${JAVA_HOME:-}" ] || fail "JDK 21 isn't installed (Android Studio's bundled JDK works: set JAVA_HOME to it)."
if [ -z "${ANDROID_HOME:-}" ] && [ -d "$HOME/Library/Android/sdk" ]; then
  export ANDROID_HOME="$HOME/Library/Android/sdk"
fi
[ -n "${ANDROID_HOME:-}" ] || fail "ANDROID_HOME isn't set. Point it at the Android SDK (usually ~/Library/Android/sdk)."
if [ "$BUILD_TYPE" = "release" ] && [ ! -f "$PROJECT_DIR/android/keystore.properties" ]; then
  fail "a release build needs android/keystore.properties (see BUILD_INSTRUCTIONS.md, 'Release signing')."
fi

# ---- 1. new index.html ----
if [ -n "$SOURCE_FILE" ]; then
  [ -f "$SOURCE_FILE" ] || fail "can't find file: $SOURCE_FILE"
  # Passing www/index.html itself (or an identical file) is fine: skip the copy.
  if [ -f "$PROJECT_DIR/www/index.html" ] && cmp -s "$SOURCE_FILE" "$PROJECT_DIR/www/index.html"; then
    echo "www/index.html is already up to date — skipping copy."
  else
    echo "Copying $SOURCE_FILE -> www/index.html"
    cp "$SOURCE_FILE" "$PROJECT_DIR/www/index.html"
  fi
fi

# ---- 2. dependencies (exact versions from package-lock.json) ----
if [ ! -d "$PROJECT_DIR/node_modules/@capacitor/android" ]; then
  echo "Installing Capacitor (first run only)..."
  npm ci --no-audit --no-fund
fi

# ---- 3. sync ----
echo "Syncing into Android project..."
npx cap sync android

# ---- 4. build ----
echo "Building $BUILD_TYPE APK (this can take a minute or two)..."
cd "$PROJECT_DIR/android"
if [ "$BUILD_TYPE" = "release" ]; then
  ./gradlew assembleRelease
  APK_SRC="$PROJECT_DIR/android/app/build/outputs/apk/release/app-release.apk"
  VERSION_TAG="v1"   # company naming: v1_xx = final/release
  KIND="release"
else
  ./gradlew assembleDebug
  APK_SRC="$PROJECT_DIR/android/app/build/outputs/apk/debug/app-debug.apk"
  VERSION_TAG="v0"   # company naming: v0_xx = draft/test
  KIND="test"
fi
[ -f "$APK_SRC" ] || fail "the build finished but no APK was found at $APK_SRC"

# ---- 5. copy out, named yyyymmdd_antares_app_<kind>_vX_NN.apk ----
OUT_DIR="${APK_OUT_DIR:-$HOME/Desktop}"
mkdir -p "$OUT_DIR"
DAY=$(date +"%Y%m%d")
# Company naming: drafts count from v0_01, the first final is v1_00.
if [ "$BUILD_TYPE" = "release" ]; then N=0; else N=1; fi
while [ -e "$OUT_DIR/${DAY}_antares_app_${KIND}_${VERSION_TAG}_$(printf '%02d' "$N").apk" ]; do
  N=$((N + 1))
done
APK_DEST="$OUT_DIR/${DAY}_antares_app_${KIND}_${VERSION_TAG}_$(printf '%02d' "$N").apk"
cp "$APK_SRC" "$APK_DEST"

VERSION_CODE=$(sed -n 's/.*"versionCode": *\([0-9]*\).*/\1/p' "$(dirname "$APK_SRC")/output-metadata.json" | head -1)

echo ""
echo "Done! New $KIND APK (versionCode ${VERSION_CODE:-unknown}):"
echo "  $APK_DEST"
echo ""
echo "Before a phone installs it: make a backup in the app (Trips screen > Backup & restore)."
echo "Install it OVER the existing app. Never uninstall first; that wipes the logbook."
