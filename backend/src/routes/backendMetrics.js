import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { readBackendMetrics } from '../services/backendMetrics.js';
const router=Router();
router.use((_req,res,next)=>{res.set('Cache-Control','private, no-store');next();});
router.use(requireAuth,requireRole('system_admin'));
router.get('/',asyncHandler(async(req,res)=>res.json(await readBackendMetrics({minutes:req.query.minutes}))));
export default router;
