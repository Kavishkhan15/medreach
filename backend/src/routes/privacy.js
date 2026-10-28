import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { requireRecentPrivilegedAuthentication } from "../middleware/privilegedSecurity.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { RETENTION_POLICY, createScopedExport, consumeScopedExport } from "../services/privacyControls.js";
const router = Router();
router.use(requireAuth, requireRole("system_admin", "provider_admin"));
router.use((_req, res, next) => { res.set("Cache-Control", "private, no-store"); next(); });
router.get("/retention-policy", (_req, res) => res.json(RETENTION_POLICY));
router.post("/exports", requireRecentPrivilegedAuthentication, asyncHandler(async (req, res) => {
  if (Object.keys(req.body || {}).some(key => !["kind", "organizationId", "dataset"].includes(key))) return res.status(400).json({ error: "Unexpected export fields" });
  const result = await createScopedExport({ actor: req.user, ...req.body, requestId: req.id });
  res.status(201).json(result);
}));
// Token travels only in the request body, never in URLs/referrers/query logs.
router.post("/exports/:id/download", requireRecentPrivilegedAuthentication, asyncHandler(async (req, res) => {
  const result = await consumeScopedExport({ actor: req.user, id: req.params.id, token: req.body?.token, requestId: req.id });
  res.set("Content-Disposition", 'attachment; filename="medreach-inventory.json"');
  res.json(result);
}));
export default router;
