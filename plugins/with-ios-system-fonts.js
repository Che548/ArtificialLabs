const { withInfoPlist, withXcodeProject } = require('@expo/config-plugins');

module.exports = function withIosSystemFonts(config) {
  config = withInfoPlist(config, (mod) => {
    mod.modResults.UIAppFonts = (mod.modResults.UIAppFonts ?? []).filter(
      (name) => !/^(SF-Pro-Display-.*|Yaro-Rg-Regular)\.otf$/.test(name),
    );
    return mod;
  });
  return withXcodeProject(config, (mod) => {
    const project = mod.modResults;
    project.removeResourceFile('../assets/fonts/Yaro-Rg-Regular.otf');
    for (const weight of ['Regular', 'Medium', 'Semibold', 'Bold']) {
      project.removeResourceFile(`../assets/fonts/SF-Pro-Display-${weight}.otf`);
    }
    return mod;
  });
};
