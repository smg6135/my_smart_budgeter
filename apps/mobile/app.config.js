module.exports = ({ config }) => {
  if (
    !(config.plugins || []).some(
      (plugin) => (Array.isArray(plugin) ? plugin[0] : plugin) === 'expo-status-bar',
    )
  )
    config.plugins = [...(config.plugins || []), 'expo-status-bar'];
  const iosUrlScheme = process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME;
  if (iosUrlScheme)
    config.plugins = [
      ...config.plugins,
      ['@react-native-google-signin/google-signin', { iosUrlScheme }],
    ];
  if (process.env.EAS_BUILD_PROFILE === 'production') {
    if (process.env.EXPO_PUBLIC_LOCAL_AI_SMOKE)
      throw new Error('Remove the synthetic AI smoke test from production');
    if (process.env.EXPO_PUBLIC_AUTH_EMULATOR_URL)
      throw new Error('Remove the auth emulator from production');
  }
  return config;
};
