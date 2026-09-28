// Default, zero-config AI provider.
// Deterministic template responses built ONLY from real data assembled by assistantService.
// Never invents hospitals, blood units, beds, or availability.

const EMERGENCY_OPENER =
  "Call 112 or 108 immediately. In a life-threatening medical emergency, professional emergency services must be contacted right away. " +
  "MedReach does not dispatch ambulances directly, but here are the nearest verified emergency hospitals:";

const GENERAL_HELP =
  "I am your MedReach Healthcare Assistant for Mumbai. I can help you with:\n" +
  "• Emergency acute care & trauma hospitals (Lead with 112 / 108)\n" +
  "• Urgent blood requirements (6h – 2d turnaround) & blood banks\n" +
  "• Ambulance provider discovery & booking guidance\n" +
  "• Diagnostic centers for MRI, CT scan, & pathology tests\n" +
  "• Hospital bed requests (Emergency vs Routine)\n" +
  "• Healthcare careers & hospital job openings\n\n" +
  "Try asking: \"Find cardiac hospitals near Andheri\", \"I need O+ blood urgently\", or \"Book an ambulance in Bandra\".";

function formatHospitalLine(h, index) {
  const distance = h.distanceKm != null ? `${h.distanceKm.toFixed(1)} km` : null;
  const facilityBits = (h.matchedFacilities || []).slice(0, 2).join(", ");
  const phone = h.phone ? `Phone: ${h.phone}` : null;
  const meta = [distance, facilityBits, phone].filter(Boolean).join(" • ");
  return `${index + 1}. ${h.name}${meta ? `\n   ${meta}` : ""}`;
}

function formatHospitalList(hospitals) {
  if (!hospitals?.length) {
    return "I couldn't find a matching hospital in MedReach's current verified records for that area or specialty.";
  }
  const lines = hospitals.slice(0, 3).map(formatHospitalLine);
  return `Here are ${lines.length} nearby verified hospitals from MedReach's network:\n\n${lines.join("\n\n")}`;
}

function formatBloodBankList(bloodBanks, bloodGroup) {
  if (!bloodBanks?.length) {
    return "No registered blood banks found matching the criteria in MedReach's current records.";
  }
  const lines = bloodBanks.slice(0, 3).map((b, i) => {
    const distance = b.distanceKm != null ? `${b.distanceKm.toFixed(1)} km` : null;
    const phone = b.phone ? `Phone: ${b.phone}` : null;
    const groups = b.listedBloodGroups?.length ? `Groups: ${b.listedBloodGroups.join(", ")}` : null;
    const meta = [b.locality, distance, groups, phone].filter(Boolean).join(" • ");
    return `${i + 1}. ${b.name}${meta ? `\n   ${meta}` : ""}`;
  });
  const bgNote = bloodGroup ? ` for blood group ${bloodGroup}` : "";
  return `Here are verified blood banks${bgNote}:\n\n${lines.join("\n\n")}`;
}

function formatAmbulanceList(ambulances) {
  if (!ambulances?.length) {
    return "No specific ambulance providers found in that area. For immediate emergency transit, please dial 108 or 112.";
  }
  const lines = ambulances.slice(0, 3).map((a, i) => {
    const type = a.providerType || "Emergency Transit";
    const phone = a.phone ? `Phone: ${a.phone}` : "Dial 108";
    const coverage = a.coverageArea ? `Coverage: ${a.coverageArea}` : null;
    const meta = [a.locality, type, coverage, phone].filter(Boolean).join(" • ");
    return `${i + 1}. ${a.name}${meta ? `\n   ${meta}` : ""}`;
  });
  return `Here are verified ambulance services in Mumbai:\n\n${lines.join("\n\n")}\n\nYou can click "Book Ambulance" on any provider below to arrange medical transit.`;
}

function formatDiagnosticList(diagnostics) {
  if (!diagnostics?.length) {
    return "No diagnostic centers found matching that search in MedReach's verified records.";
  }
  const lines = diagnostics.slice(0, 3).map((d, i) => {
    const distance = d.distanceKm != null ? `${d.distanceKm.toFixed(1)} km` : null;
    const services = d.services?.length ? `Services: ${d.services.slice(0, 3).join(", ")}` : null;
    const phone = d.phone ? `Phone: ${d.phone}` : null;
    const meta = [d.locality, distance, services, phone].filter(Boolean).join(" • ");
    return `${i + 1}. ${d.name}${meta ? `\n   ${meta}` : ""}`;
  });
  return `Here are verified diagnostic & scan centers:\n\n${lines.join("\n\n")}`;
}

function formatJobList(jobs) {
  if (!jobs?.length) {
    return "There are currently no active job vacancies matching that specialty. Check back soon or visit the Careers page.";
  }
  const lines = jobs.slice(0, 3).map((j, i) => {
    const meta = [j.hospitalName, j.department, j.location].filter(Boolean).join(" • ");
    return `${i + 1}. ${j.title}\n   ${meta}`;
  });
  return `Here are active healthcare openings:\n\n${lines.join("\n\n")}\n\nClick "View & Apply" on any position below to submit your application.`;
}

export async function generateReply(context) {
  const {
    intent,
    hospitals = [],
    bloodBanks = [],
    ambulances = [],
    diagnostics = [],
    jobs = [],
    locality,
    bloodGroup,
  } = context;

  if (intent === "emergency") {
    const body = hospitals.length > 0 ? formatHospitalList(hospitals) : "";
    return {
      text: `${EMERGENCY_OPENER}\n\n${body}`.trim(),
      source: "rule_based",
    };
  }

  if (intent === "urgent_blood") {
    const intro =
      "For urgent blood requirements, MedReach provides a dedicated Urgent Blood flow with 6h, 12h, 18h, 24h, and 2-day delivery options without requiring an account.";
    const list = formatBloodBankList(bloodBanks, bloodGroup);
    return {
      text: `${intro}\n\n${list}\n\nYou can record an urgent blood requirement below, then call listed blood banks directly to confirm inventory and fulfillment.`,
      source: "rule_based",
    };
  }

  if (intent === "blood_bank_search") {
    const list = formatBloodBankList(bloodBanks, bloodGroup);
    return {
      text: `${list}\n\nNote: Routine blood unit requests require account login. For life-critical emergencies, use the Urgent Blood flow.`,
      source: "rule_based",
    };
  }

  if (intent === "ambulance_search") {
    return {
      text: formatAmbulanceList(ambulances),
      source: "rule_based",
    };
  }

  if (intent === "diagnostic_search") {
    return {
      text: formatDiagnosticList(diagnostics),
      source: "rule_based",
    };
  }

  if (intent === "bed_request") {
    const explanation =
      "MedReach distinguishes between two types of bed requests:\n" +
      "1. Emergency Bed Requests: No login required (guest allowed). Direct acute care routing via Emergency Mode.\n" +
      "2. Routine Hospital Bed Requests: Login required. Used for scheduled admissions or standard inpatient care.\n\n" +
      "Here are verified hospitals with bed and ICU facilities:";
    const list = formatHospitalList(hospitals);
    return {
      text: `${explanation}\n\n${list}`,
      source: "rule_based",
    };
  }

  if (intent === "career_search") {
    return {
      text: formatJobList(jobs),
      source: "rule_based",
    };
  }

  if (intent === "hospital_search") {
    if (!hospitals.length && !locality) {
      return {
        text: "Which Mumbai area are you in? (e.g. Andheri, Bandra, Dadar, Powai, Borivali). I will look up verified nearby hospitals once I know your location.",
        source: "rule_based",
      };
    }
    return {
      text: formatHospitalList(hospitals),
      source: "rule_based",
    };
  }

  return { text: GENERAL_HELP, source: "rule_based" };
}
