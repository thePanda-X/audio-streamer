const { withAndroidManifest } = require("expo/config-plugins");

module.exports = function (config) {
  config = withAndroidManifest(config, async (config) => {
    const mainActivity = config.modResults.manifest.application[0].activity.find(
      (a) => a.$["android:name"] === ".MainActivity"
    );

    if (mainActivity && !mainActivity.$["android:networkSecurityConfig"]) {
      mainActivity.$["android:networkSecurityConfig"] = "@xml/network_security_config";
    }

    return config;
  });

  return config;
};