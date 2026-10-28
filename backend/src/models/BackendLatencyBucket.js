import mongoose from 'mongoose';
// Opt-in, disposable measurement buckets. No identifiers, paths, filters or payloads.
const schema = new mongoose.Schema({
 _id:{type:String,required:true}, minute:{type:Date,required:true}, expiresAt:{type:Date,required:true},
 kind:{type:String,enum:['request','stage','database','pool','telemetry'],required:true},
 metric:{type:String,required:true,maxlength:60}, route:{type:String,required:true,maxlength:240},
 method:{type:String,required:true,maxlength:8}, statusClass:{type:String,required:true,maxlength:8},
 count:{type:Number,min:0,default:0}, sumMs:{type:Number,min:0,default:0}, maxMs:{type:Number,min:0,default:0},
 slowCount:{type:Number,min:0,default:0}, histogram:{type:mongoose.Schema.Types.Mixed,default:{}},
}, {strict:'throw',versionKey:false});
schema.index({expiresAt:1},{expireAfterSeconds:0});
schema.index({minute:1,kind:1});
export const BackendLatencyBucket=mongoose.model('BackendLatencyBucket',schema);
