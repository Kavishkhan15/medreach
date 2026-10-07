import test from "node:test";
import assert from "node:assert/strict";

test("browser reads share in-flight requests without caching data or forcing preflight", async () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  const requests = [];
  let complete;
  globalThis.window = {};
  globalThis.fetch = (url, options) => {
    requests.push({ url, options });
    return new Promise((resolve) => { complete = () => resolve(new Response('{"data":[]}', { status: 200 })); });
  };
  try {
    const api = await import(`../../packages/core/src/api.js?reads=${Date.now()}`);
    const first = api.listHospitals({ city: "Mumbai" });
    const second = api.listHospitals({ city: "Mumbai" });
    assert.equal(first, second);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].options.headers["Content-Type"], undefined);
    assert.equal(requests[0].options.credentials, "include");
    complete();
    await first;
    const later = api.listHospitals({ city: "Mumbai" });
    assert.equal(requests.length, 2);
    complete();
    await later;
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("credential rejection makes one request and preserves JSON submission headers", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return new Response('{"error":"Invalid email or password"}', { status: 401 });
  };
  try {
    const api = await import(`../../packages/core/src/api.js?login=${Date.now()}`);
    await assert.rejects(api.login("test@medreach.test", "invalid"), /Invalid email or password/);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].options.headers["Content-Type"], "application/json");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
