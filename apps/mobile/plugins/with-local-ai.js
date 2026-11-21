const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');
module.exports = (config) => {
  config = withAndroidManifest(config, (c) => {
    const application = c.modResults.manifest.application?.[0];
    if (application) {
      application.$['android:fullBackupContent'] = '@xml/pocket_backup_rules';
      application.$['android:dataExtractionRules'] = '@xml/pocket_data_extraction';
    }
    return c;
  });
  return withDangerousMod(config, [
    'android',
    async (c) => {
      const directory = path.join(c.modRequest.platformProjectRoot, 'app/src/main/res/xml');
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(
        path.join(directory, 'pocket_backup_rules.xml'),
        '<full-backup-content><exclude domain="file" path="pocket-models/" /><exclude domain="sharedpref" path="SecureStore" /></full-backup-content>',
      );
      fs.writeFileSync(
        path.join(directory, 'pocket_data_extraction.xml'),
        '<data-extraction-rules><cloud-backup><exclude domain="file" path="pocket-models/" /><exclude domain="sharedpref" path="SecureStore" /></cloud-backup><device-transfer><exclude domain="file" path="pocket-models/" /><exclude domain="sharedpref" path="SecureStore" /></device-transfer></data-extraction-rules>',
      );
      return c;
    },
  ]);
};
