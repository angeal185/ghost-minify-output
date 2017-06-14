# ghost-minify-output
ghost middleware to minify compiled handlebars output and to disable beautify


## Instructions

### minification setup

- Open a console in ghost root dir [`/ghost`] and type:
````
npm install --save html-minifier
````

- Add the file `settings.json` to your root dir.
- Add the file `minify.js` to `ghost/core/server/middleware/`
- Open the file `index.js` located at`ghost/core/server/middleware/`
- Add thefollowing 2 lines of code to the list of required modules:
(refer to the `example/index.js` file included in this repo if you dont understand)
````
settings = require('../../../settings.json'),
minifyOutput = require('./minify'),
````
Find the following lines in of code in the same file:
````
adminApp.set('view engine', 'hbs');
adminApp.engine('hbs', adminHbs.express3({}));
````
- Below the above mentioned lines add the following 4 lines of code 

````
if (settings.minifyOutput === true) {
	//minify html output
	blogApp.use(minifyOutput);
}
````

You can now enable/disable minification in the `/ghost/settings.json` file.
- `true` = on
- `false` = off

### beautify setup

(refer to the `example/theme-handler.js` file included in this repo if you dont understand)
- Open the file `theme-handler.js` located at`ghost/core/server/middleware/`
- Find the following lines of code:
````
activateTheme: function activateTheme(blogApp, activeTheme) {
        var hbsOptions,
````
- Below the above mentioned lines add the following 2 lines of code 

````
settings = require('../../../settings.json'),
beautify = settings.beautify,
````
- Find the following lines of code:
````
hbsOptions = {
            partialsDir: [config.paths.helperTemplates],
            onCompile: function onCompile(exhbs, source) {
                return exhbs.handlebars.compile(source, {preventIndent: true});
            }
        };
````
- Replace the above mentioned lines with the following lines of code 
````
hbsOptions = {
            partialsDir: [config.paths.helperTemplates],
            onCompile: function onCompile(exhbs, source) {
                return exhbs.handlebars.compile(source, {preventIndent: true});
            },
			beautify

        };
````
You can now enable/disable beautify in the `/ghost/settings.json` file.
- `true` = on
- `false` = off

Done.
