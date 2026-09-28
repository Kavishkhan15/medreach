export const PHONE_PATTERN = /^\+?[0-9][0-9 ()-]{6,24}$/;

export const applicationValidators = (body) => [
  body("contactEmail").optional({ checkFalsy: true }).trim().toLowerCase().isEmail(),
  body("email").optional({ checkFalsy: true }).trim().toLowerCase().isEmail(),
  body("contactPhone").optional({ checkFalsy: true }).trim().matches(PHONE_PATTERN),
  body("phone").optional({ checkFalsy: true }).trim().matches(PHONE_PATTERN),
  body("experienceYears").optional().isFloat({ min: 0, max: 70 }).toFloat(),
  body("experience").optional().isFloat({ min: 0, max: 70 }).toFloat(),
  body("resume.fileSize").optional().isInt({ min: 0, max: 10 * 1024 * 1024 }).toInt(),
];
