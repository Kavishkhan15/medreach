import { getPublicInventory, getInventoryHistory, updateInventory } from "../services/inventoryService.js";
import { hashIp } from "../utils/audit.js";

const handled = (handler) => async (req, res, next) => {
  try { await handler(req, res); }
  catch (error) {
    if (Number.isInteger(error.status) && error.status >= 400 && error.status <= 503 && typeof error.code === "string") return res.status(error.status).json({ error: error.message, code: error.code });
    next(error);
  }
};
export const listInventory = handled(async (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json(await getPublicInventory(req.params));
});
export const listInventoryHistory = handled(async (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json(await getInventoryHistory({ ...req.params, actor: req.user, limit: req.query.limit ?? 20, before: req.query.before }));
});
export const putInventory = handled(async (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json(await updateInventory({ ...req.params, input: req.body, actor: req.user, requestId: req.id, ipHash: hashIp(req.ip) }));
});
