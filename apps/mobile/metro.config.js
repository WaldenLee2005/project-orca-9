const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
// expo-sqlite's optional web bundle contains a WASM asset even though Orca's
// web repositories use AsyncStorage. Register it for production web exports.
if (!config.resolver.assetExts.includes("wasm")) config.resolver.assetExts.push("wasm");

module.exports = config;
