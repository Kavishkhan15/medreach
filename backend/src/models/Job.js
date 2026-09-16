import mongoose from "mongoose";

const schema = new mongoose.Schema({
  hospital: { type: mongoose.Schema.Types.ObjectId, ref: "Hospital", required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 160 },
  category: { type: String, enum: ["Doctor", "Nurse", "Technician", "Pharmacist", "Administrative", "Emergency Staff", "Internship", "Other"], required: true },
  department: { type: String, trim: true, maxlength: 100 },
  description: { type: String, required: true, trim: true, maxlength: 4000 },
  requirements: { type: String, trim: true, maxlength: 2000 },
  employmentType: { type: String, enum: ["full_time", "part_time", "contract", "internship"], required: true },
  location: { type: String, trim: true, maxlength: 160 },
  salaryText: { type: String, trim: true, maxlength: 100 },
  deadline: { type: Date },
  status: { type: String, enum: ["draft", "pending", "published", "closed", "rejected"], default: "draft", index: true },
  verificationStatus: { type: String, enum: ["unverified", "verified"], default: "unverified" },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  demo: { type: Boolean, default: false },
}, { timestamps: true });
schema.index({ status: 1, createdAt: -1 });
export const Job = mongoose.model("Job", schema);
