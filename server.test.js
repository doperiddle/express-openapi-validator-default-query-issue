/**
 * Tests for the /deep_object endpoint.
 *
 * Background
 * ----------
 * express-openapi-validator v5.6.2 does not always inject the default values
 * defined in a deepObject-style query parameter schema before validation runs:
 *
 *  - When the parameter key is entirely absent it injects the defaults object,
 *    but uses a truthy check (`if (v['default'])`) that silently skips falsy
 *    defaults (0, false, "").
 *  - When only some sub-properties are provided it relies on Ajv's useDefaults
 *    option to fill the rest during validation, but does not guarantee the
 *    merged result is available to route handlers before validation completes.
 *
 * The custom `createDeepObjectDefaultsMiddleware` added in server.js addresses
 * both cases explicitly by merging schema defaults with any provided values
 * before the validator runs.
 *
 * These tests document and lock in the correct end-to-end behaviour.
 */

const request = require("supertest");
const express = require("express");
const bodyParser = require("body-parser");
const OpenApiValidator = require("express-openapi-validator");
const jetpack = require("fs-jetpack");
const yaml = require("yaml");

const apiSpec = yaml.parse(jetpack.read("./openapi.yaml"));

function resolveRef(spec, schema) {
  if (schema && schema.$ref) {
    const path = schema.$ref.replace(/^#\//, "").split("/");
    return path.reduce((obj, key) => obj && obj[key], spec);
  }
  return schema;
}

function createDeepObjectDefaultsMiddleware(spec) {
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
      req.query[name] = Object.assign({}, defaults, req.query[name] || {});
    }
    next();
  };
}

/**
 * Builds a test app that:
 *  - applies the deepObject defaults middleware,
 *  - runs request validation (but not response validation, so the echo handler
 *    can return arbitrary JSON without conflicting with the spec's array schema),
 *  - echoes req.query.pagesort as JSON so tests can assert on it.
 */
function buildTestApp() {
  const testApp = express();
  testApp.use(bodyParser.json());
  testApp.use(createDeepObjectDefaultsMiddleware(apiSpec));
  testApp.use(
    OpenApiValidator.middleware({
      apiSpec,
      validateRequests: true,
      validateResponses: false,
    })
  );

  testApp.get("/deep_object", (req, res) => {
    res.json(req.query.pagesort || null);
  });

  testApp.use((err, req, res, next) => {
    res.status(err.status || 500).json({
      message: err.message,
      errors: err.errors,
    });
  });

  return testApp;
}

describe("GET /deep_object – deepObject defaults", () => {
  let testApp;

  beforeAll(() => {
    testApp = buildTestApp();
  });

  test("no params: all schema defaults are present in req.query.pagesort", async () => {
    const res = await request(testApp).get("/deep_object").expect(200);
    expect(res.body).toEqual({
      page: 1,
      perPage: 25,
      field: "id",
      order: "ASC",
    });
  });

  test("partial params (page only): missing properties get schema defaults", async () => {
    const res = await request(testApp)
      .get("/deep_object?pagesort[page]=3")
      .expect(200);
    expect(res.body).toEqual({
      page: 3,
      perPage: 25,
      field: "id",
      order: "ASC",
    });
  });

  test("all params provided: values pass through unchanged", async () => {
    const res = await request(testApp)
      .get(
        "/deep_object?pagesort[page]=2&pagesort[perPage]=10&pagesort[field]=id&pagesort[order]=DESC"
      )
      .expect(200);
    expect(res.body).toEqual({
      page: 2,
      perPage: 10,
      field: "id",
      order: "DESC",
    });
  });

  test("invalid enum value: validator returns 400", async () => {
    const res = await request(testApp)
      .get("/deep_object?pagesort[order]=INVALID")
      .expect(400);
    expect(res.body).toMatchObject({
      errors: expect.arrayContaining([
        expect.objectContaining({ path: "/query/pagesort/order" }),
      ]),
    });
  });

  test("below minimum page value: validator returns 400", async () => {
    const res = await request(testApp)
      .get("/deep_object?pagesort[page]=0")
      .expect(400);
    expect(res.body).toMatchObject({
      errors: expect.arrayContaining([
        expect.objectContaining({ path: "/query/pagesort/page" }),
      ]),
    });
  });
});
