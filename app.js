const express = require('express');
const http = require('http');
const session = require('express-session');
const flash = require('connect-flash');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const { updateConfig, loadNoticeContent } = require('./common/config');
const config = require('./config');
const serveStatic = require('serve-static');
const path = require('path');
const enableRSS = require('./common/rss').enableRSS;
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const crypto = require('crypto');
const cors = require('cors');
const webRouter = require('./routes/web-router');
const apiRouterV1 = require('./routes/api-router.v1');
const app = express();
const server = http.createServer(app);
const { initializeDatabase } = require('./models');

app.use(
  rateLimit({
    windowMs: 30 * 1000,
    max: 30
  })
);
app.use(
  '/api/comment',
  rateLimit({
    windowMs: 60 * 1000,
    max: 5
  })
);
app.use(compression());
app.locals.systemName = config.systemName;
app.locals.systemVersion = config.systemVersion;
app.locals.config = {};
app.locals.config.theme = 'bulma';
app.locals.page = undefined;
app.locals.notice = 'No page has link "notice"!';
app.locals.loggedin = false;
app.locals.isAdmin = false;
app.locals.sitemap = undefined;
app.set('view engine', 'ejs');
app.set('trust proxy', true);
app.use(logger('dev'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));
app.use(cookieParser(crypto.randomBytes(64).toString('hex')));
app.use(
  session({
    resave: true,
    saveUninitialized: true,
    secret: crypto.randomBytes(64).toString('hex')
  })
);

app.use(flash());

(async () => {
  await initializeDatabase();
  // load configuration & update app.locals
  await updateConfig(app);
  await loadNoticeContent(app);
  enableRSS(app.locals.config);

  // Then we setup the app.
  app.use(
    serveStatic(path.join(__dirname, './public'), {
      maxAge: config.cacheMaxAge * 1000
    })
  );

  app.use('*', (req, res, next) => {
    if (req.session.user !== undefined) {
      res.locals.loggedin = true;
      res.locals.isAdmin = req.session.user.isAdmin;
    }
    next();
  });

  app.use('/', webRouter);
  app.use('/api', cors(), apiRouterV1);

  app.use(function(req, res, next) {
    if (!res.headersSent) {
      res.render('message', {
        title: ':{404 Not Found}',
        message: 'The page you requested does not exist, I am sorry for that.'
      });
    }
  });
})();

server.listen(config.port);

server.on('error', err => {
  console.error(
    `An error occurred on the server, please check if port ${config.port} is occupied.`
  );
  console.error(err.toString());
});

server.on('listening', () => {
  console.log(`Server listen on port: ${config.port}.`);
});

module.exports = app;
