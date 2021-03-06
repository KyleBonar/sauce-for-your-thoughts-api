const validator = require("validator");
const Users = require("../models/Users");
const {
  Utility,
  JWT_AUTH_EXPIRES_IN,
  JWT_REFRESH_EXPIRES_IN
} = require("../utility/utility");
const MIN_PASSWORD_LENGTH = Users.MIN_PASSWORD_LENGTH;

/** @description Validate reset password information
 *  @param {String} jwt - unique user jwt
 *  @param {String} password - new password
 *  @param {String} confirmPassword - confirm password
 *  @return Continues on next middleware OR returns error
 */
exports.validatePasswordReset = async (req, res, next) => {
  try {
    // 1) Make sure new password is sufficiently long
    if (req.body.password.length < MIN_PASSWORD_LENGTH) {
      throw new Error(
        `Your new password is too weak! Please make your password over ${MIN_PASSWORD_LENGTH} characters long.`
      );
    }

    // 2 )Make sure confirm password is sufficiently long
    if (req.body.confirmPassword.length < MIN_PASSWORD_LENGTH) {
      throw new Error(
        `Your password is too weak! Please make your password over ${MIN_PASSWORD_LENGTH} characters long.`
      );
    }

    // 3) Make sure passwords match
    if (!validator.equals(req.body.password, req.body.confirmPassword)) {
      throw new Error("New passwords do not match. Please try again.");
    }

    // 4) confirm JWT
    const { jwt } = req.body;
    const [isTrusted, email] = await Utility.validate.passwordResetToken(jwt);
    if (!isTrusted) {
      throw new Error(
        "Could not validate your token. It may be expired or your password has already been updated."
      );
    }

    // 5) Attach expected data to request
    req.body.user = {};
    req.body.user.UserID = await Users.FindUserIDByUnique({ Email: email });
    req.body.user.password = req.body.password;

    // 6) Keep going
    return next();
  } catch (err) {
    // TODO: Log error into DB
    const data = {
      isGood: false,
      msg: err.message || "Error processing your request. Please try again."
    };
    const resStatus = Utility.generate.responseStatusCode(data.msg);
    return res.status(resStatus).send(data);
  }
};

/** @description Validate password update info
 *  @param {String} req.body.user.password - current password
 *  @param {String} req.body.user.newPassword - updated password
 *  @param {String} req.body.user.confirmNewPassword - confirm updated password
 *  @param {String} req.body.user.UserID - person's unique id
 *  @return Continues on next middleware OR returns error
 */
exports.validatePasswordUpdate = async (req, res, next) => {
  // Make sure new password is sufficiently long
  if (req.body.user.newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `Your new password is too weak! Please make your password over ${MIN_PASSWORD_LENGTH} characters long.`
    );
  }

  // Make sure password is sufficiently long
  if (req.body.user.password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `Your password is too weak! Please make your password over ${MIN_PASSWORD_LENGTH} characters long.`
    );
  }

  // Make sure new passwords match
  if (
    !validator.equals(
      req.body.user.newPassword,
      req.body.user.confirmNewPassword
    )
  ) {
    throw new Error("New passwords do not match. Please try again.");
  }

  try {
    const { password, UserID } = req.body.user;
    // Make sure passed password is good
    const user = await Users.AuthenticateUser({ UserID, password });

    // Make sure user was found
    if (!user) {
      throw new Error("Could not authenticate user. Please try agian");
    }

    // Keep going
    return next();
  } catch (err) {
    if (err.code === "ECONNREFUSED") {
      err.message = "Connection error. Please try again";
    }
    const data = {
      isGood: false,
      msg: err.message || "Connection error. Please try again"
    };
    const resStatus = Utility.generate.responseStatusCode(data.msg);
    return res.status(resStatus).send(data);
  }
};

/** @description Log user in by generating token
 *  @param {Object} req.body.user - expects to find user obj. Will check if stringified if not immediately accessible
 *    @param {String} req.body.user.email - persons email
 *    @param {String} req.body.user.password - persons password
 *  @return {Object} data - container object
 *    @return {Boolean} data.isGood - If request is good
 *    @return {String} data.msg - text related to isGood boolean
 *    @return {Object} data.user - container object
 *      @return {String} data.user.token - unique user JWT
 *      @return {String} data.user.displayName - user's display name
 *      @return {String} data.user.email - user's email
 */
exports.login = login = async (req, res, next) => {
  // Quick sanity check
  if (req.body.user === undefined || Object.keys(req.body.user) === 0) {
    const data = {
      isGood: false,
      msg: "You did not pass the necessary fields. Please Try again."
    };
    return res.status(400).send(data);
  }

  try {
    // Verify user
    const user = await Users.AuthenticateUser({
      email: req.body.user.email,
      password: req.body.user.password
    });

    // check we found the person
    if (!user) {
      const data = {
        isGood: false,
        msg: "Could not verify login."
      };

      //invalid credentials
      res.status(400).send(data);
    }

    // check if an admin
    const isAdmin = await Users.IsAdmin({ UserID: user.UserID });

    // create auth token and refresh token
    const [apiToken, refreshToken] = await Utility.create.tokens({
      userID: user.UserID,
      password: user.Password
    });

    // create cookies from tokens
    res.cookie("sfyt-api-token", apiToken, {
      maxAge: 1000 * JWT_AUTH_EXPIRES_IN, // time, in milliseconds, for token expiration
      httpOnly: true,
      path: "/"
    });
    res.cookie("sfyt-api-refresh-token", refreshToken, {
      maxAge: 1000 * JWT_REFRESH_EXPIRES_IN, // time, in milliseconds, for token expiration
      httpOnly: true,
      path: "/"
    });
    res.cookie("has-refresh-token", 1, {
      maxAge: 1000 * JWT_REFRESH_EXPIRES_IN, // time, in milliseconds, for token expiration
      httpOnly: false,
      path: "/"
    });

    // Find out if more middleware or if this is last stop.
    const isLastMiddlewareInStack = Utility.isLastMiddlewareInStack({
      name: "login",
      stack: req.route.stack
    });

    // get name and email
    const { DisplayName: displayName, Email: email, URL: avatarURL } = user;

    // If we are end of stack, go to client
    if (isLastMiddlewareInStack) {
      const data = {
        isGood: true,
        msg: "Successfully logged in.",
        user: { token: apiToken, displayName, email, avatarURL, isAdmin }
      };
      // Send back to client
      res.status(200).send(data);

      // make sure userid is in req.body
      res.locals.UserID = user.UserID;

      // Keep going
      next();
    } else {
      // attach user info onto req.body.user obj
      req.body.user = {
        token,
        displayName,
        email,
        avatarURL,
        UserID: user.UserID
      };

      // remove userID from user obj -- general cleanup
      delete user.UserID;

      // User is legit, go to next middleware
      return next();
    }
  } catch (err) {
    // TODO: Log error in a DB

    if (err.code === "ECONNREFUSED") {
      err.message = "Connection error. Please try again";
    }
    const data = {
      isGood: false,
      msg: err.message || "Connection error. Please try again"
    };
    return res.status(401).send(data);
  }
};

/** @description Log user out by generating cookies with 0 maxage
 *  @return {Object} data - container object
 *    @return {Boolean} data.isGood - If request is good
 *    @return {String} data.msg - text related to isGood boolean
 */
exports.logout = (req, res, next) => {
  try {
    // create httpOnly cookies from tokens
    res.cookie("sfyt-api-token", "N/A", {
      maxAge: 0, // time, in milliseconds, for token expiration
      httpOnly: true,
      path: "/"
    });
    res.cookie("sfyt-api-refresh-token", "N/A", {
      maxAge: 0, // time, in milliseconds, for token expiration
      httpOnly: true,
      path: "/"
    });
    res.cookie("has-refresh-token", 0, {
      maxAge: 0, // time, in milliseconds, for token expiration
      httpOnly: false,
      path: "/"
    });

    const data = {
      isGood: true,
      msg: "Successfully logged out."
    };
    // Send back to client
    res.status(200).send(data);
  } catch (err) {
    // TODO: Log error in a DB

    const data = {
      isGood: false,
      msg: err.message || "Connection error. Please try again"
    };
    return res.status(401).send(data);
  }
};

/** @description Verify if a user is legit by checking JWT
 *  @param {String} req.body.user.token - unique user string
 *  @extends req.body.user.UserID attaches the user's id to the request obj
 *  @return Attaches UserID onto req.body.user OR return with isGood status and message
 */
exports.isLoggedIn = isLoggedIn = async (req, res, next) => {
  // grab api token
  const token = req.cookies["sfyt-api-token"];
  if (token) {
    try {
      // 1) Grab userID from token
      const [isTrusted, userID] = await Utility.validate.APIToken(token);

      if (!isTrusted) {
        const data = {
          isGood: false,
          msg: "Could not verify your account or your account is disabled."
        };
        const errCode = Utility.generate.responseStatusCode(data.msg);
        return res.status(errCode).send(data);
      }

      // 2) Check if a user exists
      const user = await Users.DoesUserExist({ UserID: userID });
      if (!user) {
        const data = {
          isGood: false,
          msg: "Could not find your account or your account is disabled."
        };
        const errCode = Utility.generate.responseStatusCode(data.msg);
        return res.status(errCode).send(data);
      }

      // 3) Find out if more middleware or if this is last stop.
      const isLastMiddlewareInStack = Utility.isLastMiddlewareInStack({
        name: "isLoggedIn",
        stack: req.route.stack
      });

      // 4) Send response back OR keep going
      if (isLastMiddlewareInStack) {
        //return to client
        return res.status(200).send({ isGood: true, msg: "Found user." });
      } else {
        if (!req.body.user) {
          req.body.user = {};
        }
        // attach user info onto req.body.user obj
        req.body.user.UserID = userID;

        // User is legit, go to next middleware
        return next();
      }
    } catch (err) {
      // If api token is expired, we cannot find user, or something else happened, ask person to sign in again
      const data = {
        isGood: false,
        msg: "Your login has expired. Please relogin and try again."
      };
      const errCode = Utility.generate.responseStatusCode(data.msg);
      return res.status(errCode).send(data);
    }
  } else {
    // User has not provided required token so ending it here.
    const data = {
      isGood: false,
      msg: "Your login has expired. Please relogin and try again."
    };
    const errCode = Utility.generate.responseStatusCode(data.msg);
    return res.status(errCode).send(data);
  }
};

/** @description Refresh the authentication token based on cookie refresh token
 *  @return Attaches UserID onto req.body.user OR return with isGood status and message
 */
exports.refreshAuthToken = async (req, res, next) => {
  try {
    // 1) Grab refresh token
    const refreshToken = req.cookies["sfyt-api-refresh-token"];
    if (!refreshToken) {
      const data = {
        isGood: false,
        msg: "Could not find expected cookies. Please try to relogin."
      };
      // generate specific status code
      const responseCode = Utility.generate.responseStatusCode(data.msg);
      // generate specific error code
      data.errorCode = Utility.generate.errorCode(data.msg);
      return res.status(responseCode).send(data);
    }

    // 2) Check if refresh token is valid or not
    const [isRefreshTokenValid, userID] = await Utility.validate.refreshToken(
      refreshToken
    );

    if (!isRefreshTokenValid) {
      const data = {
        isGood: false,
        msg: "Could not verify your account or your account is disabled."
      };
      const errCode = Utility.generate.responseStatusCode(data.msg);

      return res.status(errCode).send(data);
    }

    // 3) Create new auth token
    const apiToken = await Utility.create.APIToken(userID);
    res.cookie("sfyt-api-token", apiToken, {
      maxAge: 1000 * JWT_AUTH_EXPIRES_IN, // time, in milliseconds, for token expiration
      httpOnly: true,
      path: "/"
    });

    // 4) Return to user
    return res.status(200).send({ isGood: true, token: apiToken });
  } catch (err) {
    // set cookies to 'delete'
    res.clearCookie("sfyt-api-refresh-token", { path: "/", maxAge: 0 });
    res.clearCookie("sfyt-api-token", { path: "/", maxAge: 0 });
    res.clearCookie("has-refresh-token", { path: "/", maxAge: 0 });

    // construct our return data object
    const data = {
      isGood: false,
      msg: "Could not verify your account or your account is disabled."
    };
    const errCode = Utility.generate.responseStatusCode(data.msg);
    return res.status(errCode).send(data);
  }
};

/** @description Verify if a user is legit by checking JWT
 *  @param {String} req.body.user.UserID - unique user string
 *  @extends req.body.user attached whether user is an Admin or not
 *  @return Attaches isAdmin onto req.body.user OR return with isGood status and message
 */
exports.isAdmin = isAdmin = async (req, res, next) => {
  if (!req.body.user || !req.body.user.UserID) {
    const data = {
      isGood: false,
      msg: "Could not verify if you are an admin or not."
    };
    // 401 not enough data
    return res.status(400).send(data);
  }

  try {
    // grab UserID
    const { UserID } = req.body.user;
    delete req.body.user.UserID;

    // check if an admin
    const isAdmin = await Users.IsAdmin({ UserID });

    // Find out if more middleware or if this is last stop.
    const isLastMiddlewareInStack = Utility.isLastMiddlewareInStack({
      name: "isAdmin",
      stack: req.route.stack
    });

    // If we are end of stack, go to client
    if (isLastMiddlewareInStack) {
      const data = {
        isGood: false,
        msg: isAdmin ? "User is admin." : "User is not an admin",
        user: Object.assign({}, req.body.user, isAdmin)
      };
      //return to client
      return res.status(200).send(data);
    } else {
      // remove token from user
      delete req.body.user.token;

      // attach user info onto req.body.user obj
      req.body.user = Object.assign({}, req.body.user, isAdmin);

      // User is legit, go to next middleware
      return next();
    }
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      const data = {
        isGood: false,
        msg: "Oops! Looks like your login has expired. Please log in again."
      };
      // 403, user has token but expired so simply need to relogin
      return res.status(403).send(data);
    }
    const data = {
      isGood: false,
      msg: err.message || "Connection error. Please try again"
    };
    return res.status(401).send(data);
  }
};

/** @description Update a specific user's password
 *  userController.validatePasswordUpdate should be called before this.
 *  @param {String} req.body.user.UserID - unique user identifer
 *  @param {String} req.body.user.newPassword - new password
 *  @return Continues on next middleware OR returns isGood object
 */
exports.updatePassword = updatePassword = async (req, res, next) => {
  try {
    // Get user's ID and make sure we have something
    const { UserID } = req.body.user;

    if (!UserID) {
      const data = {
        isGood: false,
        msg: "Could not verify user as legit. Please log out and try again."
      };
      return res.status(400).send(data);
    }
    // Grab email and make sure we have soemthing
    const { newPassword } = req.body.user;
    if (!newPassword) {
      const data = {
        isGood: false,
        msg: "Could not find a new password to update to."
      };
      return res.status(400).send(data);
    }

    // Update the password, make sure it worked.
    const isGood = await Users.UpdatePassword({
      UserID,
      Password: newPassword
    });
    if (!isGood) {
      const data = {
        isGood: false,
        msg:
          "Could not update password. User's account may be locked or inactive."
      };
      return res.status(401).send(data);
    }

    // create auth token and refresh token
    const [token, refreshToken] = await Utility.create.tokens({
      userID: UserID,
      password: process.env.SECRET_REFRESH + newPassword
    });

    // create cookies from tokens
    res.cookie("sfyt-api-token", token, {
      maxAge: 1000 * JWT_AUTH_EXPIRES_IN, // time, in milliseconds, for token expiration
      httpOnly: true,
      path: "/"
    });
    res.cookie("sfyt-api-refresh-token", refreshToken, {
      maxAge: 1000 * JWT_REFRESH_EXPIRES_IN, // time, in milliseconds, for token expiration
      httpOnly: true,
      path: "/"
    });
    res.cookie("has-refresh-token", 1, {
      maxAge: 1000 * JWT_REFRESH_EXPIRES_IN, // time, in milliseconds, for token expiration
      httpOnly: false,
      path: "/"
    });

    // Find out if more middleware or if this is last stop.
    const isLastMiddlewareInStack = Utility.isLastMiddlewareInStack({
      name: "updatePassword",
      stack: req.route.stack
    });

    // If we are end of stack, go to client
    if (isLastMiddlewareInStack) {
      //return to client
      return res.status(200).send(Object.assign({}, { isGood: true }));
    } else {
      // Go to next middleware
      return next();
    }
  } catch (err) {}
};

/** @description Check if user is eligible to add a sauce or not
 *  @extends res.locals attaches isEmailVerified to res.locals or returns with that message
 *  @param {String} req.body.user.UserID - unique user string *
 *  @return Attaches isEmailVerified to res.locals OR Returns res.locals w/ isEmailVerified
 */
exports.isEmailVerified = isEmailVerified = async (req, res, next) => {
  try {
    // get UserID
    const { UserID } = req.body.user;

    // Make sure we have userid
    if (!UserID) {
      const data = {
        isGood: false,
        msg: "Could not find a user to lookup. Please provide a valid user."
      };
      return res.status(400).send(data);
    }

    // Find if email has been verified or not
    const IsEmailVerified = await Users.IsEmailVerified({ UserID });

    // If not verified, end here.
    if (!IsEmailVerified) {
      //return to client
      return res.status(401).send({
        isGood: false, //user cannot update
        msg:
          "You have not verified your email yet! Please verify your email if you want to submit a sauce or add a review."
      });
    }

    // Find out if more middleware or if this is last stop.
    const isLastMiddlewareInStack = Utility.isLastMiddlewareInStack({
      name: "isEmailVerified",
      stack: req.route.stack
    });

    // If we are end of stack, go to client
    if (isLastMiddlewareInStack) {
      //return to client
      res.status(200).send({
        isGood: IsEmailVerified, //user can/cannot update
        msg: "Email is verified."
      });

      // Go to next middleware
      next();
    } else {
      // Go to next middleware
      res.locals.isEmailVerified = IsEmailVerified;
      return next();
    }
  } catch (err) {
    const data = {
      isGood: false,
      msg:
        "There was an error in determing if your email has been verified or not. Please try again.",
      err
    };
    return res.status(400).send(data);
  }
};

/** @description Confirm an email address
 *  @param {String} req.body.email - email to confirm
 *  @return Continues on next middleware OR returns isGood object
 */
exports.confirmEmail = confirmEmail = async (req, res, next) => {
  try {
    // 1) Make sure we have an email to work with
    const { jwt: JWTEmail } = req.body;
    if (!JWTEmail) {
      const data = {
        isGood: false,
        msg:
          "Could not find an email address to verify. Please confirm email address is provided correctly and try again."
      };
      // Send back bad data response
      return res.status(400).send(data);
    }

    // 2) Turn JWT into something usable
    const [isTrusted, userID] = await Utility.validate.emailToken(JWTEmail);
    if (!isTrusted) {
      const data = {
        isGood: false,
        msg:
          "Oops! Your URL may be expired or invalid. Please request a new verification email and try again."
      };
      const errCode = Utility.generate.responseStatusCode(data.msg);
      return res.status(errCode).send(data);
    }

    // 3) Toggle email on
    const success = await Users.toggleConfirmEmail({
      UserID: userID,
      Toggle: true
    });
    if (!success) {
      const data = {
        isGood: false,
        msg:
          "Oops! Your URL may be expired or invalid. Please request a new verification email and try again."
      };
      const errCode = Utility.generate.responseStatusCode(data.msg);
      return res.status(errCode).send(data);
    }

    // 4) Find out if more middleware or if this is last stop.
    const isLastMiddlewareInStack = Utility.isLastMiddlewareInStack({
      name: "confirmEmail",
      stack: req.route.stack
    });
    if (isLastMiddlewareInStack) {
      // 5) Send to client
      return res.status(200).send({
        isGood: true,
        msg: "Your email has been verified! Thank you!"
      });
    } else {
      // 5) Keep going
      req.body.user.Email = Email;

      // Go to next middleware
      return next();
    }
  } catch (err) {
    // TODO: Log to DB here

    const data = {
      isGood: false,
      msg:
        "Oops! Your URL may be expired or invalid. Please request a new verification email and try again."
    };
    const errCode = Utility.generate.responseStatusCode(data.msg);
    return res.status(errCode).send(data);
  }
};

/** @description Confirm an email address
 *  @param {String} req.body.user.UserID - User to resend email verfication to
 *  @return Continues on next middleware OR returns isGood object
 */
exports.resendEmail = resendEmail = async (req, res, next) => {
  try {
    const { UserID } = req.body.user;

    const Email = await Users.FindUserEmail({ UserID });
    // Make sure good
    if (!Email) {
      const data = {
        isGood: false,
        msg:
          "Could not find your email address. Your account may be locked or inactive."
      };
      return res.status(401).send(data);
    }

    const couldSendVerification = await Utility.send.verificationEmail({
      Email
    });

    // Make sure good
    if (!couldSendVerification) {
      const data = {
        isGood: false,
        msg:
          "Could not resend verification email. User's account may be locked or inactive."
      };
      return res.status(401).send(data);
    }

    // Find out if more middleware or if this is last stop.
    const isLastMiddlewareInStack = Utility.isLastMiddlewareInStack({
      name: "resendEmail",
      stack: req.route.stack
    });

    // If we are end of stack, go to client
    if (isLastMiddlewareInStack) {
      //return to client
      return res.status(200).send({
        isGood: true,
        msg: "Email verification resent! Thank you."
      });
    } else {
      // Get user's email and attach to body
      const email = await Users.FindUserEmail({
        DisplayName: displayName
      });

      req.body.user.email = email;

      // Go to next middleware
      return next();
    }
  } catch (err) {
    const data = {
      isGood: false,
      msg:
        "Could not confirm email address. Your account may be locked, inactive, or token may be expired. "
    };
    return res.status(401).send(data);
  }
};

/** @description Sends a password reset email
 *  @param {String} req.body.email - Email to send the password reset to
 *  @return Continues on next middleware OR returns isGood object
 */
exports.requestPasswordReset = requestPasswordReset = async (
  req,
  res,
  next
) => {
  try {
    // 1. Grab email from user
    let { email } = req.body;
    if (!email) {
      email = req.body.Email;
      if (!email) {
        // Cannot find email on the body. End here. Send false positive.
        const data = {
          isGood: true,
          msg: "Password reset email has been sent! Thank you!"
        };
        const resStatus = Utility.generate.responseStatusCode(data.msg);
        return res.status(resStatus).send(data);
      }
    }
    email = email.toLowerCase();

    // 2. Check if the person exists or not.
    const doesPersonExist = await Users.DoesUserExist({
      Email: email
    });
    if (!doesPersonExist) {
      // Person doesn't exist. End here. Send false positive.
      const data = {
        isGood: true,
        msg: "Password reset email has been sent! Thank you!"
      };
      const resStatus = Utility.generate.responseStatusCode(data.msg);
      return res.status(resStatus).send(data);
    }

    // 3. Send email to person
    const couldSendVerification = await Utility.send.resetPasswordEmail({
      Email: email
    });
    if (!couldSendVerification) {
      // Couldn't send the email. Send actual error message asking user to try again.
      const data = {
        isGood: false,
        msg:
          "We tried to email your account but something went wrong. Please try again."
      };
      const resStatus = Utility.generate.responseStatusCode(data.msg);
      return res.status(resStatus).send(data);
    }

    // 4. Find out if more middleware or if this is last stop.
    const isLastMiddlewareInStack = Utility.isLastMiddlewareInStack({
      name: "resendEmail",
      stack: req.route.stack
    });
    if (isLastMiddlewareInStack) {
      // If we are end of stack, go to client
      // Send object to user
      const data = {
        isGood: true,
        msg: "Password reset email has been sent! Thank you!"
      };
      const resStatus = Utility.generate.responseStatusCode(data.msg);
      return res.status(resStatus).send(data);
    } else {
      // Go to next middleware
      return next();
    }
  } catch (err) {
    // send false positive
    const data = {
      isGood: true,
      msg: "Password reset email has been sent! Thank you!"
    };
    const resStatus = Utility.generate.responseStatusCode(data.msg);
    return res.status(resStatus).send(data);
  }
};

/** @description Reset a specific user's password
 *  authController.validatePasswordReset should be called before this.
 *  @param {String} req.body.user.UserID - unique user identifer
 *  @param {String} req.body.user.password - new password
 *  @return Continues on next middleware OR returns isGood object
 */
exports.resetPassword = resetPassword = async (req, res, next) => {
  try {
    // 1) Grab user's ID and make sure we have something
    const { UserID } = req.body.user;
    if (!UserID) {
      const data = {
        isGood: false,
        msg: "Could not verify user as legit. Please log out and try again."
      };
      return res.status(400).send(data);
    }

    // 2) Grab email and make sure we have soemthing
    const { password } = req.body.user;
    if (!password) {
      const data = {
        isGood: false,
        msg: "Could not find a new password to update to."
      };
      return res.status(400).send(data);
    }

    // 3) Update the password, make sure it worked.
    const isGood = await Users.UpdatePassword({ UserID, Password: password });
    if (!isGood) {
      const data = {
        isGood: false,
        msg:
          "Could not update password. User's account may be locked or inactive."
      };
      return res.status(401).send(data);
    }

    // 4) Find out if more middleware or if this is last stop.
    const isLastMiddlewareInStack = Utility.isLastMiddlewareInStack({
      name: "resetPassword",
      stack: req.route.stack
    });
    if (isLastMiddlewareInStack) {
      //return to client
      const data = {
        isGood: true,
        msg: "Your password has been updated! Thank you."
      };
      return res.status(200).send(data);
    } else {
      // Go to next middleware
      return next();
    }
  } catch (err) {
    // TODO: Log error in a DB

    if (err.code === "ECONNREFUSED") {
      err.message = "Connection error. Please try again";
    }
    const data = {
      isGood: false,
      msg: err.message || "Connection error. Please try again"
    };
    const resStatus = Utility.generate.responseStatusCode(data.msg);
    return res.status(resStatus).send(data);
  }
};
