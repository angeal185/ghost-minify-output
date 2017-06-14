/* to be placed at ghost/core/server/middleware/ */
var Minifier, exports;

Minifier = require('html-minifier');

module.exports = exports = function(req, res, next) {
  res.oldRender = res.render;
  res.render = function(view, options) {
    this.oldRender(view, options, function(err, html) {
      if (err) {
        throw err;
      }
      html = Minifier.minify(html, {
        caseSensitive: false,
        removeComments: true,
        removeCommentsFromCDATA: true,
        collapseWhitespace: true,
        collapseInlineTagWhitespace: true,
        collapseBooleanAttributes: true,
        removeAttributeQuotes: false,
        removeEmptyAttributes: true,
        minifyJS: true,
        minifyCSS: true,
        removeScriptTypeAttributes: false,
        removeStyleLinkTypeAttributes: false,
        sortClassName: false,
        sortAttributes: false,
		processScripts:[ 'application/ld+json' ]
      });
      res.send(html);
    });
  };
  next();
};
