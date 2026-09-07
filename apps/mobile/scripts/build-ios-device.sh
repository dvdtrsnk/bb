#!/usr/bin/env bash
# Build the mobile app for a physical iPhone and install it, without EAS or
# Xcode's UI. Upstream ships iOS through TestFlight from the bb team's Apple
# account, which a self-hosted fork cannot use; this is the local equivalent.
#
#   ./scripts/build-ios-device.sh                 # prebuild, build, install, launch
#   ./scripts/build-ios-device.sh --clean         # regenerate ios/ from scratch first
#   ./scripts/build-ios-device.sh --no-install    # just produce the .app
#   BB_IOS_DEVICE="dvd.trsnk - iPhone" ./scripts/build-ios-device.sh
#
# Signing uses Xcode's automatic signing against BB_IOS_TEAM_ID, so the Apple
# account owning that team has to be signed in under Xcode › Settings ›
# Accounts. The App ID needs the Associated Domains capability; automatic
# signing adds it on the first build that requires it.
set -euo pipefail

TEAM_ID="${BB_IOS_TEAM_ID:-CX4M83TG32}"
CONFIGURATION="${BB_IOS_CONFIGURATION:-Release}"
MOBILE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DERIVED_DATA="$MOBILE_DIR/ios/build-device"

clean_prebuild=0
install_app=1
for arg in "$@"; do
  case "$arg" in
    --clean) clean_prebuild=1 ;;
    --no-install) install_app=0 ;;
    -h|--help) sed -n '2,17p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

cd "$MOBILE_DIR"
export LANG="${LANG:-en_US.UTF-8}"

echo "==> prebuild$([ "$clean_prebuild" = 1 ] && echo " (clean)")"
if [ "$clean_prebuild" = 1 ]; then
  pnpm exec expo prebuild --platform ios --clean
else
  pnpm exec expo prebuild --platform ios
fi

echo "==> xcodebuild ($CONFIGURATION, generic/platform=iOS)"
xcodebuild \
  -workspace ios/bb.xcworkspace \
  -scheme bb \
  -configuration "$CONFIGURATION" \
  -destination 'generic/platform=iOS' \
  -derivedDataPath "$DERIVED_DATA" \
  -allowProvisioningUpdates \
  DEVELOPMENT_TEAM="$TEAM_ID" \
  CODE_SIGN_STYLE=Automatic

APP_PATH="$DERIVED_DATA/Build/Products/$CONFIGURATION-iphoneos/bb.app"
[ -d "$APP_PATH" ] || { echo "build produced no app at $APP_PATH" >&2; exit 1; }

BUNDLE_ID="$(plutil -extract CFBundleIdentifier raw "$APP_PATH/Info.plist")"
VERSION="$(plutil -extract CFBundleShortVersionString raw "$APP_PATH/Info.plist")"
echo "==> built $BUNDLE_ID $VERSION"

if [ "$install_app" = 0 ]; then
  echo "$APP_PATH"
  exit 0
fi

# Without BB_IOS_DEVICE, pick the single paired physical device. Anything else
# is ambiguous, so ask rather than guess.
DEVICE="${BB_IOS_DEVICE:-}"
if [ -z "$DEVICE" ]; then
  mapfile -t devices < <(
    xcrun devicectl list devices 2>/dev/null |
      awk '/physical/ { for (i = 1; i <= NF; i++) if ($i ~ /^[0-9A-F]{8}-/) { print $i; break } }'
  )
  if [ "${#devices[@]}" -ne 1 ]; then
    echo "found ${#devices[@]} paired devices; set BB_IOS_DEVICE to pick one:" >&2
    xcrun devicectl list devices >&2
    exit 1
  fi
  DEVICE="${devices[0]}"
fi

echo "==> installing on $DEVICE"
xcrun devicectl device install app --device "$DEVICE" "$APP_PATH"

# Launching needs an unlocked phone; a locked one is not a build failure.
if ! xcrun devicectl device process launch --device "$DEVICE" --terminate-existing "$BUNDLE_ID"; then
  echo "installed, but could not launch (unlock the phone and open bb yourself)" >&2
fi
