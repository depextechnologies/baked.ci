// R8 keep rules for libraries that load generated classes by reflection (Room/WorkManager crash on startup otherwise).
const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

const RULES = `
# --- Baked: keep Room / WorkManager generated classes ---
-keep class * extends androidx.room.RoomDatabase { <init>(); }
-keep class **_Impl { <init>(); }
-keep class androidx.work.impl.** { *; }
-keep class androidx.startup.** { *; }
-keep class * implements androidx.startup.Initializer { <init>(); }
-dontwarn androidx.work.**
`;

module.exports = function withProguardKeeps(config) {
  return withDangerousMod(config, ['android', async (cfg) => {
    const file = path.join(cfg.modRequest.platformProjectRoot, 'app', 'proguard-rules.pro');
    const cur = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    if (!cur.includes('Baked: keep Room')) fs.writeFileSync(file, cur + RULES);
    return cfg;
  }]);
};
