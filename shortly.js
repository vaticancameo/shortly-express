var express = require('express');
var util = require('./lib/utility');
var partials = require('express-partials');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var session = require('express-session');
var bcrypt = require('bcrypt-nodejs');

var db = require('./app/config');
var Users = require('./app/collections/users');
var User = require('./app/models/user');
var Links = require('./app/collections/links');
var Link = require('./app/models/link');
var Click = require('./app/models/click');

var Github_User = require('./app/models/github-user');
var Github_Users = require('./app/collections/github-users');

var passport = require('passport');
var GitHubStrategy = require('passport-github').Strategy;


var app = express();
app.use(cookieParser());
app.use(passport.initialize());
app.use(passport.session());

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(partials());
// Parse JSON (uniform resource locators)
app.use(bodyParser.json());
// Parse forms (signup/login)
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname + '/public'));
app.use(session({
  secret: 'secret',
  resave: false,
  saveUninitialized: true
}));

passport.serializeUser(function(user, done) {
  done(null, user);
});

passport.deserializeUser(function(obj, done) {
  done(null, obj);
});

passport.use(new GitHubStrategy({
    clientID: '757af777b4713f2ca962',
    clientSecret: '7cc20aab38af01d2248bf8464a8d2aa0916a7e80',
    callbackURL: "http://shortlyurl.herokuapp.com/auth/github/callback"
  },
  function(accessToken, refreshToken, profile, done) {
    new Github_User({githubId: profile.id}).fetch().then(function(user) {
      if (user) {
        return done (null, user);
      } else { 
        var github_user = new Github_User({
          githubId: profile.id
        });
         
        github_user.save().then(function(newUser) {
          Github_Users.add(newUser);
          return done (null, newUser);
        });
        
      }
    });
  }
));

app.get('/auth/github',
  passport.authenticate('github'));

app.get('/auth/github/callback', 
  passport.authenticate('github', { failureRedirect: '/login' }),
  function(req, res) {
    // Successful authentication, redirect home.
    req.session.isAuthenticated = true;
    res.redirect('/');
  });

// req.session.isAuthenticated
app.get('/', 
function(req, res) {
  if (!req.session.isAuthenticated) {
    res.redirect('/login');
  } else {
    res.render('index');
  }
});

var renderLogin = function (res, message) {
  res.render('login', message);
};

app.get('/login',
function(req, res) {
  if (req.session.isAuthenticated) {
    res.writeHead(302, {location: '/'});
    res.end() ;
  } else {
    res.render('login', {message: ''});
  }
});

app.post('/login', 
function (req, res) {
  var p = req.body.password;
  new User({username: req.body.username}).fetch().then(function(user) {
    if (user) {
      bcrypt.compare(p, user.attributes.password, function (err, result) {
        if (result) {
          req.session.isAuthenticated = true;
          res.redirect('/');
        } else {
          var message = {message: '<div class="alert alert-danger">Password is incorrect!</div>'};
          renderLogin(res, message);
        }
      });
    } else {
      var message = {message: '<div class="alert alert-danger">Username does not exist!</div>'};
      renderLogin(res, message);
      // res.redirect('/login');
    }
  });
});

app.get('/signup', 
function(req, res) {
  res.render('signup', {message: ''});
});

app.post('/signup', 
function(req, res) {
  new User({ username: req.body.username}).fetch().then(function(found) {
    if (found) {
      var message = {message: '<div class="alert alert-danger">Username already exists!</div>'};
      res.render('signup', message);
    } else {
      bcrypt.hash(req.body.password, null, null, function (err, hash) {
        var user = new User({
          username: req.body.username,
          password: hash
        });
       
        user.save().then(function(newUser) {
          Users.add(newUser);
          req.session.isAuthenticated = true;
          res.redirect('/');
        });
      });
    }
  });
});

app.get('/create', 
function(req, res) {
  if(!req.session.isAuthenticated) {
    res.redirect('/login');
  } else {
    res.render('index');
  }
});

app.get('/links', 
function(req, res) {
  if (!req.session.isAuthenticated) {
    res.redirect('/login');
  } else {
    Links.reset().fetch().then(function(links) {
      res.send(200, links.models);
    });    
  }
});

app.post('/links', 
function(req, res) {
  var uri = req.body.url;

  if (!util.isValidUrl(uri)) {
    console.log('Not a valid url: ', uri);
    return res.send(404);
  }

  new Link({ url: uri }).fetch().then(function(found) {
    if (found) {
      res.send(200, found.attributes);
    } else {
      util.getUrlTitle(uri, function(err, title) {
        if (err) {
          console.log('Error reading URL heading: ', err);
          return res.send(404);
        }

        var link = new Link({
          url: uri,
          title: title,
          base_url: req.headers.origin
        });

        link.save().then(function(newLink) {
          Links.add(newLink);
          res.send(200, newLink);
        });
      });
    }
  });
});

app.get('/logout', 
function (req, res) {
  req.session.destroy();
  res.redirect('/login');
});

/************************************************************/
// Write your authentication routes here
/************************************************************/



/************************************************************/
// Handle the wildcard route last - if all other routes fail
// assume the route is a short code and try and handle it here.
// If the short-code doesn't exist, send the user to '/'
/************************************************************/

app.get('/*', function(req, res) {
  new Link({ code: req.params[0] }).fetch().then(function(link) {
    if (!link) {
      res.redirect('/');
    } else {
      var click = new Click({
        link_id: link.get('id')
      });

      click.save().then(function() {
        db.knex('urls')
          .where('code', '=', link.get('code'))
          .update({
            visits: link.get('visits') + 1,
          }).then(function() {
            return res.redirect(link.get('url'));
          });
      });
    }
  });
});

var port = process.env.PORT || 4568

console.log('Shortly is listening on ' + port);
app.listen(port);
