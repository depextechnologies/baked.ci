const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Skip native/test/docs folders inside node_modules so Metro's file watcher stays under the container's inotify limit.
config.resolver.blockList = [
  // Only top-level native folders of each package (JS sometimes lives in nested `ios/` dirs, e.g. react-native-screens).
  /node_modules\/(@[^/]+\/)?[^/]+\/(android|ios|cpp|ReactCommon|ReactApple|ReactAndroid|third-party|jni|docs|example|examples)\/.*/,
  /node_modules\/.*\/(__tests__|__mocks__)\/.*/,
  /node_modules\/\.bin\/.*/,
  /\/\.git\/.*/,
  /\/dist\/_expo\/.*/,
];

module.exports = config;
