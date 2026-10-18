// Resolves react-native-reorderable-list from the fork's source and forces every
// other dependency (react-native, reanimated, gesture-handler) to come from this
// app's node_modules, never from the library root which has different versions.
const path = require('path');
const {getDefaultConfig} = require('expo/metro-config');

const projectRoot = __dirname;
const libraryRoot = path.resolve(projectRoot, '..');

const escape = value => value.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [path.join(libraryRoot, 'src')];
config.resolver.nodeModulesPaths = [path.join(projectRoot, 'node_modules')];
// Files in ../src would otherwise resolve dependencies from the library root first.
config.resolver.blockList = [
  new RegExp(`^${escape(path.join(libraryRoot, 'node_modules'))}/.*`),
  new RegExp(`^${escape(path.join(libraryRoot, 'example'))}/.*`),
];
config.resolver.extraNodeModules = {
  'react-native-reorderable-list': path.join(libraryRoot, 'src'),
};

module.exports = config;
