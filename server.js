const express = require("express");
const { OpenApiValidator } = require("express-openapi-validator");
const fs = require("fs").promises;
const swagger = require("swagger-ui-express");
const yaml = require("yaml");

async function startServer() {
  const apiSpec = yaml.parse(await fs.readFile("./openapi.yaml", "utf-8"));

  const server = express();

  await new OpenApiValidator({
    apiSpec,
    validateResponses: { removeAdditional: "failing" },
  }).install(server);

  server.get("/spec", (req, res) => res.json(apiSpec));
  server.use("/docs", swagger.serve, swagger.setup(apiSpec));
  server.get("/deep_object", (req, res) => {
    console.log(req.query);
    res.sendStatus(200);
  });

  server.use((err, req, res, next) =>
    res.status(err.status || 500).json({
      message: err.message || "Internal Server Error",
      errors: err.errors || [],
    })
  );

  server.listen(1234, (err) => {
    if (err) throw err;
    console.log("Running on Port 1234");
  });
}

startServer().catch(console.error);
