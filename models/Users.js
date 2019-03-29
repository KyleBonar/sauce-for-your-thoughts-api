const bcrypt = require("bcrypt");
const moment = require("moment");

const DB = require("../db/db.js");

// Constants
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_TIME = 2 * 60 * 60; // 2 hour lock time in seconds
const SALT_WORK_FACTOR = 10;

exports.UsersTableStructure = `CREATE TABLE IF NOT EXISTS Users (
  UserID int NOT NULL AUTO_INCREMENT,
  Email varchar(50) NOT NULL UNIQUE,
  IsActive BOOLEAN DEFAULT '1',
  Password varchar(100) NOT NULL,
  DisplayName varchar(50) NOT NULL,
  Created bigint(20) unsigned DEFAULT NULL,
  ResetPasswordToken varchar(300),
  ResetPasswordExpires bigint(20) unsigned DEFAULT NULL,
  LoginAttempts int DEFAULT 0,
  LockedUntil bigint(20) unsigned DEFAULT NULL,
  PRIMARY KEY (UserID)
  ) ENGINE=InnoDB DEFAULT CHARSET=latin1;`;

exports.UsersTableRemove = `ALTER TABLE Sauces DROP FOREIGN KEY Sauces_Users_UserID;
  ALTER TABLE Reviews DROP FOREIGN KEY Reviews_Users_UserID;
  DROP TABLE Users;`;

// Return insert results
exports.Insert = async function({ email, password, displayName }) {
  // Create salt
  const salt = await bcrypt.genSalt(SALT_WORK_FACTOR);
  // Create hash
  const hash = await bcrypt.hash(password, salt);

  // Create insert object
  const values = {
    Email: email,
    Password: hash,
    DisplayName: displayName,
    Created: moment.unix()
  };

  const results = await DB.query("INSERT INTO Users SET ?", values);

  return results;
};

// Returns user
exports.FindByID = async function({ UserID }) {
  const rows = await DB.query(
    "SELECT Email, DisplayName, UserID FROM Users WHERE UserID = ? AND IsActive = 1",
    [UserID]
  );

  // Return user
  return rows[0];
};

exports.getAll = function(cb) {
  db.get().query("SELECT * FROM Users", function(err, rows) {
    if (err) return cb(err);
    cb(null, rows);
  });
};

exports.getAllByUser = function(userId, cb) {
  db.get().query("SELECT * FROM Users WHERE user_id = ?", userId, function(
    err,
    rows
  ) {
    if (err) return cb(err);
    cb(null, rows);
  });
};

exports.AuthenticateUser = async function({ email, password }) {
  const rows = await DB.query(
    "SELECT * FROM Users WHERE Email = ? AND IsActive = 1",
    [email]
  );

  // assign for easier use
  const user = rows[0];
  if (!rows || !user) {
    throw new Error("Invalid username or password.");
  }

  // See if account is locked so we can possibly skipping creating JWT
  // LockedUntil time will be larger if acc locked
  const date = moment().unix();
  if (user.LockedUntil && user.LockedUntil > date) {
    // acc locked if here
    // incriment login attempts
    await module.exports.IncLoginAttempts({
      UserID: user.UserID,
      LoginAttempts: user.LoginAttempts
    });

    // Finally throw error w/ vague message
    throw new Error(
      "This account has been locked. Please try again in a few hours."
    );
  }

  // Check if password is good
  const isMatch = await bcrypt.compare(password, user.Password);

  // Password is good
  if (isMatch) {
    // if there's no lock or failed attempts, just return the user
    if (user.LoginAttempts === 0 && !user.LockedUntil) {
      return user;
    }

    // reset attempts and lockedUntil timer
    await DB.query(
      "UPDATE Users SET LoginAttempts = ?, LockedUntil = ? WHERE  UserID = ?",
      [0, null, user.UserID]
    );

    return user;
  } else {
    // password is bad, so increment login attempts before responding
    await module.exports.IncLoginAttempts({
      UserID: user.UserID,
      LoginAttempts: user.LoginAttempts
    });

    // Finally throw error w/ vague message
    throw new Error("Invalid username or password.");
  }
};

exports.IncLoginAttempts = async function({ UserID, LoginAttempts }) {
  // Check if we need to lock the account or not
  if (LoginAttempts + 1 === MAX_LOGIN_ATTEMPTS) {
    // Create Unix Epoch time in seconds
    const date = moment().unix() + LOCK_TIME;

    return await DB.query(
      "Update Users SET LoginAttempts = ?, LockedUntil = ? WHERE UserID = ?",
      [MAX_LOGIN_ATTEMPTS, date, UserID]
    );
  }

  // Increase login attempts only
  return await DB.query(
    "Update Users SET LoginAttempts = LoginAttempts + 1 WHERE UserID = ?",
    [UserID]
  );
};
