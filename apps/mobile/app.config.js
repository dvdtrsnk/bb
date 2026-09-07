// Self-hosted iOS identity for this fork.
//
// Expo reads `app.json` first and hands it to this function, so everything the
// fork changes lives here instead of as edits to `app.json` — upstream can move
// that file freely and a rebase stays conflict-free.
//
// What differs from upstream and why:
//   - bundle identifier: `app.getbb.mobile` belongs to the bb team's Apple
//     account, so a self-hosted build has to use its own.
//   - associated domains: upstream declares `applinks:getbb.app`, which cannot
//     be verified by another team. This build instead declares `webcredentials`
//     for the self-hosted domains, which is what makes iOS offer saved
//     passwords in the in-app Authentik login (see SELF-HOSTED-IOS.md).
//   - version: reports the bb version this app was built from, not the
//     hand-maintained upstream `version` field.
//   - the UIScene lifecycle plugin, without which the app crashes on launch
//     when built against the iOS 26/27 SDKs.
//
// Every value can be overridden by an environment variable, so the same tree
// builds for a different Apple team or a different domain without edits.

const { execFileSync } = require("node:child_process");

const BUNDLE_ID = process.env.BB_IOS_BUNDLE_ID ?? "com.tresnak.bbmobile";

const WEBCREDENTIAL_DOMAINS = (
  process.env.BB_IOS_WEBCREDENTIAL_DOMAINS ??
  "tresnak.cc,auth.tresnak.cc,bb.tresnak.cc"
)
  .split(",")
  .map((domain) => domain.trim())
  .filter(Boolean);

function appVersion(fallback) {
  const override = process.env.BB_IOS_VERSION;
  if (override) return override;
  try {
    // The bb version this checkout corresponds to; `bb-app` is the package the
    // server and the desktop app are published from.
    return require("../../packages/bb-app/package.json").version;
  } catch {
    return fallback;
  }
}

function git(args, fallback) {
  try {
    return execFileSync("git", args, {
      cwd: __dirname,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return fallback;
  }
}

// The marketing version only moves when bb cuts a release, so on nightlies it
// says nothing about which build a phone is running. The build number carries
// that instead: commit count is monotonic, and iOS refuses anything but digits
// and dots here, which rules out the nightly version string itself
// (`0.42.2-nightly.<run id>.1`). The exact commit rides along in Info.plist,
// where `plutil -extract BBSourceCommit raw` can read it back off a build.
function buildNumber() {
  return process.env.BB_IOS_BUILD_NUMBER ?? git(["rev-list", "--count", "HEAD"], "1");
}

module.exports = ({ config }) => {
  config.version = appVersion(config.version);

  config.ios = {
    ...config.ios,
    bundleIdentifier: BUNDLE_ID,
    buildNumber: buildNumber(),
    associatedDomains: WEBCREDENTIAL_DOMAINS.map(
      (domain) => `webcredentials:${domain}`,
    ),
    infoPlist: {
      ...config.ios?.infoPlist,
      BBSourceCommit: git(["rev-parse", "--short", "HEAD"], "unknown"),
    },
  };

  config.android = {
    ...config.android,
    package: BUNDLE_ID,
  };

  config.plugins = [
    ...(config.plugins ?? []),
    "./plugins/with-ios-scene-lifecycle",
  ];

  return config;
};
