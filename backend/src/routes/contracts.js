import { Router } from "express";
import { openapiV1 } from "../contracts/openapiV1.js";
const router = Router();
router.get("/v1/openapi.json", (_req, res) => { res.set("Cache-Control", "public, max-age=300"); res.json(openapiV1); });
export default router;
