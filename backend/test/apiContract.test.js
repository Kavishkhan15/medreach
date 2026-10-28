import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import { openapiV1 } from "../src/contracts/openapiV1.js";
import contractRouter from "../src/routes/contracts.js";
import integrationsRouter from "../src/routes/integrations.js";
import inventoryRouter from "../src/routes/inventory.js";
import importRouter from "../src/routes/inventoryImports.js";
import adoptionRouter from "../src/routes/providerAdoption.js";
import privacyRouter from "../src/routes/privacy.js";
import enrichmentRouter from "../src/routes/hospitalEnrichment.js";
import metricsRouter from "../src/routes/backendMetrics.js";
test("contract covers implemented provider routes without aliasing endpoint versions", async () => {
  assert.equal(openapiV1.openapi, "3.1.0");
  for (const [mount, router] of [["/api/integrations", integrationsRouter], ["/api/inventory", inventoryRouter], ["/api/provider-imports", importRouter], ["/api/privacy", privacyRouter], ["/api/provider-adoption", adoptionRouter], ["/api/admin/hospital-enrichment", enrichmentRouter], ["/api/admin/backend-metrics", metricsRouter]]) {
    for (const layer of router.stack.filter(layer => layer.route)) {
      const path = `${mount}${layer.route.path}`.replace(/:([A-Za-z]+)/g, "{$1}");
      for (const method of Object.keys(layer.route.methods)) assert.ok(openapiV1.paths[path]?.[method], `Missing ${method} ${path}`);
    }
  }
  const operationIds = [];
  for (const [path, operations] of Object.entries(openapiV1.paths)) for (const definition of Object.values(operations)) {
    assert.ok(path.startsWith("/api/") && !path.startsWith("/api/v1/"));
    operationIds.push(definition.operationId);
    for (const [,name] of path.matchAll(/\{([^}]+)\}/g)) assert.ok(definition.parameters.some(p => p.name === name && p.in === "path" && p.required));
    assert.ok(definition.responses["401"] && definition.responses["409"]);
  }
  assert.equal(new Set(operationIds).size, operationIds.length);
  assert.deepEqual(openapiV1.paths["/api/integrations/inventory"].get.security, [{ integrationBearer: [] }]);
  assert.deepEqual(openapiV1.components.schemas.InventoryUpdate.properties.held.enum, [0, null]);
  const app = express(); app.use("/api/contracts", contractRouter);
  const res = await request(app).get("/api/contracts/v1/openapi.json"); assert.equal(res.status, 200); assert.equal(res.body.info.version, "1.0.0");
});
