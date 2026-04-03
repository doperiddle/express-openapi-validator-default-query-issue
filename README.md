# express-openapi-validator – deepObject default query parameter issue

This repository reproduces and documents a bug in
[`express-openapi-validator`](https://github.com/cdimascio/express-openapi-validator)
v5.6.2 where schema **default values** are not reliably injected into
`req.query` for query parameters that use `style: deepObject`.

---

## The bug

OpenAPI 3 allows you to declare default values for the properties of a
`deepObject`-style query parameter:

```yaml
parameters:
  - in: query
    name: pagesort
    style: deepObject
    explode: true
    schema:
      $ref: "#/components/schemas/PageSort"

components:
  schemas:
    PageSort:
      type: object
      properties:
        page:    { type: integer, default: 1,     minimum: 1 }
        perPage: { type: integer, default: 25 }
        field:   { type: string,  default: "id",  enum: ["id"] }
        order:   { type: string,  default: "ASC", enum: ["ASC", "DESC"] }
```

### Expected behaviour

| Request | `req.query.pagesort` |
|---------|----------------------|
| `GET /deep_object` (no params) | `{ page: 1, perPage: 25, field: "id", order: "ASC" }` |
| `GET /deep_object?pagesort[page]=3` | `{ page: 3, perPage: 25, field: "id", order: "ASC" }` |

### Actual behaviour (without the workaround)

`express-openapi-validator` v5.6.2 has two related defects in its internal
`handleDeepObject` helper:

1. **Falsy defaults are silently skipped.** The helper iterates over schema
   properties with `if (v['default'])`, so any property whose default is `0`,
   `false`, or `""` is never added to the defaults object.

2. **Partial params bypass default injection.** When at least one
   sub-property is provided (e.g., `pagesort[page]=3`), the helper treats the
   parameter as "present" and skips default injection entirely. It then relies
   on Ajv's `useDefaults` option to fill in the blanks during validation—which
   does work for the validation pass, but the merged result is not guaranteed
   to be visible to route handlers before the library's internal state is
   updated.

---

## The fix

A custom middleware runs **before** `express-openapi-validator` and explicitly
merges schema defaults with any provided values:

```js
function createDeepObjectDefaultsMiddleware(spec) {
  // ... extract deepObject params + their per-property defaults from the spec

  return function deepObjectDefaultsMiddleware(req, _res, next) {
    for (const { name, defaults } of deepObjectParams) {
      // Schema defaults are the base; provided values override them.
      req.query[name] = Object.assign({}, defaults, req.query[name] || {});
    }
    next();
  };
}

app.use(createDeepObjectDefaultsMiddleware(apiSpec));
app.use(OpenApiValidator.middleware({ apiSpec, ... }));
```

This ensures that:

- Route handlers always receive a fully-populated `req.query.pagesort` object
  even when no params are sent.
- Missing sub-properties are filled with their schema defaults regardless of
  whether the rest of the parameter was provided.
- Falsy defaults (e.g., `page: 0`) are handled correctly because the
  middleware uses `!== undefined` rather than a truthy check.

The middleware is **generic**: it reads all `deepObject` parameters from the
OpenAPI spec at startup and works for any endpoint, not just `/deep_object`.

---

## Response schema fix

The original `handleDeepObjectQuery` route used `res.sendStatus(200)` (which
sends `"OK"` as plain text) while the spec declares a `200` response with
`content: application/json` containing an array of numbers. This has been
corrected to `res.json([])` so the response matches the spec and response
validation does not produce false errors.

---

## Running the server

```bash
npm install
npm start          # starts on http://localhost:1234
```

Endpoints:

| Path | Description |
|------|-------------|
| `GET /deep_object` | Test endpoint – logs and returns `req.query` |
| `GET /spec` | Raw OpenAPI spec |
| `GET /docs` | Swagger UI |

---

## Running the tests

```bash
npm test
```

The test suite covers:

| Scenario | Expected outcome |
|----------|-----------------|
| No `pagesort` params | All four properties set to their schema defaults |
| `pagesort[page]=3` only | `page: 3`; remaining properties set to defaults |
| All params provided | Values pass through unchanged; validation succeeds |
| `pagesort[order]=INVALID` | 400 with a validation error on `/query/pagesort/order` |
| `pagesort[page]=0` | 400 with a validation error on `/query/pagesort/page` |
