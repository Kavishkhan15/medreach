// AI Assistant constants — framework-free, zero CSS classes.
// Shared across all MedReach frontends.

export const ASSISTANT_ENTRY_LABEL = "MedReach Healthcare Assistant";
export const ASSISTANT_ENTRY_SUBTITLE = "Smart navigation, emergency guidance, blood, beds & ambulances";

export const ASSISTANT_CHAT_TITLE = "MedReach Healthcare Assistant";
export const ASSISTANT_CHAT_SUBTITLE = "Verified Mumbai Care Network · 24/7 Guidance";

export const ASSISTANT_DISCLAIMER =
  "MedReach Assistant connects you with verified Mumbai facilities and real-time operational data. " +
  "It does not provide medical diagnoses or prescriptions. For life-threatening emergencies, call 112 or 108 immediately.";

export const ASSISTANT_UNAVAILABLE_MESSAGE =
  "MedReach Assistant is temporarily connecting. For immediate emergency help, call 112 or 108.";

// Suggested category prompts for rapid exploration
export const ASSISTANT_CATEGORIES = [
  { id: "emergency", label: "Emergency Care", prompt: "Find nearest emergency hospital" },
  { id: "hospitals", label: "Hospitals", prompt: "Find multi-specialty hospitals near me" },
  { id: "urgent_blood", label: "Urgent Blood", prompt: "I need urgent blood supply (6h - 2d)" },
  { id: "blood_banks", label: "Blood Banks", prompt: "Find verified blood banks near me" },
  { id: "ambulances", label: "Ambulances", prompt: "I need an ambulance with ICU support" },
  { id: "diagnostics", label: "Diagnostics", prompt: "Show diagnostic centres for MRI and CT scans" },
  { id: "beds", label: "Hospital Beds", prompt: "I need a hospital bed request" },
  { id: "careers", label: "Healthcare Jobs", prompt: "Find hospital job vacancies in Mumbai" },
];

// Quick action chips shown in the empty chat state
export const ASSISTANT_QUICK_ACTIONS = [
  "🚨 Find nearest emergency hospital",
  "🩸 I need O+ blood urgently",
  "🚑 Book an ambulance in Bandra",
  "🏥 Cardiac hospital near Andheri",
  "🔬 Diagnostic scan centers in Ghatkopar",
  "🛏️ Hospital bed request guidance",
  "💼 Nursing and doctor jobs in Mumbai",
];

// Action types emitted in suggestedActions payloads
export const ASSISTANT_ACTIONS = {
  CALL: "call",
  NAVIGATE: "navigate",
  EMERGENCY_BED: "emergency_bed",
  ROUTINE_BED: "routine_bed",
  URGENT_BLOOD: "urgent_blood",
  REQUEST_BLOOD: "request_blood",
  BOOK_AMBULANCE: "book_ambulance",
  VIEW_HOSPITAL: "view_hospital",
  VIEW_JOB: "view_job",
  VIEW_DIRECTORY: "view_directory",
};

export const ASSISTANT_LOCALITY_PROMPT = "Which Mumbai area are you in? (e.g. Andheri, Bandra, Dadar, Powai)";
