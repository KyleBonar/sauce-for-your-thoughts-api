const mongoose = require("mongoose");
const Review = mongoose.model("Review");

/** @description Add review to DB
 *  @param {Object} review - review to be saved
 *  @return {Object} attaches review to req.response
 */
exports.addReview = async (req, res) => {
  try {
    //construct review to save
    const record = {
      author: req.body.user._id,
      sauce: req.body.sauce._id,
      text: req.body.review.text || "",
      rating: req.body.review.rating
    };

    //save into DB
    //TODO limit returned object information
    const review = await new Review(record).save("text");

    //make sure record is good
    if (!review) {
      const data = {
        isGood: false,
        msg: "Could not add sauce"
      };
      return res.status(400).send(data);
    }

    //check to see if req.response is a thing or not
    if (!("response" in req) || req.response === undefined) req.response = {};

    //attach review id to sauce if exists
    if (!("sauce" in req.response) || req.response.sauce === undefined) {
      req.response.sauce.review = review.toObject();
    }

    //attach review to response object
    req.response.review = review.toObject();
    const data = {
      isGood: true,
      msg: "Successfully added sauce.",
      data: req.response
    };
    return res.status(200).send(data);
  } catch (err) {
    //TODO: Better error handling/loggin

    const data = {
      isGood: false,
      msg: "Could not add sauce. Make sure all fields are filled and try again."
    };
    return res.status(400).send(data);
  }
};

exports.findReviewByUserAndSauce = async (req, res) => {
  try {
    const query = {
      author: req.body.user._id,
      sauce: req.body.sauce._id
    };
    const review = await Review.findOne(query, { _id: 1, rating: 1 });
    if (!review) {
      const data = {
        isGood: false,
        msg: "Could not find sauce."
      };
      return res.status(400).send(data);
    }
    console.log(review);

    const data = {
      isGood: true,
      msg: "Successfully found sauce."
      // data: { sauce: req.data.sauce }
    };
    return res.status(200).send(data);
  } catch (err) {
    //TODO: Better error handling/loggin
    console.log(err);

    const data = {
      isGood: false,
      msg: "Could not add sauce. Make sure all fields are filled and try again."
    };
    return res.status(400).send(data);
  }
};

/** @description Get all reviews related to specific sauce _id
 *  @param Integer Expects sauce._id on req.body
 *  @return array of reviews
 */
exports.findReviewsBySauceID = async (req, res) => {
  //make sure sauce._id was actually passed
  if (!req.body.sauce || !req.body.sauce._id) {
    const data = {
      isGood: false,
      msg: "Requires sauce object. Please try again."
    };
    return res.status(300).send(data);
  }

  try {
    //construct query
    const query = {
      sauce: req.body.sauce._id
    };

    // find reviews by sauce._id
    // do not populate sauce since we already have that information from previous middleware (sauceControll.getSauceById)
    const reviews = await Review.find(query, {
      sauce: 0,
      created: 0
    }).populate("author", "name _id");

    //attach reviews array to our response object
    req.response.reviews = reviews.map(x => x.toObject());

    //construct our final return object
    const data = {
      isGood: true,
      data: req.response
    };

    //send response back
    res.status(200).send(data);
  } catch (err) {
    console.log(err);
    res.status(400).send(err);
  }
};
