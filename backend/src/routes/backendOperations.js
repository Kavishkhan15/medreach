import { readEmergencyCoverage,updateEmergencyCoverage } from "../services/emergencyCoverage.js";
import { acknowledgeIncident } from "../services/operationalAlerts.js";
import { Router } from "express";
import { param,body,query } from "express-validator";
import { requireAuth,requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { collectBackendStatus } from "../services/backendOperations.js";
import { retryExhaustedJob } from "../services/backgroundJobs.js";
import { BackgroundJob } from "../models/BackgroundJob.js";
import { OperationalAlertReceipt } from "../models/OperationalAlertReceipt.js";
import { OperationalIncident } from "../models/OperationalIncident.js";
import { AuditLog } from "../models/AuditLog.js";
import { reconcileInventoryJournal } from "../services/inventoryService.js";
const router=Router();router.use((_req,res,next)=>{res.set("Cache-Control","private, no-store");next();});router.use(requireAuth,requireRole("system_admin"));
router.get("/coverage",asyncHandler(async(_req,res)=>res.json({data:await readEmergencyCoverage()})));
router.put("/coverage",asyncHandler(async(req,res)=>res.json({data:await updateEmergencyCoverage({actor:req.user,input:req.body})})));
router.get("/health",asyncHandler(async(_req,res)=>res.json(await collectBackendStatus())));
router.get("/jobs",query("limit").optional().isInt({min:1,max:100}).toInt(),query("status").optional().isIn(["queued","running","completed","exhausted","cancelled"]),validate,asyncHandler(async(req,res)=>{
 const limit=Math.min(100,Math.max(1,Number(req.query.limit)||25));
 const filter=req.query.status?{status:req.query.status}:{};
 if(filter.status&&!['queued','running','completed','exhausted','cancelled'].includes(filter.status))return res.status(400).json({error:"Invalid job status"});
 const data=await BackgroundJob.find(filter).select("-payload -leaseToken -owner -retryHistory").sort({_id:-1}).limit(limit).lean();res.json({data,limit});
}));
router.get("/incidents",asyncHandler(async(_req,res)=>res.json({data:await OperationalIncident.find({status:{$in:["open","acknowledged"]}}).select("-alertEvents.leaseToken").sort({lastSeenAt:-1}).limit(100).lean()})));
router.get("/incidents/:id/alerts",param("id").isMongoId(),query("before").optional().isInt({min:1}).toInt(),query("limit").optional().isInt({min:1,max:100}).toInt(),validate,asyncHandler(async(req,res)=>{
 const limit=req.query.limit||25;
 const rows=await OperationalAlertReceipt.find({incident:req.params.id,...(req.query.before?{sequence:{$lt:req.query.before}}:{})}).sort({sequence:-1}).limit(limit).lean();
 res.json({data:rows,nextBefore:rows.length===limit?rows[rows.length-1].sequence:null});
}));
router.post("/incidents/:id/acknowledge",param("id").isMongoId(),body("reason").isString().trim().isLength({min:5,max:200}),validate,asyncHandler(async(req,res)=>{
 const incident=await acknowledgeIncident({id:req.params.id,actorId:req.user.id,reason:req.body.reason});
 if(!incident)return res.status(409).json({error:"Incident is not open"});
 // Actor and reason are persisted atomically on the incident itself.
 res.json({ok:true,id:incident.id,status:incident.status});
}));
router.post("/inventory/recover",body("reason").isString().trim().isLength({min:5,max:200}),body("limit").optional().isInt({min:1,max:100}).toInt(),validate,asyncHandler(async(req,res)=>{
 await AuditLog.create({user:req.user.id,action:"update",entityType:"InventoryRecovery",after:{operation:"recovery_requested",reason:req.body.reason},requestId:req.id});
 const result=await reconcileInventoryJournal({limit:req.body.limit||25,recoverExhausted:true,actor:req.user});
 res.json({ok:result.failed===0,...result});
}));
router.post("/jobs/:id/retry",param("id").isMongoId(),body("reason").isString().trim().isLength({min:5,max:200}),validate,asyncHandler(async(req,res)=>{
 const ok=await retryExhaustedJob(req.params.id,{reason:req.body.reason,actorId:req.user.id});
 if(!ok)return res.status(409).json({error:"Job is not eligible for recovery"});
 let auditPending=false;
 try { await AuditLog.create({user:req.user.id,action:"update",entityType:"BackgroundJob",entityId:req.params.id,after:{operation:"manual_retry",reason:req.body.reason},requestId:req.id}); }
 catch { auditPending=true; /* The reason and actor are committed in the job recovery history. */ }
 res.json({ok:true,...(auditPending?{auditPending:true}:{})});
}));
export default router;
