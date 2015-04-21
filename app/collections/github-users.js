var db = require('../config');
var Github_User = require('../models/github-user');

var Github_Users = new db.Collection();

Github_Users.model = Github_User;

module.exports = Github_Users;