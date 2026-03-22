const bodyParser = require("body-parser");
const express = require("express");
const OpenApiValidator = require("express-openapi-validator");
const jetpack = require("fs-jetpack");
const swagger = require("swagger-ui-express");
const yaml = require("yaml");

const apiSpec = yaml.parse(jetpack.read("./openapi.yaml"));

const app = express();

app.use(bodyParser.json());

function handleDeepObjectQuery(req, res) {
  console.log(req.query);
  res.sendStatus(200);
}

function errorHandler(error, req, res, next) {
  res.status(error.status || 500).json({
    message: error.message,
    errors: error.errors,
  });
}

 copilot/fix-security-issues
server.use(
  OpenApiValidator.middleware({
    apiSpec,
    validateResponses: { removeAdditional: "failing" },
  })
);

server.use("/spec", (req, res) => res.send(apiSpec));
server.use("/docs", swagger.serve, swagger.setup(apiSpec));
server.get("/deep_object", (req, res) => {
  console.log(req.query);
  res.sendStatus(200);
});

server.use((err, req, res, next) =>
  res.status(err.status || 500).json({
    message: err.message,
    errors: err.errors,
  })
);

server.listen(1234, (err) => {
  if (err) throw err;
  console.log("Running on Port 1234");
});
new OpenApiValidator({
  apiSpec,
  validateResponses: { removeAdditional: "failing" },
})
  .install(app)
  .then(() => {
    app.use("/spec", (req, res) => res.send(apiSpec));
    app.use("/docs", swagger.serve, swagger.setup(apiSpec));
    app.get("/deep_object", handleDeepObjectQuery);

    app.use(errorHandler);

    app.listen(1234, (startupError) => {
      if (startupError) throw startupError;
      console.log("Running on Port 1234");
    });
  });
 master
