var bodyParser      = require('body-parser'),
    compress        = require('compression'),
    config          = require('../config'),
    errors          = require('../errors'),
    express         = require('express'),
    hbs             = require('express-hbs'),
    logger          = require('morgan'),
	fs 				= require('fs'),
    path            = require('path'),
    routes          = require('../routes'),
    serveStatic     = require('express').static,
    storage         = require('../storage'),
    passport        = require('passport'),
    utils           = require('../utils'),
    sitemapHandler  = require('../data/xml/sitemap/handler'),
    multer          = require('multer'),
    tmpdir          = require('os').tmpdir,
    authStrategies   = require('./auth-strategies'),
    auth             = require('./auth'),
    cacheControl     = require('./cache-control'),
    checkSSL         = require('./check-ssl'),
    decideIsAdmin    = require('./decide-is-admin'),
    oauth            = require('./oauth'),
    redirectToSetup  = require('./redirect-to-setup'),
    serveSharedFile  = require('./serve-shared-file'),
    spamPrevention   = require('./spam-prevention'),
    prettyUrls       = require('./pretty-urls'),
    staticTheme      = require('./static-theme'),
    themeHandler     = require('./theme-handler'),
    maintenance      = require('./maintenance'),
    versionMatch     = require('./api/version-match'),
    cors             = require('./cors'),
    validation       = require('./validation'),
    redirects        = require('./redirects'),
    netjet           = require('netjet'),
    labs             = require('./labs'),
    helpers          = require('../helpers'),

	////////////////////////////////////////////  
	  settings         = require('../../../settings.json'),
	  minifyOutput = require('./minify'),
	//////////////////////////////////////////// 

	
	  monitor = require(config.paths.midPath + 'monitor/'),

    ClientPasswordStrategy  = require('passport-oauth2-client-password').Strategy,
    BearerStrategy          = require('passport-http-bearer').Strategy,

    middleware,
    setupMiddleware;

middleware = {
    upload: multer({dest: tmpdir()}),
    validation: validation,
    cacheControl: cacheControl,
    spamPrevention: spamPrevention,
    oauth: oauth,
    api: {
        authenticateClient: auth.authenticateClient,
        authenticateUser: auth.authenticateUser,
        requiresAuthorizedUser: auth.requiresAuthorizedUser,
        requiresAuthorizedUserPublicAPI: auth.requiresAuthorizedUserPublicAPI,
        errorHandler: errors.handleAPIError,
        cors: cors,
        prettyUrls: prettyUrls,
        labs: labs,
        versionMatch: versionMatch,
        maintenance: maintenance
    }
};

setupMiddleware = function setupMiddleware(blogApp) {
    var logging = config.logging,
        corePath = config.paths.corePath,
        adminApp = express(),
		globalsPath = config.paths.globalsPath,
        adminHbs = hbs.create();




    // ##Configuration
	if (settings.monitor === true) {
	// express monitor
	blogApp.use(monitor());
	}
    // enabled gzip compression by default
    if (config.server.compress !== false) {
        blogApp.use(compress());
    }

	if (settings.globals == true) {
	//globals
	blogApp.locals.globals = require(globalsPath);
	blogApp.locals.globals;
	}
    // ## View engine
    // set the view engine
    blogApp.set('view engine', 'hbs');

    // Create a hbs instance for admin and init view engine
    adminApp.set('view engine', 'hbs');
    adminApp.engine('hbs', adminHbs.express3({}));


/////////////////////////////////////////////////////
	if (settings.minifyOutput === true) {
	//minify html output
	blogApp.use(minifyOutput);
	}
//////////////////////////////////////////////////////


    // Load helpers
    helpers.loadCoreHelpers(adminHbs);

    // Initialize Auth Handlers & OAuth middleware
    passport.use(new ClientPasswordStrategy(authStrategies.clientPasswordStrategy));
    passport.use(new BearerStrategy(authStrategies.bearerStrategy));
    oauth.init();

    // Make sure 'req.secure' is valid for proxied requests
    // (X-Forwarded-Proto header will be checked, if present)
    blogApp.enable('trust proxy');

    // Logging configuration
    if (logging !== false) {
        if (blogApp.get('env') !== 'development') {
            blogApp.use(logger('combined', logging));
        } else {
            blogApp.use(logger('dev', logging));
        }
    }

    // Preload link headers
    if (config.preloadHeaders) {
        blogApp.use(netjet({
            cache: {
                max: config.preloadHeaders
            }
        }));
    }

    // you can extend Ghost with a custom redirects file
    // see https://github.com/TryGhost/Ghost/issues/7707
    redirects(blogApp);

    // Favicon
    blogApp.use(serveSharedFile('favicon.ico', 'image/x-icon', utils.ONE_DAY_S));

    // Ghost-Url
    blogApp.use(serveSharedFile('shared/ghost-url.js', 'application/javascript', utils.ONE_HOUR_S));
    blogApp.use(serveSharedFile('shared/ghost-url.min.js', 'application/javascript', utils.ONE_HOUR_S));

    // Static assets
    blogApp.use('/shared', serveStatic(
        path.join(corePath, '/shared'),
        {maxAge: utils.ONE_HOUR_MS, fallthrough: false}
    ));
    blogApp.use('/content/images', storage.getStorage().serve());
    blogApp.use('/public', serveStatic(
        path.join(corePath, '/built/public'),
        {maxAge: utils.ONE_YEAR_MS, fallthrough: false}
    ));

    // First determine whether we're serving admin or theme content
    blogApp.use(decideIsAdmin);
    blogApp.use(themeHandler.updateActiveTheme);
    blogApp.use(themeHandler.configHbsForContext);

    // Admin only config
    blogApp.use('/ghost', serveStatic(
        config.paths.clientAssets,
        {maxAge: utils.ONE_YEAR_MS}
    ));

    // Force SSL
    // NOTE: Importantly this is _after_ the check above for admin-theme static resources,
    //       which do not need HTTPS. In fact, if HTTPS is forced on them, then 404 page might
    //       not display properly when HTTPS is not available!
    blogApp.use(checkSSL);
    adminApp.set('views', config.paths.adminViews);

    // Theme only config
    blogApp.use(staticTheme());

    // setup middleware for internal apps
    // @TODO: refactor this to be a proper app middleware hook for internal & external apps
    config.internalApps.forEach(function (appName) {
        var app = require(path.join(config.paths.internalAppPath, appName));
        if (app.hasOwnProperty('setupMiddleware')) {
            app.setupMiddleware(blogApp);
        }
    });

    // Serve sitemap.xsl file
    blogApp.use(serveSharedFile('sitemap.xsl', 'text/xsl', utils.ONE_DAY_S));

    // Serve robots.txt if not found in theme
    blogApp.use(serveSharedFile('robots.txt', 'text/plain', utils.ONE_HOUR_S));

    // site map
    sitemapHandler(blogApp);

    // Body parsing
    blogApp.use(bodyParser.json({limit: '1mb'}));
    blogApp.use(bodyParser.urlencoded({extended: true, limit: '1mb'}));

    blogApp.use(passport.initialize());

    // ### Caching
    // Blog frontend is cacheable
    blogApp.use(cacheControl('public'));
    // Admin shouldn't be cached
    adminApp.use(cacheControl('private'));
    // API shouldn't be cached
    blogApp.use(routes.apiBaseUri, cacheControl('private'));

    // local data
    blogApp.use(themeHandler.ghostLocals);

    // ### Routing
    // Set up API routes
    blogApp.use(routes.apiBaseUri, routes.api(middleware));

    blogApp.use(prettyUrls);

    // Mount admin express app to /ghost and set up routes
    adminApp.use(redirectToSetup);
    adminApp.use(maintenance);
    adminApp.use(routes.admin());

    blogApp.use('/ghost', adminApp);

    // send 503 error page in case of maintenance
    blogApp.use(maintenance);

    // Set up Frontend routes (including private blogging routes)
    blogApp.use(routes.frontend());

    // ### Error handling
    // 404 Handler
    blogApp.use(errors.error404);

    // 500 Handler
    blogApp.use(errors.error500);

};

module.exports = setupMiddleware;
// Export middleware functions directly
module.exports.middleware = middleware;
