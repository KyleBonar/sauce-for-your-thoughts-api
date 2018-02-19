const mongoose = require("mongoose");
const User = mongoose.model("User");
const promisify = require("es6-promisify");
const jwt = require("jsonwebtoken");

exports.validateRegister = (req, res, next) => {
  req.sanitizeBody("user.name");
  req.checkBody("user.name", "You must supply a name.").notEmpty();
  req.checkBody("user.email", "That email is not valid.").isEmail();
  req.sanitizeBody("user.email").normalizeEmail({
    remove_dots: false,
    remove_extension: false,
    gmail_remove_subaddress: false
  });
  req.checkBody("user.password", "Password cannot be empty.").notEmpty();
  req
    .checkBody("user.confirmPassword", "Confirmed password cannot be empty.")
    .notEmpty();
  req
    .checkBody("user.confirmPassword", "Oops! Your passwords do not match.")
    .equals(req.body.user.password);

  const errors = req.validationErrors();
  if (errors) {
    const data = {
      isGood: false,
      msg: errors
    };
    return res.status(401).send(data);
  }
  next();
};

exports.register = async (req, res, next) => {
  try {
    const record = {
      email: req.body.user.email,
      name: req.body.user.name
    };
    const user = await new User(record).save();

    if (!user) {
      const data = {
        isGood: false,
        msg: "Unable to register this user. Please try again."
      };
      return res.status(300).send(data);
    }

    next(); //go to authController.login
  } catch (errors) {
    const data = {
      isGood: false,
      msg: errors.message
    };
    return res.status(401).send(data);
  }
};

exports.getUser = (req, res) => {
  // check if a user exists
  return User.findById(req.body.user._id, (userErr, user) => {
    if (userErr || !user) {
      const data = {
        isGood: false,
        msg: "Unable to find user. Please try again."
      };
      return res.status(401).send(data);
    }

    //only pass back relevant information
    const data = {
      isGood: true,
      user: { email: user.email, name: user.name },
      msg: "Successfully found user."
    };
    return res.status(200).send(data);
  });
};

exports.updateUser = async (req, res) => {
  const updates = {
    name: req.body.name,
    email: req.body.email
  };

  try {
    const user = await User.findOneAndUpdate(
      { _id: req.body.user._id },
      { $set: updates },
      { new: true, runValidators: true, context: "query" }
    );

    const data = {
      isGood: true,
      msg: "Successfully updated user information.",
      user: { email: user.email, name: user.name }
    };

    return res.status(200).send(data);
  } catch (errors) {
    const data = {
      isGood: false,
      msg: errors.message
    };

    return res.status(401).send(data);
  }
};

exports.getSauceUser = async (req, res, next) => {
  try {
    //array of promises
    const sauces = await Promise.all(
      req.body.sauces.map(async sauce => {
        //search through user for matching id and grab only email
        const email = await User.findOne({ _id: sauce.author }, "-_id email");
        //mongoose return are not objects so we need to convert to object first
        sauce = sauce.toObject();
        //set author to email
        sauce.author = email.email;
        return sauce;
      })
    );

    const data = await {
      isGood: true,
      sauces,
      msg: "Successfully found sauces"
    };
    res.status(200).send(data);
  } catch (errors) {
    console.log(errors);
    console.log("inside catch");
    const data = {
      isGood: false,
      msg: "Unable to find sauces or appropriate user association."
    };
    res.status(401).send(data);
  }
};

exports.getHearts = async (req, res) => {
  try {
    const user = await User.findById(req.body.user._id, { _id: 0, hearts: 1 });

    if (!user) {
      const data = {
        isGood: false,
        msg: "Could not find user. Please try again."
      };
      return res.status(400).send(data);
    }

    const data = {
      isGood: true,
      msg: "Found user hearts.",
      data: { hearts: user.hearts }
    };

    return res.status(200).send(data);
  } catch (err) {
    return res.status(400).send(err);
  }
};

exports.toggleHeart = async (req, res) => {
  try {
    //grab all user hearts
    //turn mongodb results to workable objects
    const user = await User.findById(req.body.user._id, {
      _id: 0,
      hearts: 1
    });

    //figure out if we need to remove sauce id from hearts array or add to it
    const operator = user.hearts
      .map(x => x.toString())
      .includes(req.body.sauce._id)
      ? "$pull"
      : "$addToSet";

    // update user's hearts
    await User.findByIdAndUpdate(
      req.body.user._id,
      { [operator]: { hearts: req.body.sauce._id } },
      { new: true }
    );

    return res.status(200).send({
      isGood: true,
      msg: `Sauce ${req.body.sauce._id} has been toggled.`,
      data: { sauce: { _id: req.body.sauce._id } }
    });
  } catch (err) {
    //TODO: Better error handling
    console.log(err);
    return res.status(400).send(err);
  }
};
