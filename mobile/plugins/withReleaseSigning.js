// Release signing for Android: reads the upload key from Gradle properties (kept outside the repo).
const { withAppBuildGradle } = require('expo/config-plugins');

const SIGNING = `
        release {
            if (project.hasProperty('BAKED_UPLOAD_STORE_FILE')) {
                storeFile file(BAKED_UPLOAD_STORE_FILE)
                storePassword BAKED_UPLOAD_STORE_PASSWORD
                keyAlias BAKED_UPLOAD_KEY_ALIAS
                keyPassword BAKED_UPLOAD_KEY_PASSWORD
            }
        }`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let g = cfg.modResults.contents;
    if (!g.includes('BAKED_UPLOAD_STORE_FILE')) {
      g = g.replace(/signingConfigs\s*\{/, (m) => `${m}${SIGNING}`);
      g = g.replace(
        /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/,
        "$1signingConfig project.hasProperty('BAKED_UPLOAD_STORE_FILE') ? signingConfigs.release : signingConfigs.debug",
      );
    }
    cfg.modResults.contents = g;
    return cfg;
  });
};
