import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { authenticateIntegrationCredential, createIntegrationCredential, listIntegrationCredentials, revokeIntegrationCredential } from "../services/integrationCredentials.js";
import { getPublicInventory, updateInventory } from "../services/inventoryService.js";
const router = Router();
const handle = fn => async (req, res, next) => { try { res.set("Cache-Control", "no-store"); await fn(req, res); } catch (error) { if (error.status) { if (error.retryAfterSeconds) res.set("Retry-After", String(error.retryAfterSeconds)); return res.status(error.status).json({ error: error.message, code: error.code }); } next(error); } };
router.get("/credentials/:kind/:organizationId", requireAuth, requireRole("provider_admin"), handle(async (req, res) => res.json(await listIntegrationCredentials({ actor: req.user, ...req.params, limit: req.query.limit, before: req.query.before }))));
router.post("/credentials/:kind/:organizationId", requireAuth, requireRole("provider_admin"), handle(async (req, res) => res.status(201).json(await createIntegrationCredential({ ...req.body, ...req.params, actor: req.user, requestId: req.id }))));
router.delete("/credentials/:kind/:organizationId/:id", requireAuth, requireRole("provider_admin"), handle(async (req, res) => { await revokeIntegrationCredential({ ...req.params, actor: req.user, requestId: req.id }); res.status(204).end(); }));
// Machine routes never accept cookies or fall back to a browser session. Organisation derives exclusively from the credential.
router.get("/inventory", handle(async (req, res) => {
  const context = await authenticateIntegrationCredential(req.get("authorization")?.replace(/^Bearer /, ""), "inventory:read");
  res.json(await getPublicInventory(context));
}));
router.put("/inventory/:resourceKey", handle(async (req, res) => {
  const context = await authenticateIntegrationCredential(req.get("authorization")?.replace(/^Bearer /, ""), "inventory:write");
  res.json(await updateInventory({ ...context, resourceKey: req.params.resourceKey, input: req.body, requestId: req.id }));
}));
export default router;
