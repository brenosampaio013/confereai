// Estende o app.json. EXPO_BASE_URL define o caminho do site na web
// (ex.: "/confereai" no GitHub Pages); vazio no desenvolvimento e nos apps nativos.
module.exports = ({ config }) => ({
  ...config,
  experiments: {
    ...config.experiments,
    baseUrl: process.env.EXPO_BASE_URL || '',
  },
});
