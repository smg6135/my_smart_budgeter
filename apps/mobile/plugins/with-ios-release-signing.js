const { withXcodeProject } = require('expo/config-plugins');

module.exports = (config, { team, profile }) => withXcodeProject(config, (result) => {
  const project = result.modResults;
  const objects = project.hash.project.objects;
  for (const target of Object.values(objects.PBXNativeTarget || {})) {
    if (!target || typeof target !== 'object' || target.productType !== '"com.apple.product-type.application"') continue;
    const list = objects.XCConfigurationList[target.buildConfigurationList];
    for (const reference of list.buildConfigurations) {
      const build = objects.XCBuildConfiguration[reference.value];
      if (build.name !== 'Release') continue;
      Object.assign(build.buildSettings, {
        DEVELOPMENT_TEAM: team,
        CODE_SIGN_STYLE: 'Manual',
        CODE_SIGN_IDENTITY: '"Apple Distribution"',
        PROVISIONING_PROFILE_SPECIFIER: `"${profile}"`,
      });
    }
  }
  return result;
});
