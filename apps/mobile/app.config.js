module.exports = ({ config }) => {
  if (process.env.POCKET_IOS_PROVISIONING_PROFILE) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(process.env.POCKET_IOS_PROVISIONING_PROFILE) ||
        !/^[A-Z0-9]{10}$/.test(process.env.POCKET_APPLE_TEAM || ''))
      throw new Error('Invalid direct iOS signing configuration');
    config.plugins = [...(config.plugins || []), ['./plugins/with-ios-release-signing', {
      team: process.env.POCKET_APPLE_TEAM, profile: process.env.POCKET_IOS_PROVISIONING_PROFILE,
    }]];
  }
  if (process.env.POCKET_IOS_BUILD_NUMBER) {
    if (!/^[1-9][0-9]{0,8}$/.test(process.env.POCKET_IOS_BUILD_NUMBER))
      throw new Error('POCKET_IOS_BUILD_NUMBER must be a positive integer of at most 9 digits');
    config.ios = { ...config.ios, buildNumber: process.env.POCKET_IOS_BUILD_NUMBER };
  }
  if (
    !(config.plugins || []).some(
      (plugin) => (Array.isArray(plugin) ? plugin[0] : plugin) === 'expo-status-bar',
    )
  )
    config.plugins = [...(config.plugins || []), 'expo-status-bar'];
  if (process.env.EAS_BUILD_PROFILE === 'production') {
    if (process.env.EXPO_PUBLIC_LOCAL_AI_SMOKE)
      throw new Error('Remove the synthetic AI smoke test from production');
  }
  return config;
};
