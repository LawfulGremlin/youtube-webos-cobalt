module.exports = (api) => {
  api.cache.never();

  return {
    // Fixes "TypeError: __webpack_require__(...) is not a function"
    // https://github.com/webpack/webpack/issues/9379#issuecomment-509628205
    // https://babeljs.io/docs/en/options#sourcetype
    sourceType: 'unambiguous',
    plugins: [
      [
        '@babel/plugin-transform-runtime',
        {
          regenerator: false,
          helpers: true,
          version: require('./package.json').dependencies['@babel/runtime']
        }
      ]
    ],
    presets: [
      [
        '@babel/preset-env',
        {
          bugfixes: false,
          modules: false,
          targets: {
            chrome: '63'
          }
        }
      ]
    ]
  };
};
