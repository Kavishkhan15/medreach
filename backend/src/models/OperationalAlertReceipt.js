import mongoose from "mongoose";
// eventId is the primary key, so prefix archival stays idempotent without a
// separately provisioned uniqueness constraint. No automatic evidence expiry.
const schema=new mongoose.Schema({_id:{type:String,required:true},incident:{type:mongoose.Schema.Types.ObjectId,required:true},sequence:{type:Number,required:true},key:{type:String,required:true},transition:{type:String,required:true},createdAt:{type:Date,required:true},archivedAt:{type:Date,required:true},status:{type:String,enum:["delivered","exhausted"],required:true},attempts:Number,deliveredAt:Date,errorCode:String,payload:mongoose.Schema.Types.Mixed,actor:{type:mongoose.Schema.Types.ObjectId,ref:"User"},reason:String},{versionKey:false});
schema.index({incident:1,sequence:-1});schema.index({status:1,archivedAt:-1});
export const OperationalAlertReceipt=mongoose.model("OperationalAlertReceipt",schema);
