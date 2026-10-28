import mongoose from "mongoose";
const windowSchema=new mongoose.Schema({start:{type:Date,required:true},end:{type:Date,required:true},users:[{type:mongoose.Schema.Types.ObjectId,ref:"User"}]},{_id:false});
const schema=new mongoose.Schema({key:{type:String,required:true,unique:true,enum:["platform"]},enabled:{type:Boolean,required:true},version:{type:Number,required:true,min:1},windows:{type:[windowSchema],default:[]},updatedBy:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true},reason:{type:String,required:true,maxlength:200},audit:[{at:Date,actor:{type:mongoose.Schema.Types.ObjectId,ref:"User"},version:Number,policyHash:String,reason:String,_id:false}]},{timestamps:true});
export const EmergencyCoverage=mongoose.model("EmergencyCoverage",schema);
