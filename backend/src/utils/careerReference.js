import { randomBytes } from "node:crypto";

// Separate namespaces keep job and organization references unique across collections.
export const generateCareerReference = (namespace) =>
  `CAR-${namespace}${randomBytes(7).toString("hex").toUpperCase()}`;

export async function createCareerApplication(model, payload) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await model.create(payload);
    } catch (error) {
      if (error?.code !== 11000 || !error.keyPattern?.reference || attempt === 4) throw error;
    }
  }
}

export async function careerSubmission(application) {
  let reference = application.reference;
  // Defaults are also supplied when reading old records; persist before sharing.
  if (!reference || application.$isDefault("reference")) {
    reference ||= generateCareerReference(application.constructor.modelName === "JobApplication" ? "J" : "O");
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await application.constructor.collection.updateOne({ _id: application._id, reference: { $exists: false } },
          { $set: { reference } });
        const stored = await application.constructor.findById(application._id).select("reference");
        reference = stored.reference;
        break;
      } catch (error) {
        if (error?.code !== 11000 || !error.keyPattern?.reference || attempt === 4) throw error;
        reference = generateCareerReference(reference[4]);
      }
    }
  }
  const result = application.toJSON();
  result.reference = reference;
  delete result._id;
  return result;
}
