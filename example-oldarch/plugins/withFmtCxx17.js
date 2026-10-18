// Xcode 26 clang fails to compile fmt (bundled with React Native 0.81) as C++20 because of
// consteval checks. Building React Native from source is required for the old architecture,
// so compile the fmt pod as C++17.
const {withPodfile} = require('expo/config-plugins');

const MARKER = '# withFmtCxx17';
const SNIPPET = `
    ${MARKER}
    installer.pods_project.targets.each do |target|
      next unless target.name == 'fmt'
      target.build_configurations.each do |config|
        config.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++17'
      end
    end`;

module.exports = config =>
  withPodfile(config, podfileConfig => {
    const contents = podfileConfig.modResults.contents;
    if (!contents.includes(MARKER)) {
      // Must run after react_native_post_install, which sets the C++ standard of all pods.
      podfileConfig.modResults.contents = contents.replace(
        /(react_native_post_install\([\s\S]*?\n\s*\))/,
        match => match + SNIPPET,
      );
    }
    return podfileConfig;
  });
