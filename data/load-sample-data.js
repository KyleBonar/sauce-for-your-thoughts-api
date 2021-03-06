require("dotenv").config({ path: `${__dirname}/../variables.env` });
const fs = require("fs");

const mongoose = require("mongoose");
mongoose.connect(process.env.DATABASE);
mongoose.Promise = global.Promise; // Tell Mongoose to use ES6 promises

// import all of our models - they need to be imported only once
const Sauce = require("../models/Sauce");
const Review = require("../models/Review");
const User = require("../models/User");
const Pepper = require("../models/Pepper");
const Type = require("../models/Type");

const sauces = JSON.parse(fs.readFileSync(`${__dirname}/sauces.json`, "utf-8"));
const reviews = JSON.parse(
  fs.readFileSync(`${__dirname}/reviews.json`, "utf-8")
);
const users = JSON.parse(fs.readFileSync(`${__dirname}/users.json`, "utf-8"));

// Pepper data found from:
// https://www.cayennediane.com/the-scoville-scale/
const peppers = JSON.parse(
  fs.readFileSync(`${__dirname}/peppers.json`, "utf-8")
);

const types = JSON.parse(fs.readFileSync(`${__dirname}/type.json`, "utf-8"));

async function deleteData() {
  console.log("😢😢 Goodbye Data...");
  await Sauce.remove();
  await Review.remove();
  await User.remove();
  await Pepper.remove();
  await Type.remove();
  console.log(
    "Data Deleted. To load sample data, run\n\n\t npm run sample\n\n"
  );
  process.exit();
}

async function loadData() {
  try {
    // await Sauce.insertMany(sauces);
    // await Review.insertMany(reviews);
    await User.insertMany(users);
    await Pepper.insertMany(peppers);
    await Type.insertMany(types);
    console.log("👍👍👍👍👍👍👍👍 Done!");
    process.exit();
  } catch (e) {
    console.log(
      "\n👎👎👎👎👎👎👎👎 Error! The Error info is below but if you are importing sample data make sure to drop the existing database first with.\n\n\t npm run blowitallaway\n\n\n"
    );
    console.log(e);
    process.exit();
  }
}
if (process.argv.includes("--delete")) {
  deleteData();
} else {
  loadData();
}
