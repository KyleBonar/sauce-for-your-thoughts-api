const express = require("express");
const routes = require("./routes/routes.js");

//create express app
const app = express();

//serves up static files from distribution and images folder.
app.use("/public/uploads", express.static(__dirname + "/public/uploads"));
app.use("/public/avatars", express.static(__dirname + "/public/avatars"));

// Allow cross origin
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  next();
});

// takes raw requests and attaches them to req.body for use later
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

//handle routes
app.use("/", routes);

module.exports = app;
