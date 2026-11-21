const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Skip native/test/docs folders inside node_modules so Metro's file watcher stays under the container's inotify limit.
config.resolver.blockList = [
  /node_modules\/.*\/(android|ios|__tests__|__mocks__|cpp|ReactCommon|ReactApple|ReactAndroid|third-party|jni|docs|\.bin)\/.*/,
  /\/\.git\/.*/,
  /\/dist\/_expo\/.*/,
];

module.exports = config;
