import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "ClinRx",
  slug: "clinrx",
  version: "0.1.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  scheme: "clinrx",
  userInterfaceStyle: "light",
  ios: {
    bundleIdentifier: "ca.clinrx.app",
    supportsTablet: true,
  },
  android: {
    package: "ca.clinrx.app",
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    bundler: "metro",
    favicon: "./assets/favicon.png",
  },
  plugins: ["expo-sqlite"],
};

export default config;
