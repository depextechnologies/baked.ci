module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    versionCode: Number(process.env.BAKED_ANDROID_VERSION_CODE || 2),
    config: {
      ...(config.android?.config || {}),
      googleMaps: { apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY },
    },
  },
  plugins: [...(config.plugins || []), './plugins/withReleaseSigning', './plugins/withProguardKeeps'],
  experiments: {
    ...config.experiments,
    ...(process.env.EXPO_WEB_BASE_URL ? { baseUrl: process.env.EXPO_WEB_BASE_URL } : {}),
  },
});
