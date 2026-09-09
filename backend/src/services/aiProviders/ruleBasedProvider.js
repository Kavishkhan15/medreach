// Default, zero-config AI provider. Deterministic template responses built
// ONLY from real data already fetched by assistantService — never invents
// hospitals, beds, or availability. This is what makes the assistant work
// out of the box with no external AI service configured at all, and it is
// also the guaranteed-safe fallback if an external provider errors.

const EMERGENCY_OPENER =
  "Call 112 immediately. I can also help you find the nearest emergency hospital.";

const GENERAL_HELP =
  "I can help you find hospitals, check facility types, or connect you to emergency services. " +
  "Try asking things like \"Find cardiac hospitals near Andheri\" or \"ICU hospitals near Bandra\".";

function formatHospitalLine(h, index) {
  const distance = h.distanceKm != null ? `${h.distanceKm.toFixed(1)} km` : null;
  const facilityBits = (h.matchedFacilities || []).slice(0, 2).join(", ");
  const meta = [distance, facilityBits].filter(Boolean).join(" • ");
  return `${index + 1}. ${h.name}${meta ? `\n   ${meta}` : ""}`;
}

function formatHospitalList(hospitals) {
  if (!hospitals?.length) {
    return "I couldn't find a matching hospital in MedReach's current data for that area or specialty.";
  }
  const lines = hospitals.slice(0, 3).map(formatHospitalLine);
  return `Here are ${lines.length} nearby hospitals from MedReach's records:\n\n${lines.join("\n\n")}`;
}

function formatFacilityDetail(h) {
  if (!h.facilityDetail) return "";
  const { facility, status, confidence, retrievedAtRelative } = h.facilityDetail;
  const availability = status === "unknown" ? "Current availability is unknown." : `Status: ${status}.`;
  const parts = [`${facility} facility: reported by source.`, availability];
  if (confidence) parts.push(`Confidence: ${confidence}.`);
  if (retrievedAtRelative) parts.push(`Retrieved ${retrievedAtRelative}.`);
  return "\n" + parts.join(" ");
}

export async function generateReply(context) {
  const { intent, hospitals = [], locality } = context;

  if (intent === "emergency") {
    return { text: EMERGENCY_OPENER, source: "rule_based" };
  }

  if (intent === "hospital_search") {
    if (!hospitals.length && !locality) {
      return {
        text: "Which Mumbai area are you in? I can look for nearby hospitals once I know your locality.",
        source: "rule_based",
      };
    }
    const body = formatHospitalList(hospitals);
    const detail = hospitals[0] ? formatFacilityDetail(hospitals[0]) : "";
    return { text: `${body}${detail}`, source: "rule_based" };
  }

  return { text: GENERAL_HELP, source: "rule_based" };
}
