var db = require('../config');

var Github_User = db.Model.extend({
  tableName: 'github_users',

  initialize: function() {
  }
});

module.exports = Github_User;

