const { execFileSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const { resolve } = require("node:path");

const SELF_HOSTED_BUNDLE_ID =
  process.env.BB_IOS_BUNDLE_ID ?? "com.tresnak.bbmobile";

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

function buildNumber() {
  return (
    process.env.BB_IOS_BUILD_NUMBER ?? git(["rev-list", "--count", "HEAD"], "1")
  );
}

function withSelfHostedIdentity(config, isDev) {
  const bundleId = isDev
    ? `${SELF_HOSTED_BUNDLE_ID}.dev`
    : SELF_HOSTED_BUNDLE_ID;
  return {
    ...config,
    version: appVersion(config.version),
    ios: {
      ...config.ios,
      bundleIdentifier: bundleId,
      buildNumber: buildNumber(),
      associatedDomains: WEBCREDENTIAL_DOMAINS.map(
        (domain) => `webcredentials:${domain}`,
      ),
      infoPlist: {
        ...config.ios.infoPlist,
        BBSourceCommit: git(["rev-parse", "--short", "HEAD"], "unknown"),
      },
    },
    android: { ...config.android, package: bundleId },
    plugins: [...config.plugins, "./plugins/with-ios-scene-lifecycle"],
  };
}

module.exports = ({ config }) => {
  const variant = process.env.BB_MOBILE_VARIANT ?? "production";
  if (variant !== "production" && variant !== "dev") {
    throw new Error("BB_MOBILE_VARIANT must be production or dev");
  }
  const isDev = variant === "dev";
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON
    ? resolve(process.env.GOOGLE_SERVICES_JSON)
    : resolve(__dirname, "google-services.json");
  if (
    !isDev &&
    process.env.GOOGLE_SERVICES_JSON &&
    !existsSync(googleServicesFile)
  ) {
    throw new Error(
      "GOOGLE_SERVICES_JSON must point to an existing Firebase configuration file",
    );
  }
  return withSelfHostedIdentity(
    {
      ...config,
      extra: { ...config.extra, bbMobileVariant: variant },
      ...(isDev
        ? {
            name: "bb dev",
            icon: "./assets/icon-dev.png",
            web: { ...config.web, favicon: "./assets/favicon-dev.png" },
            plugins: config.plugins.map((plugin) =>
              Array.isArray(plugin) && plugin[0] === "expo-splash-screen"
                ? [
                    plugin[0],
                    {
                      ...plugin[1],
                      image: "./assets/splash-logo-dev.png",
                      dark: {
                        ...plugin[1].dark,
                        image: "./assets/splash-logo-dev.png",
                      },
                    },
                  ]
                : plugin,
            ),
          }
        : {}),
      android: {
        ...config.android,
        ...(isDev
          ? {
              package: "app.getbb.mobile.dev",
              googleServicesFile: undefined,
              intentFilters: [],
              adaptiveIcon: {
                ...config.android.adaptiveIcon,
                foregroundImage: "./assets/android-icon-foreground-dev.png",
              },
            }
          : existsSync(googleServicesFile)
            ? { googleServicesFile }
            : {}),
      },
    },
    isDev,
  );
};
