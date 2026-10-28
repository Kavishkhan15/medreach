import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { previewInventoryImport, confirmInventoryImport, readInventoryImport, recoverInventoryImports } from "../src/services/inventoryImport.js";
import { InventoryImport } from "../src/models/InventoryImport.js";
import { ResourceInventory } from "../src/models/ResourceInventory.js";
import { InventoryObservation } from "../src/models/InventoryObservation.js";
import { ProviderMembership } from "../src/models/ProviderMembership.js";
import { Hospital } from "../src/models/Hospital.js";
import { ResourceProvider } from "../src/models/ResourceProvider.js";
import { User } from "../src/models/User.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { getPublicInventory } from "../src/services/inventoryService.js";
const uri = process.env.MEDREACH_INVENTORY_IMPORT_TEST_MONGO_URI;
const isolated = Boolean(uri && /^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\/medreach_inventory_import_test$/.test(uri));
const csv = rows => "resourceKey,unit,capacity,occupied,blocked,held,observedAt,expectedVersion\n" + rows.map(([key, version=0, unit="beds"]) => `${key},${unit},50,10,0,0,${new Date().toISOString()},${version}`).join("\n");
test("staged provider inventory imports enforce isolation and recover committed rows", { skip: !isolated, timeout: 60000 }, async t => {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 4000 }); await mongoose.connection.dropDatabase();
  t.after(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  await Promise.all([InventoryImport, ResourceInventory, InventoryObservation, ProviderMembership, Hospital, ResourceProvider, User, AuditLog].map(M => M.init()));
  const [admin, staff, other] = await User.create(["system_admin", "provider_admin", "provider_admin"].map((role,i) => ({ name: role, email:`import${i}@test.example`, role, accountStatus:"active" })));
  const actor = { id: staff._id }, otherActor = { id: other._id };
  async function target(name) {
    const hospital = await Hospital.create({ name, approvalStatus: "approved" });
    await ProviderMembership.create({ user: staff._id, kind:"hospital", organization:hospital._id, assignedBy:admin._id });
    return { kind:"hospital", organizationId: String(hospital._id) };
  }
  const first = await target("Import happy path");
  let stage;
  await t.test("preview/read require exact organisation membership; confirmation requires reviewed digest", async () => {
    await assert.rejects(previewInventoryImport({ actor:otherActor, ...first, csv:csv([["general_beds"]]) }), e=>e.status===403);
    stage = await previewInventoryImport({ actor, ...first, csv:csv([["general_beds"]]) });
    assert.equal((await readInventoryImport({ actor, id:stage.id })).digest, stage.digest);
    await assert.rejects(readInventoryImport({ actor:otherActor, id:stage.id }), e=>e.status===404);
    await assert.rejects(confirmInventoryImport({ actor,id:stage.id,digest:"forged",attestProviderObserved:true }), e=>e.code==="IMPORT_CONFIRMATION_REQUIRED");
    await assert.rejects(confirmInventoryImport({ actor,id:stage.id,digest:stage.digest,attestProviderObserved:false }), e=>e.code==="IMPORT_CONFIRMATION_REQUIRED");
    assert.equal(await ResourceInventory.countDocuments(),0);
  });
  await t.test("confirmed stage applies once and repeated same-digest confirmation stays idempotent", async()=>{
    const input={actor,id:stage.id,digest:stage.digest,attestProviderObserved:true};
    const result=await confirmInventoryImport(input); assert.equal(result.status,"complete"); assert.equal(result.rows[0].inventoryVersion,1);
    assert.equal((await confirmInventoryImport(input)).attempts,1);
    assert.equal(await ResourceInventory.countDocuments(),1); assert.equal(await InventoryObservation.countDocuments(),1);
  });
  await t.test("partial success preserves successful rows and reports version conflicts",async()=>{
    const preview=await previewInventoryImport({ actor,...first,csv:csv([["general_beds",0],["icu_beds",0]]) });
    const result=await confirmInventoryImport({actor,id:preview.id,digest:preview.digest,attestProviderObserved:true});
    assert.equal(result.status,"partial"); assert.deepEqual(result.rows.map(r=>r.state),["conflict","applied"]);
    assert.equal((await ResourceInventory.findOne({organization:first.organizationId,resourceKey:"general_beds"})).version,1);
    assert.equal((await ResourceInventory.findOne({organization:first.organizationId,resourceKey:"icu_beds"})).version,1);
  });
  await t.test("revoked membership between preview and confirm blocks all writes",async()=>{
    const org=await target("Revoked import"); const preview=await previewInventoryImport({actor,...org,csv:csv([["general_beds"]])});
    await ProviderMembership.updateOne({user:actor.id,organization:org.organizationId},{$set:{active:false}});
    await assert.rejects(confirmInventoryImport({actor,id:preview.id,digest:preview.digest,attestProviderObserved:true}),e=>e.status===403);
    assert.equal(await ResourceInventory.countDocuments({organization:org.organizationId}),0);
  });
  await t.test("archived parent hospital blocks linked provider import",async()=>{
    const parent=await Hospital.create({name:"Archived import parent",approvalStatus:"approved",archivedAt:new Date()});
    const provider=await ResourceProvider.create({name:"Linked diagnostic",kind:"diagnostic",hospital:parent._id,sourceName:"isolated",approvalStatus:"approved"});
    await ProviderMembership.create({user:actor.id,organization:provider._id,kind:"diagnostic",assignedBy:admin._id});
    await assert.rejects(previewInventoryImport({actor,kind:"diagnostic",organizationId:provider._id,csv:csv([["daily_appointments",0,"slots"]])}),e=>e.status===403);
  });
  await t.test("expired preview cannot apply rows",async()=>{
    const org=await target("Expired import"); const preview=await previewInventoryImport({actor,...org,csv:csv([["general_beds"]])});
    await InventoryImport.updateOne({_id:preview.id},{$set:{expiresAt:new Date(Date.now()-1000)}});
    await assert.rejects(confirmInventoryImport({actor,id:preview.id,digest:preview.digest,attestProviderObserved:true}),e=>e.code==="IMPORT_UNAVAILABLE");
    assert.equal(await ResourceInventory.countDocuments({organization:org.organizationId}),0);
  });
  await t.test("crash after snapshot commit recovers journal evidence without a second update",async()=>{
    const org=await target("Crash import"); const preview=await previewInventoryImport({actor,...org,csv:csv([["general_beds"]])});
    const originalUpdate=InventoryImport.updateOne, originalAudit=AuditLog.updateOne;
    InventoryImport.updateOne=function(filter,update,...args){ if(Object.keys(update.$set||{}).some(k=>k.startsWith("rows."))) throw new Error("injected process interruption"); return originalUpdate.call(this,filter,update,...args); };
    AuditLog.updateOne=async()=>{throw new Error("injected audit outage");};
    const input={actor,id:preview.id,digest:preview.digest,attestProviderObserved:true};
    try{await assert.rejects(confirmInventoryImport(input),/injected process interruption/);}finally{InventoryImport.updateOne=originalUpdate;AuditLog.updateOne=originalAudit;}
    const saved=await ResourceInventory.findOne({organization:org.organizationId}).select("+pendingEvents");
    assert.equal(saved.version,1);assert.equal(saved.pendingEvents.length,1);
    await InventoryImport.updateOne({_id:preview.id},{$set:{leaseUntil:new Date(Date.now()-1000)}});
    const recovered=await confirmInventoryImport(input); assert.equal(recovered.status,"complete");assert.equal(recovered.attempts,2);
    assert.equal((await ResourceInventory.findById(saved._id)).version,1);
  });
  await t.test("three failed attempts exhaust retry budget without unbounded writes",async()=>{
    const org=await target("Failed import"); const preview=await previewInventoryImport({actor,...org,csv:csv([["general_beds"]])});
    const input={actor,id:preview.id,digest:preview.digest,attestProviderObserved:true};const original=ResourceInventory.findOne;
    ResourceInventory.findOne=()=>{throw new Error("injected database interruption");};
    try{for(let i=1;i<=3;i++){const result=await confirmInventoryImport(input);assert.equal(result.attempts,i);assert.equal(result.rows[0].state,"failed");}
      await assert.rejects(confirmInventoryImport(input),e=>e.code==="IMPORT_UNAVAILABLE");
    }finally{ResourceInventory.findOne=original;}
    assert.equal(await ResourceInventory.countDocuments({organization:org.organizationId}),0);
  });
  await t.test("client-forged request IDs cannot impersonate committed import rows", async () => {
    const org = await target("Forged marker import"), preview = await previewInventoryImport({ actor, ...org, csv: csv([["general_beds"]]) });
    await AuditLog.create({ user: actor.id, action: "update", entityType: "ResourceInventory", entityId: new mongoose.Types.ObjectId(), requestId: `inventory-import:${preview.id}:0`, after: { version: 999 } });
    const result = await confirmInventoryImport({ actor, id: preview.id, digest: preview.digest, attestProviderObserved: true });
    assert.equal(result.rows[0].inventoryVersion, 1);
    assert.equal(await ResourceInventory.countDocuments({ organization: org.organizationId }), 1);
    const visible = await readInventoryImport({ actor, id: preview.id }); assert.equal(visible.commitKey, undefined);
  });
  await t.test("a crashed final processing lease becomes an explicit terminal stage", async () => {
    const org = await target("Terminal crash import"), preview = await previewInventoryImport({ actor, ...org, csv: csv([["general_beds"]]) });
    await InventoryImport.updateOne({ _id: preview.id }, { $set: { status: "processing", attempts: 3, leaseUntil: new Date(Date.now()-1000) } });
    assert.equal((await recoverInventoryImports({ id: preview.id })).exhausted, 1);
    const visible = await readInventoryImport({ actor, id: preview.id }); assert.equal(visible.status, "exhausted"); assert.equal(visible.terminalReason, "IMPORT_RETRIES_EXHAUSTED");
    await assert.rejects(confirmInventoryImport({ actor, id: preview.id, digest: preview.digest, attestProviderObserved: true }), e => e.code === "IMPORT_UNAVAILABLE");
    assert.equal(await ResourceInventory.countDocuments({ organization: org.organizationId }), 0);
  });
  await t.test("demo inventory remains demo and public availability remains unknown",async()=>{
    const org=await target("Demo import");
    await ResourceInventory.create({kind:"hospital",organization:org.organizationId,resourceKey:"general_beds",unit:"beds",capacity:50,occupied:0,blocked:0,held:0,available:50,version:1,classification:"demo",observedAt:new Date(),reportingMethod:"demo_fixture"});
    const preview=await previewInventoryImport({actor,...org,csv:csv([["general_beds",1]])});
    assert.equal((await confirmInventoryImport({actor,id:preview.id,digest:preview.digest,attestProviderObserved:true})).status,"complete");
    assert.equal((await ResourceInventory.findOne({organization:org.organizationId})).classification,"demo");
    const publicView=await getPublicInventory({kind:"hospital",organizationId:org.organizationId});
    assert.equal(publicView.data.find(r=>r.resourceKey==="general_beds").available,null);
  });
});
