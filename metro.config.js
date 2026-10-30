// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// expo-sqlite na web usa WebAssembly
config.resolver.assetExts.push('wasm');
// Cabeçalhos necessários para o SQLite web (SharedArrayBuffer) no servidor de desenvolvimento
config.server.enhanceMiddleware = (middleware) => (req, res, next) => {
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  middleware(req, res, next);
};
module.exports = config;
