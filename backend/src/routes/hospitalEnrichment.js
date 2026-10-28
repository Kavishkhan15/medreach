import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { requestHospitalEnrichment, readHospitalEnrichment, reviewHospitalEnrichment, listHospitalEnrichments } from '../services/hospitalEnrichmentWorkflow.js';
const router=Router();
router.use(requireAuth,requireRole('system_admin'));
router.use((_req,res,next)=>{res.set('Cache-Control','private, no-store');next()});
const handle=fn=>async(req,res,next)=>{try{res.json(await fn(req))}catch(error){if(error.status)return res.status(error.status).json({error:error.message,code:error.code});next(error)}};
router.get('/',handle(req=>listHospitalEnrichments({actor:req.user,hospitalId:req.query.hospitalId,status:req.query.status,limit:req.query.limit,before:req.query.before})));
router.post('/:hospitalId',handle(req=>{
  if(Object.keys(req.body||{}).some(key=>key!=='reason'))throw Object.assign(new Error('Unexpected enrichment fields'),{status:400});
  return requestHospitalEnrichment({actor:req.user,hospitalId:req.params.hospitalId,reason:req.body?.reason});
}));
router.get('/:candidateId',handle(req=>readHospitalEnrichment({actor:req.user,id:req.params.candidateId})));
router.post('/:candidateId/review',handle(req=>reviewHospitalEnrichment({actor:req.user,id:req.params.candidateId,input:req.body})));
export default router;
