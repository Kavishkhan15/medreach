// Assistant service — Intent detection, tool execution, and context building
// with deterministic intent classification and REAL MongoDB queries only.

import {
  searchHospitals,
  searchBloodBanks,
  searchDiagnostics,
  searchAmbulances,
  searchJobs,
} from "./assistantTools.js";
import { getAiProvider } from "./aiProviders/index.js";

// Emergency categories matching packages/core/src/emergency.js
const EMERGENCY_CATEGORY_KEYWORDS = {
  cardiac: { keywords: ["cardiac", "heart", "chest pain", "cardiology"], specialties: ["Cardiology"], facilities: ["Cardiology", "ICU"] },
  stroke: { keywords: ["stroke", "neuro", "brain"], specialties: ["Neurology"], facilities: ["Neurology", "CT", "ICU"] },
  trauma: { keywords: ["trauma", "accident", "injury", "bleeding"], specialties: ["Trauma", "Surgery"], facilities: ["Trauma Center", "Blood Bank"] },
  burns: { keywords: ["burn", "burns"], specialties: ["Surgery"], facilities: ["Burns Unit"] },
  respiratory: { keywords: ["breath", "respiratory", "asthma", "oxygen"], specialties: ["General Medicine"], facilities: ["Ventilator", "ICU"] },
  pediatric: { keywords: ["child", "infant", "baby", "pediatric", "paediatric"], specialties: ["Pediatrics"], facilities: ["Pediatrics"] },
  maternity: { keywords: ["pregnan", "labour", "labor", "maternity", "delivery"], specialties: ["Maternity"], facilities: ["Maternity", "Operating Theatre"] },
  icu: { keywords: ["icu", "intensive care", "critical care"], specialties: [], facilities: ["ICU"] },
};

// Deterministic, keyword-based emergency detection — checked FIRST and ALWAYS wins.
const EMERGENCY_KEYWORDS = [
  "unconscious", "not breathing", "not responding", "collapsed", "seizure",
  "severe bleeding", "heavy bleeding", "chest pain", "heart attack", "stroke",
  "can't breathe", "cannot breathe", "choking", "overdose", "suicide",
  "dying", "critical condition", "unresponsive", "cardiac arrest",
];

export const MUMBAI_LOCALITIES = [
  "Andheri", "Bandra", "Powai", "Dadar", "Worli", "Goregaon", "Malad",
  "Borivali", "Kurla", "Ghatkopar", "Chembur", "Thane", "Navi Mumbai",
  "Colaba", "Juhu", "Kandivali", "Mulund", "Sion", "Vashi",
];

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"];

export function detectEmergencyIntent(message) {
  const lower = (message || "").toLowerCase();
  return EMERGENCY_KEYWORDS.some((kw) => lower.includes(kw));
}

export function detectLocality(message) {
  const lower = (message || "").toLowerCase();
  return MUMBAI_LOCALITIES.find((loc) => lower.includes(loc.toLowerCase())) || null;
}

export function detectBloodGroup(message) {
  const upper = (message || "").toUpperCase();
  // Match blood groups like O+, O-, A+, etc. with word boundaries
  for (const bg of ["AB+", "AB-", "A+", "A-", "B+", "B-", "O+", "O-"]) {
    const escaped = bg.replace("+", "\\+");
    const regex = new RegExp(`(?:\\b|\\s)${escaped}(?:\\b|\\s|$)`, "i");
    if (regex.test(upper)) return bg;
  }
  return null;
}

export function detectCategory(message) {
  const lower = (message || "").toLowerCase();
  for (const [id, def] of Object.entries(EMERGENCY_CATEGORY_KEYWORDS)) {
    if (def.keywords.some((kw) => lower.includes(kw))) return { id, ...def };
  }
  return null;
}

export function detectBloodIntent(message) {
  const lower = (message || "").toLowerCase();
  // Blood tests / lab tests belong to diagnostic intent
  if (lower.includes("blood test") || lower.includes("lab test")) {
    return null;
  }
  const bloodKeywords = [
    "blood bank", "blood banks", "platelet", "platelets", "donate blood",
    "blood donation", "blood unit", "blood units", "blood request", "plasma", "transfusion",
  ];
  const hasBloodGroup = detectBloodGroup(message) !== null;
  const hasBloodWord = lower.includes("blood") && (hasBloodGroup || lower.includes("urgent") || lower.includes("need") || lower.includes("require") || lower.includes("donor") || lower.includes("supply") || lower.includes("give") || lower.includes("get"));

  if (!bloodKeywords.some((kw) => lower.includes(kw)) && !hasBloodGroup && !hasBloodWord) {
    return null;
  }

  const urgentKeywords = ["urgent", "emergency", "urgently", "immediately", "asap", "need blood fast", "critical"];
  if (urgentKeywords.some((kw) => lower.includes(kw))) {
    return "urgent_blood";
  }
  return "blood_bank_search";
}

export function detectAmbulanceIntent(message) {
  const lower = (message || "").toLowerCase();
  const ambulanceKeywords = [
    "ambulance", "patient transport", "medical transit", "transit vehicle",
    "book ambulance", "call ambulance", "icu mobile",
  ];
  if (ambulanceKeywords.some((kw) => lower.includes(kw))) {
    return true;
  }
  // Word boundaries so 'als' does not match 'hospitals'
  return /\bals\b/i.test(message) || /\bbls\b/i.test(message);
}

export function detectDiagnosticIntent(message) {
  const lower = (message || "").toLowerCase();
  const diagnosticKeywords = ["diagnostic", "mri", "ct scan", "ultrasound", "x-ray", "xray", "pathology", "blood test", "lab test", "biopsy", "ecg", "sonography"];
  return diagnosticKeywords.some((kw) => lower.includes(kw));
}

export function detectBedIntent(message) {
  const lower = (message || "").toLowerCase();
  const bedKeywords = ["bed", "admit", "admission", "icu bed", "bed vacancy", "bed request", "hospital bed", "bed availability"];
  return bedKeywords.some((kw) => lower.includes(kw));
}

export function detectJobIntent(message) {
  const lower = (message || "").toLowerCase();
  const jobKeywords = ["job", "jobs", "career", "careers", "vacancy", "vacancies", "hiring", "nurse job", "doctor vacancy", "medical staffing", "work at hospital"];
  return jobKeywords.some((kw) => lower.includes(kw));
}

const HOSPITAL_SEARCH_KEYWORDS = ["hospital", "find", "near", "nearest", "search", "where", "doctor", "clinic"];

export function detectHospitalSearchIntent(message) {
  const lower = (message || "").toLowerCase();
  return HOSPITAL_SEARCH_KEYWORDS.some((kw) => lower.includes(kw)) || detectCategory(message) != null;
}

// Classifies the message into specific action-oriented intents.
// EMERGENCY IS CHECKED FIRST AND ALWAYS WINS.
export function classifyIntent(message) {
  if (detectEmergencyIntent(message)) return "emergency";

  const bloodIntent = detectBloodIntent(message);
  if (bloodIntent) return bloodIntent;

  if (detectAmbulanceIntent(message)) return "ambulance_search";
  if (detectDiagnosticIntent(message)) return "diagnostic_search";
  if (detectBedIntent(message)) return "bed_request";
  if (detectJobIntent(message)) return "career_search";
  if (detectHospitalSearchIntent(message)) return "hospital_search";

  return "general";
}

// Builds the full context object with real database data from assistantTools
export async function buildContext(message, { origin, locality: providedLocality } = {}) {
  const intent = classifyIntent(message);
  const locality = providedLocality || detectLocality(message);
  const category = detectCategory(message);
  const bloodGroup = detectBloodGroup(message);

  let hospitals = [];
  let bloodBanks = [];
  let diagnostics = [];
  let ambulances = [];
  let jobs = [];
  let suggestedActions = [];
  let suggestedPrompts = [];

  switch (intent) {
    case "emergency": {
      hospitals = await searchHospitals({ locality, category, emergencyOnly: true, limit: 3, origin });
      suggestedActions = [
        { type: "call", label: "Call 112 (Emergency)", phone: "112", primary: true },
        { type: "call", label: "Call 108 (Ambulance)", phone: "108" },
        { type: "emergency_bed", label: "Request Emergency Bed", url: "/emergency" },
      ];
      suggestedPrompts = [
        "Where is the nearest cardiac ICU?",
        "I need an ambulance immediately",
        "Trauma centers near me",
      ];
      break;
    }
    case "urgent_blood": {
      bloodBanks = await searchBloodBanks({ locality, bloodGroup, limit: 4, origin });
      suggestedActions = [
        { type: "urgent_blood", label: "Submit Urgent Blood Requirement (6h - 2d)", url: "/urgent-blood", primary: true },
        { type: "call", label: "Emergency Helpline 108", phone: "108" },
      ];
      suggestedPrompts = [
        "Find O+ blood banks in Bandra",
        "How fast can urgent blood be fulfilled?",
        "Blood banks in Dadar",
      ];
      break;
    }
    case "blood_bank_search": {
      bloodBanks = await searchBloodBanks({ locality, bloodGroup, limit: 4, origin });
      suggestedActions = [
        { type: "urgent_blood", label: "Need Urgent Blood? Open Urgent Flow", url: "/urgent-blood" },
        { type: "request_blood", label: "Explore Blood Banks Directory", url: "/blood-banks" },
      ];
      suggestedPrompts = [
        "Blood banks near Andheri",
        "Find O- blood banks",
        "I want to donate blood",
      ];
      break;
    }
    case "ambulance_search": {
      ambulances = await searchAmbulances({ locality, limit: 4, origin });
      suggestedActions = [
        { type: "call", label: "Call 108 Medical Transit", phone: "108", primary: true },
        { type: "call", label: "Call 112 Emergency", phone: "112" },
      ];
      suggestedPrompts = [
        "Ambulance in Bandra with ICU",
        "Cardiac emergency ambulance",
        "Book ambulance from Andheri",
      ];
      break;
    }
    case "diagnostic_search": {
      diagnostics = await searchDiagnostics({ locality, limit: 4, origin });
      suggestedActions = [
        { type: "view_directory", label: "View Diagnostic Directory", url: "/diagnostics" },
      ];
      suggestedPrompts = [
        "MRI and CT scan centers in Ghatkopar",
        "Pathology labs near Dadar",
        "Diagnostic centers in Borivali",
      ];
      break;
    }
    case "bed_request": {
      hospitals = await searchHospitals({ locality, category, limit: 3, origin });
      suggestedActions = [
        { type: "emergency_bed", label: "Emergency Bed Request (No Login)", url: "/emergency", primary: true },
        { type: "routine_bed", label: "Routine Bed Request (Login Required)", url: "/requests/new" },
      ];
      suggestedPrompts = [
        "Emergency ICU bed in South Mumbai",
        "Pediatric hospital bed",
        "Check bed vacancy near Andheri",
      ];
      break;
    }
    case "career_search": {
      jobs = await searchJobs({ locality, limit: 4 });
      suggestedActions = [
        { type: "view_careers", label: "Browse MedReach Careers", url: "/careers" },
      ];
      suggestedPrompts = [
        "Nursing jobs in Mumbai",
        "Doctor vacancies in Bandra",
        "Hospital technician openings",
      ];
      break;
    }
    case "hospital_search": {
      hospitals = await searchHospitals({ locality, category, limit: 3, origin });
      suggestedActions = [
        { type: "view_directory", label: "Browse All Mumbai Hospitals", url: "/hospitals" },
        { type: "view_map", label: "Open Interactive Care Map", url: "/map" },
      ];
      suggestedPrompts = [
        "Cardiac emergency hospital in Andheri",
        "Maternity hospitals in Bandra",
        "Trauma centers near Dadar",
      ];
      break;
    }
    default: {
      suggestedActions = [
        { type: "emergency", label: "Emergency Care", url: "/emergency" },
        { type: "hospitals", label: "Find Hospitals", url: "/hospitals" },
        { type: "blood", label: "Blood Banks", url: "/blood-banks" },
        { type: "ambulance", label: "Ambulances", url: "/ambulances" },
        { type: "map", label: "Interactive Map", url: "/map" },
      ];
      suggestedPrompts = [
        "Find cardiac emergency hospital near Andheri",
        "I need O+ blood urgently",
        "Book an ambulance in Bandra",
        "Diagnostic centres in Ghatkopar",
      ];
      break;
    }
  }

  return {
    message,
    intent,
    hospitals,
    bloodBanks,
    diagnostics,
    ambulances,
    jobs,
    locality,
    category: category?.id ?? null,
    bloodGroup,
    suggestedActions,
    suggestedPrompts,
  };
}

// Orchestrates context building, AI/rule-based synthesis, and fallback
export async function getAssistantReply(message, options = {}) {
  const context = await buildContext(message, options);
  const provider = getAiProvider();
  try {
    const reply = await provider.generateReply(context);
    return {
      text: reply.text,
      intent: context.intent,
      source: reply.source || "ai",
      hospitals: context.hospitals,
      bloodBanks: context.bloodBanks,
      diagnostics: context.diagnostics,
      ambulances: context.ambulances,
      jobs: context.jobs,
      suggestedActions: context.suggestedActions,
      suggestedPrompts: context.suggestedPrompts,
      locality: context.locality,
      category: context.category,
      bloodGroup: context.bloodGroup,
    };
  } catch (err) {
    const { generateReply: ruleBasedReply } = await import("./aiProviders/ruleBasedProvider.js");
    const reply = await ruleBasedReply(context);
    return {
      text: reply.text,
      intent: context.intent,
      source: "rule_based",
      hospitals: context.hospitals,
      bloodBanks: context.bloodBanks,
      diagnostics: context.diagnostics,
      ambulances: context.ambulances,
      jobs: context.jobs,
      suggestedActions: context.suggestedActions,
      suggestedPrompts: context.suggestedPrompts,
      locality: context.locality,
      category: context.category,
      bloodGroup: context.bloodGroup,
      providerFallback: true,
    };
  }
}
