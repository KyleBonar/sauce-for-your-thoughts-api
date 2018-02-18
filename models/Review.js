const mongoose = require("mongoose");
mongoose.Promise = global.Promise;

const reviewSchema = new mongoose.Schema({
  author: {
    type: mongoose.Schema.ObjectId,
    ref: "User"
  },
  sauce: {
    type: mongoose.Schema.ObjectId,
    ref: "Sauce"
  },
  created: {
    type: Date,
    default: Date.now
  },
  text: {
    type: String
  },
  rating: {
    type: Number,
    required: "You must supply a rating",
    min: 1,
    max: 10
  }
});

module.exports = mongoose.model("Review", reviewSchema);
