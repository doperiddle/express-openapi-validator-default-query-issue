const bodyParser = require("body-parser");
const express = require("express");
const OpenApiValidator = require("express-openapi-validator");
const jetpack = require("fs-jetpack");
const swagger = require("swagger-ui-express");
const yaml = require("yaml");

const apiSpec = yaml.parse(jetpack.read("./openapi.yaml"));

/**
 * Resolves a local JSON $ref (e.g. "#/components/schemas/Foo") within the spec.
 * Returns the schema object itself if it is not a $ref.
 */
function resolveRef(spec, schema) {
  if (schema && schema.$ref) {
    const path = schema.$ref.replace(/^#\//, "").split("/");
    return path.reduce((obj, key) => obj && obj[key], spec);
  }
  return schema;
}

/**
 * Builds a middleware that injects OpenAPI default values for deepObject-style
 * query parameters before express-openapi-validator processes the request.
 *
 * This ensures that:
 *  - When a deepObject parameter is entirely absent, the full defaults object
 *    is present on req.query before validation runs.
 *  - When only some sub-properties are provided, the missing ones are filled
 *    with their schema defaults before validation runs.
 *
 * express-openapi-validator v5.6.2 relies on Ajv's useDefaults option to
 * populate missing sub-properties during validation, but only injects the
 * top-level default when the parameter key is absent altogether. Providing the
 * merged defaults here makes the behaviour explicit and robust against future
 * library changes.
 */
function createDeepObjectDefaultsMiddleware(spec) {
  // Collect every deepObject query parameter that has per-property defaults.
  const deepObjectParams = [];

  for (const pathItem of Object.values(spec.paths || {})) {
    for (const operation of Object.values(pathItem)) {
      if (!operation || !Array.isArray(operation.parameters)) continue;
      for (const param of operation.parameters) {
        if (param.in !== "query" || param.style !== "deepObject") continue;
        const schema = resolveRef(spec, param.schema);
        if (!schema || !schema.properties) continue;

        const propertyDefaults = {};
        for (const [key, propSchema] of Object.entries(schema.properties)) {
          const resolved = resolveRef(spec, propSchema);
          if (resolved && resolved.default !== undefined) {
            propertyDefaults[key] = resolved.default;
          }
        }

        if (Object.keys(propertyDefaults).length > 0) {
          deepObjectParams.push({ name: param.name, defaults: propertyDefaults });
        }
      }
    }
  }

  return function deepObjectDefaultsMiddleware(req, _res, next) {
    for (const { name, defaults } of deepObjectParams) {
      // Merge: schema defaults are the base, any provided values override them.
      req.query[name] = Object.assign({}, defaults, req.query[name] || {});
    }
    next();
  };
}

const app = express();

app.use(bodyParser.json());

// Inject deepObject defaults before the validator so that:
//  1. The validator sees a fully-populated object and can apply coercion/min checks.
//  2. Route handlers always receive defaults for omitted sub-properties.
app.use(createDeepObjectDefaultsMiddleware(apiSpec));

app.use(
  OpenApiValidator.middleware({
    apiSpec,
    validateResponses: { removeAdditional: "failing" },
  })
);

function handleDeepObjectQuery(req, res) {
  console.log(req.query);
  // Return an empty array to satisfy the spec's response schema (array of numbers).
  res.json([]);
}

function errorHandler(error, req, res, next) {
  res.status(error.status || 500).json({
    message: error.message,
    errors: error.errors,
  });
}

app.use("/spec", (req, res) => res.send(apiSpec));
app.use("/docs", swagger.serve, swagger.setup(apiSpec));
app.get("/deep_object", handleDeepObjectQuery);

app.use(errorHandler);

module.exports = app;

if (require.main === module) {
  app.listen(1234, (startupError) => {
    if (startupError) throw startupError;
    console.log("Running on Port 1234");
  });
}
