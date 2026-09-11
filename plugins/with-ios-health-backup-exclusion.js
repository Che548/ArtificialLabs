const { withAppDelegate } = require('@expo/config-plugins');

const marker = '// Sfera: exclude local health storage before React starts.';
const anchor = '    let delegate = ReactNativeDelegate()';
const protection = `    ${marker}
    func healthStorageUnavailable() -> Bool {
      let controller = UIViewController()
      controller.view.backgroundColor = .systemBackground
      let label = UILabel()
      label.text = "Не удалось защитить локальное хранилище. Закройте и повторно откройте приложение. Медицинские записи не изменены."
      label.numberOfLines = 0
      label.textAlignment = .center
      label.translatesAutoresizingMaskIntoConstraints = false
      controller.view.addSubview(label)
      NSLayoutConstraint.activate([
        label.leadingAnchor.constraint(equalTo: controller.view.leadingAnchor, constant: 24),
        label.trailingAnchor.constraint(equalTo: controller.view.trailingAnchor, constant: -24),
        label.centerYAnchor.constraint(equalTo: controller.view.centerYAnchor)
      ])
      window = UIWindow(frame: UIScreen.main.bounds)
      window?.rootViewController = controller
      window?.makeKeyAndVisible()
      return false
    }
    // Documents contains SQLCipher (including WAL), scans and source lab files.
    // Exclude the parent so newly created/recreated children remain excluded.
    do {
      var documents = try FileManager.default.url(
        for: .documentDirectory, in: .userDomainMask,
        appropriateFor: nil, create: true)
      var values = URLResourceValues()
      values.isExcludedFromBackup = true
      try documents.setResourceValues(values)
      guard try documents.resourceValues(forKeys: [.isExcludedFromBackupKey])
        .isExcludedFromBackup == true else {
        return healthStorageUnavailable()
      }
    } catch {
      // Do not start health writes if the platform cannot protect storage.
      // No paths or medical data are logged.
      return healthStorageUnavailable()
    }

`;

function excludeHealthBackup(source) {
  if (!source.includes(anchor)) {
    throw new Error('Unsupported AppDelegate: cannot install health backup protection');
  }
  const existing = source.indexOf(`    ${marker}`);
  if (existing !== -1) {
    const end = source.indexOf(anchor, existing);
    if (end === -1) throw new Error('Unsupported health backup protection block');
    return source.slice(0, existing) + protection + source.slice(end);
  }
  return source.replace(anchor, protection + anchor);
}

module.exports = (config) => withAppDelegate(config, (mod) => {
  if (mod.modResults.language !== 'swift') {
    throw new Error('Health backup protection requires a Swift AppDelegate');
  }
  mod.modResults.contents = excludeHealthBackup(mod.modResults.contents);
  return mod;
});
module.exports.excludeHealthBackup = excludeHealthBackup;
