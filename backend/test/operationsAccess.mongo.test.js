import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import request from "supertest";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { BackgroundJob } from "../src/models/BackgroundJob.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { signSessionToken } from "./helpers/session.js";
const uri=process.env.MEDREACH_OPERATIONS_TEST_MONGO_URI;
const isolated=(()=>{try{const u=new URL(uri);return ["127.0.0.1","localhost","[::1]"].includes(u.hostname)&&u.pathname==="/medreach_operations_test";}catch{return false;}})();
test("operational APIs enforce current System Admin access and safe recovery feedback",{skip:!isolated},async t=>{
 await mongoose.connect(uri);await mongoose.connection.dropDatabase();
 try{
  const app=createApp();
  const accounts=await User.create(["system_admin","provider_admin","user"].map(role=>({name:`Synthetic ${role}`,email:`${role}@operations.test`,role})));
  const tokens=await Promise.all(accounts.map(signSessionToken));
  await t.test("private diagnostics reject anonymous and other roles",async()=>{
   await request(app).get("/api/admin/backend/health").expect(401);
   for(const token of tokens.slice(1))await request(app).get("/api/admin/backend/health").set("Authorization",`Bearer ${token}`).expect(403);
   const response=await request(app).get("/api/admin/backend/health").set("Authorization",`Bearer ${tokens[0]}`).expect(200);
   assert.equal(response.body.degraded,true);
  });
  await t.test("job queries validate limits and exclude private payload and lease credentials",async()=>{
   await BackgroundJob.create({key:"safe-operation-fixture",type:"fixture.operation",status:"exhausted",runAt:new Date(),attempts:5,maxAttempts:5,payload:{secret:"private-fixture"},leaseToken:"lease-private"});
   await request(app).get("/api/admin/backend/jobs?limit=1.2").set("Authorization",`Bearer ${tokens[0]}`).expect(400);
   const response=await request(app).get("/api/admin/backend/jobs?limit=1").set("Authorization",`Bearer ${tokens[0]}`).expect(200);
   assert.equal(response.body.data.length,1);
   assert.equal(JSON.stringify(response.body).includes("private-fixture"),false);
   assert.equal(JSON.stringify(response.body).includes("lease-private"),false);
  });
  await t.test("confirmed retry remains successful if secondary audit projection fails",async()=>{
   const job=await BackgroundJob.findOne({key:"safe-operation-fixture"});
   const create=AuditLog.create;AuditLog.create=async()=>{throw new Error("isolated audit outage");};
   try{
    await request(app).post(`/api/admin/backend/jobs/${job._id}/retry`).set("Authorization",`Bearer ${tokens[1]}`).send({reason:"Reviewed fixture retry"}).expect(403);
    const response=await request(app).post(`/api/admin/backend/jobs/${job._id}/retry`).set("Authorization",`Bearer ${tokens[0]}`).send({reason:"Reviewed fixture retry"}).expect(200);
    assert.equal(response.body.ok,true);assert.equal(response.body.auditPending,true);
    const saved=await BackgroundJob.findById(job._id);
    assert.equal(saved.status,"queued");assert.equal(String(saved.retryHistory[0].actor),String(accounts[0]._id));
   }finally{AuditLog.create=create;}
  });
 }finally{await mongoose.connection.dropDatabase();await mongoose.disconnect();}
});
