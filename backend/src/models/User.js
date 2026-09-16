import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { ROLE_VALUES, ROLES, ACCOUNT_STATUS, ADMIN_ROLES } from "../config/constants.js";

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Invalid email"],
    },
    // select:false → never returned unless explicitly requested (login only).
    passwordHash: { type: String, required: true, select: false },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    role: { type: String, enum: ROLE_VALUES, default: ROLES.USER },
    accountStatus: { type: String, enum: ACCOUNT_STATUS, default: "active" },
    lastLogin: { type: Date },
    emailVerifiedAt: { type: Date },
    // Minimal profile only — NO medical data stored (privacy-by-design, scope §3.2).
    emergencyContact: { type: String, trim: true, maxlength: 120 },
    region: { type: String, trim: true, index: true },
    savedHospitals: [{ type: mongoose.Schema.Types.ObjectId, ref: "Hospital" }],
  },
  { timestamps: true }
);

userSchema.methods.setPassword = async function (plain) {
  this.passwordHash = await bcrypt.hash(plain, 10);
};

userSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

// True for any administrator role (new roles + legacy "admin").
userSchema.virtual("isAdmin").get(function () {
  return ADMIN_ROLES.includes(this.role);
});

// Strip sensitive/internal fields from any JSON representation.
userSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  },
});

export const User = mongoose.model("User", userSchema);
