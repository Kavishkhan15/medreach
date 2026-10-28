import mongoose from "mongoose";
const alertSchema=new mongoose.Schema({
 eventId:{type:String,required:true},transition:{type:String,enum:["open","acknowledged","resolved"],required:true},createdAt:{type:Date,required:true},
 status:{type:String,enum:["queued","running","delivered","exhausted"],default:"queued"},attempts:{type:Number,default:0},retryAt:Date,leaseUntil:Date,leaseToken:String,deliveredAt:Date,errorCode:String,payload:mongoose.Schema.Types.Mixed,actor:{type:mongoose.Schema.Types.ObjectId,ref:"User"},reason:String,
},{_id:false});
const schema=new mongoose.Schema({
 key:{type:String,required:true},status:{type:String,enum:["open","acknowledged","resolved"],required:true},
 severity:{type:String,enum:["warning","critical"],required:true},
 count:{type:Number,required:true,min:0},firstSeenAt:Date,lastSeenAt:Date,resolvedAt:Date,
 acknowledgedAt:Date,acknowledgedBy:{type:mongoose.Schema.Types.ObjectId,ref:"User"},acknowledgementReason:String,
 alertEvents:{type:[alertSchema],default:[]},alertSequenceBase:{type:Number,default:0},alertBacklog:{type:Boolean,default:false},lastObservedStatus:String,
}, {timestamps:true});
schema.index({key:1},{unique:true});
schema.index({status:1,lastSeenAt:-1});
schema.index({"alertEvents.status":1,"alertEvents.retryAt":1});
export const OperationalIncident=mongoose.model("OperationalIncident",schema);
