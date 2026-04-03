const request = require("supertest");
const { app } = require("./server");

describe("GET /spec", () => {
  it("returns the OpenAPI specification as JSON", async () => {
    const res = await request(app).get("/spec");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      openapi: "3.0.0",
      info: { title: "API", version: "1.0.0" },
    });
    expect(res.body.paths).toHaveProperty("/deep_object");
  });
});

describe("GET /deep_object", () => {
  it("returns 200 with no query parameters (relying on schema defaults)", async () => {
    const res = await request(app).get("/deep_object");
    expect(res.status).toBe(200);
  });

  it("returns 200 with all valid pagesort parameters", async () => {
    const res = await request(app).get(
      "/deep_object?pagesort[page]=2&pagesort[perPage]=10&pagesort[field]=id&pagesort[order]=DESC"
    );
    expect(res.status).toBe(200);
  });

  it("returns 200 with only the page parameter supplied", async () => {
    const res = await request(app).get("/deep_object?pagesort[page]=3");
    expect(res.status).toBe(200);
  });

  it("returns 200 with only the order parameter supplied", async () => {
    const res = await request(app).get("/deep_object?pagesort[order]=ASC");
    expect(res.status).toBe(200);
  });

  it("returns 400 when page is below the minimum (< 1)", async () => {
    const res = await request(app).get("/deep_object?pagesort[page]=0");
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("message");
    expect(res.body).toHaveProperty("errors");
  });

  it("returns 400 when page is a non-integer string", async () => {
    const res = await request(app).get("/deep_object?pagesort[page]=abc");
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("message");
    expect(res.body).toHaveProperty("errors");
  });

  it("returns 400 when order has an invalid enum value", async () => {
    const res = await request(app).get(
      "/deep_object?pagesort[order]=INVALID"
    );
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("message");
    expect(res.body).toHaveProperty("errors");
  });

  it("returns 400 when field has an invalid enum value", async () => {
    const res = await request(app).get(
      "/deep_object?pagesort[field]=unknown"
    );
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("message");
    expect(res.body).toHaveProperty("errors");
  });

  it("returns a JSON array in the response body", async () => {
    const res = await request(app).get("/deep_object");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe("Error handler", () => {
  it("responds with a JSON object containing message and errors fields on validation failure", async () => {
    const res = await request(app).get("/deep_object?pagesort[page]=0");
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      message: expect.any(String),
      errors: expect.any(Array),
    });
  });

  it("returns 404 for an unknown route", async () => {
    const res = await request(app).get("/unknown_route");
    expect(res.status).toBe(404);
  });
});
