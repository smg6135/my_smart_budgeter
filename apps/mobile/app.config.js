module.exports = ({ config }) => {
  const iosUrlScheme = process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME;
  if (iosUrlScheme)
    config.plugins = [
      ...config.plugins,
      ['@react-native-google-signin/google-signin', { iosUrlScheme }],
    ];
  if (process.env.EAS_BUILD_PROFILE === 'production') {
    if (process.env.EXPO_PUBLIC_AUTH_EMULATOR_URL)
      throw new Error('Remove the auth emulator from production');
    for (const key of [
      'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
      'EXPO_PUBLIC_FIREBASE_API_KEY',
      'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
      'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
      'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID',
      'EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME',
    ]) {
      if (!process.env[key]) throw new Error('Production configuration missing: ' + key);
    }
    for (const key of [
      'EXPO_PUBLIC_API_URL',
      'EXPO_PUBLIC_API_US_URL',
      'EXPO_PUBLIC_API_SG_URL',
    ]) {
      const value = process.env[key] || '';
      if (!value.startsWith('https://') || new URL(value).origin !== value)
        throw new Error('Configure HTTPS origin: ' + key);
    }
  }
  return config;
};
