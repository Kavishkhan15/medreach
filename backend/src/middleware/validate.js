import { validationResult } from "express-validator";

// Runs after express-validator chains; short-circuits with 400 on any error.
export function validate(req, res, next) {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    return res.status(400).json({
      error: "Validation failed",
      details: result.array().map((e) => ({ field: e.path, msg: e.msg })),
    });
  }
  next();
}
