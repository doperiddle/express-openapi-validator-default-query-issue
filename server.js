const bodyParser = require("body-parser");
const express = require("express");
const OpenApiValidator = require("express-openapi-validator");
const jetpack = require("fs-jetpack");
const path = require("path");
const swagger = require("swagger-ui-express");
const yaml = require("yaml");

const apiSpec = yaml.parse(jetpack.read(path.resolve(__dirname, "openapi.yaml")));

const app = express();

app.use(bodyParser.json());

// Serve spec and docs before validation so they are not blocked by the validator
app.use("/spec", (req, res) => res.send(apiSpec));
app.use("/docs", swagger.serve, swagger.setup(apiSpec));

app.use(
  OpenApiValidator.middleware({
    apiSpec,
    validateResponses: { removeAdditional: "failing" },
  })
);

function handleDeepObjectQuery(req, res) {
  console.log("deep_object query: %j", req.query);
  res.status(200).json([]);
}

function errorHandler(error, req, res, next) {
  res.status(error.status || 500).json({
    message: error.message,
    errors: error.errors,
  });
}

app.get("/deep_object", handleDeepObjectQuery);

app.use(errorHandler);

if (require.main === module) {
  app.listen(1234, (startupError) => {
    if (startupError) throw startupError;
    console.log("Running on Port 1234");
  });
}

module.exports = { app };
