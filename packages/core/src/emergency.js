// Emergency categories and the deterministic capabilities each one needs.
// This is NOT diagnosis and NOT medical advice — it is a transparent mapping
// used only to rank which hospitals are most likely relevant for discovery.

export const EMERGENCY_CATEGORIES = [
  {
    id: "cardiac",
    label: "Cardiac",
    icon: "cardiac",
    description: "Chest pain, heart attack, cardiac arrest",
    specialties: ["Cardiology", "Emergency"],
    facilities: ["Emergency Department", "ICU", "Cardiology"],
  },
  {
    id: "stroke",
    label: "Stroke",
    icon: "stroke",
    description: "Face drooping, arm weakness, speech difficulty",
    specialties: ["Neurology", "Emergency"],
    facilities: ["Emergency Department", "CT", "ICU", "Neurology"],
  },
  {
    id: "trauma",
    label: "Trauma",
    icon: "trauma",
    description: "Serious injury, accident, major bleeding",
    specialties: ["Trauma", "Surgery", "Emergency"],
    facilities: ["Trauma Center", "Emergency Department", "Operating Theatre", "Blood Bank"],
  },
  {
    id: "burns",
    label: "Burns",
    icon: "burns",
    description: "Severe or widespread burns",
    specialties: ["Emergency", "Surgery"],
    facilities: ["Burns Unit", "Emergency Department", "ICU"],
  },
  {
    id: "respiratory",
    label: "Respiratory",
    icon: "respiratory",
    description: "Severe breathing difficulty",
    specialties: ["Emergency", "General Medicine"],
    facilities: ["Emergency Department", "ICU", "Ventilator"],
  },
  {
    id: "pediatric",
    label: "Pediatric",
    icon: "pediatric",
    description: "Emergency involving an infant or child",
    specialties: ["Pediatrics", "Emergency"],
    facilities: ["Pediatrics", "Emergency Department"],
  },
  {
    id: "maternity",
    label: "Maternity",
    icon: "maternity",
    description: "Labour, pregnancy emergency",
    specialties: ["Maternity", "Emergency"],
    facilities: ["Maternity", "Emergency Department", "Operating Theatre"],
  },
  {
    id: "general",
    label: "General emergency",
    icon: "general",
    description: "Any other urgent situation",
    specialties: ["Emergency", "General Medicine"],
    facilities: ["Emergency Department"],
  },
];

export function emergencyCategory(id) {
  return EMERGENCY_CATEGORIES.find((c) => c.id === id) ?? null;
}
