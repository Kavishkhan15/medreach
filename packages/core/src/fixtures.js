// Offline DEMO fixtures — realistic Mumbai hospitals with facility statuses and
// freshness timestamps. Clearly labelled DEMO data in the UI; never presented as
// live. Timestamps are relative to load time so freshness labels look plausible.

const min = 60 * 1000;
const hr = 60 * min;
const ago = (ms) => new Date(Date.now() - ms).toISOString();

function facility(name, status, confidence = "MEDIUM", updatedMs = 8 * min) {
  return { facility: name, status, confidence, lastUpdated: ago(updatedMs) };
}

export const fixtures = [
  {
    _id: "m1", name: "KEM Hospital", slug: "kem-hospital",
    hospitalType: "Government", locality: "Parel", city: "Mumbai", region: "South",
    address: "Acharya Donde Marg, Parel", pincode: "400012",
    phone: "+91-22-2410-7000", emergencyPhone: "102",
    location: { type: "Point", coordinates: [72.8420, 19.0000] },
    specialties: ["Emergency", "Cardiology", "Trauma", "Neurology", "General Medicine"],
    departments: ["Emergency", "Cardiology", "Trauma", "Neurology", "General Medicine"],
    verificationStatus: "verified", lastUpdated: ago(6 * min), emergencyStatus: "available",
    facilities: [
      facility("Emergency Department", "available", "HIGH", 6 * min),
      facility("ICU", "limited", "HIGH", 6 * min),
      facility("Trauma Center", "available", "MEDIUM", 12 * min),
      facility("Cardiology", "available", "HIGH", 6 * min),
      facility("CT", "available", "MEDIUM", 20 * min),
      facility("Blood Bank", "available", "MEDIUM", 30 * min),
      facility("Ambulance", "available", "MEDIUM", 15 * min),
    ],
  },
  {
    _id: "m2", name: "Lilavati Hospital", slug: "lilavati-hospital",
    hospitalType: "Trust", locality: "Bandra", city: "Mumbai", region: "West",
    address: "A-791, Bandra Reclamation", pincode: "400050",
    phone: "+91-22-2675-1000", emergencyPhone: "102",
    location: { type: "Point", coordinates: [72.8280, 19.0510] },
    specialties: ["Emergency", "Cardiology", "Neurology", "Oncology", "Surgery"],
    departments: ["Emergency", "Cardiology", "Neurology", "Oncology", "Surgery"],
    verificationStatus: "verified", lastUpdated: ago(4 * min), emergencyStatus: "available",
    facilities: [
      facility("Emergency Department", "available", "HIGH", 4 * min),
      facility("ICU", "available", "HIGH", 4 * min),
      facility("Cardiology", "available", "HIGH", 4 * min),
      facility("Neurology", "available", "MEDIUM", 10 * min),
      facility("CT", "available", "HIGH", 4 * min),
      facility("MRI", "limited", "MEDIUM", 25 * min),
      facility("Operating Theatre", "available", "MEDIUM", 15 * min),
    ],
  },
  {
    _id: "m3", name: "Sion Hospital (LTMGH)", slug: "sion-hospital",
    hospitalType: "Municipal", locality: "Sion", city: "Mumbai", region: "Central",
    address: "Sion West", pincode: "400022",
    phone: "+91-22-2407-6381", emergencyPhone: "102",
    location: { type: "Point", coordinates: [72.8620, 19.0430] },
    specialties: ["Emergency", "Trauma", "Surgery", "Pediatrics", "Maternity"],
    departments: ["Emergency", "Trauma", "Surgery", "Pediatrics", "Maternity"],
    verificationStatus: "verified", lastUpdated: ago(45 * min), emergencyStatus: "limited",
    facilities: [
      facility("Emergency Department", "available", "MEDIUM", 45 * min),
      facility("Trauma Center", "available", "MEDIUM", 45 * min),
      facility("ICU", "limited", "MEDIUM", 50 * min),
      facility("Operating Theatre", "limited", "LOW", 90 * min),
      facility("Blood Bank", "available", "MEDIUM", 40 * min),
      facility("Pediatrics", "available", "MEDIUM", 45 * min),
      facility("Maternity", "available", "MEDIUM", 45 * min),
    ],
  },
  {
    _id: "m4", name: "Hinduja Hospital", slug: "hinduja-hospital",
    hospitalType: "Trust", locality: "Mahim", city: "Mumbai", region: "West",
    address: "Veer Savarkar Marg, Mahim", pincode: "400016",
    phone: "+91-22-2445-2222", emergencyPhone: "102",
    location: { type: "Point", coordinates: [72.8400, 19.0330] },
    specialties: ["Emergency", "Cardiology", "Neurology", "Oncology"],
    departments: ["Emergency", "Cardiology", "Neurology", "Oncology"],
    verificationStatus: "verified", lastUpdated: ago(2 * hr), emergencyStatus: "limited",
    facilities: [
      facility("Emergency Department", "limited", "MEDIUM", 2 * hr),
      facility("ICU", "limited", "LOW", 3 * hr),
      facility("Cardiology", "available", "MEDIUM", 2 * hr),
      facility("MRI", "available", "MEDIUM", 90 * min),
    ],
  },
  {
    _id: "m5", name: "Nanavati Max Hospital", slug: "nanavati-max-hospital",
    hospitalType: "Private", locality: "Vile Parle", city: "Mumbai", region: "West",
    address: "SV Road, Vile Parle West", pincode: "400056",
    phone: "+91-22-2626-7500", emergencyPhone: "102",
    location: { type: "Point", coordinates: [72.8390, 19.0990] },
    specialties: ["Emergency", "Cardiology", "Burns Unit", "Surgery", "Pediatrics"],
    departments: ["Emergency", "Cardiology", "Burns Unit", "Surgery", "Pediatrics"],
    verificationStatus: "verified", lastUpdated: ago(9 * min), emergencyStatus: "available",
    facilities: [
      facility("Emergency Department", "available", "HIGH", 9 * min),
      facility("Burns Unit", "available", "MEDIUM", 20 * min),
      facility("ICU", "available", "HIGH", 9 * min),
      facility("Operating Theatre", "available", "MEDIUM", 15 * min),
      facility("Pediatrics", "available", "MEDIUM", 12 * min),
      facility("Ventilator", "limited", "MEDIUM", 15 * min),
    ],
  },
  {
    _id: "m6", name: "Kokilaben Dhirubhai Ambani Hospital", slug: "kokilaben-hospital",
    hospitalType: "Trust", locality: "Andheri", city: "Mumbai", region: "West",
    address: "Rao Saheb Achutrao Patwardhan Marg, Andheri West", pincode: "400053",
    phone: "+91-22-3099-9999", emergencyPhone: "102",
    location: { type: "Point", coordinates: [72.8290, 19.1300] },
    specialties: ["Emergency", "Cardiology", "Neurology", "Trauma", "Oncology"],
    departments: ["Emergency", "Cardiology", "Neurology", "Trauma", "Oncology"],
    verificationStatus: "verified", lastUpdated: ago(7 * hr), emergencyStatus: "available",
    facilities: [
      facility("Emergency Department", "available", "LOW", 7 * hr),
      facility("Trauma Center", "available", "LOW", 7 * hr),
      facility("ICU", "available", "LOW", 7 * hr),
      facility("CT", "available", "LOW", 7 * hr),
      facility("Neurology", "available", "LOW", 7 * hr),
    ],
  },
  {
    _id: "m7", name: "Rajawadi Hospital", slug: "rajawadi-hospital",
    hospitalType: "Municipal", locality: "Ghatkopar", city: "Mumbai", region: "East",
    address: "Ghatkopar East", pincode: "400077",
    phone: "+91-22-2509-1631", emergencyPhone: "102",
    location: { type: "Point", coordinates: [72.9081, 19.0864] },
    specialties: ["Emergency", "General Medicine", "Maternity", "Pediatrics"],
    departments: ["Emergency", "General Medicine", "Maternity", "Pediatrics"],
    verificationStatus: "pending", lastUpdated: ago(30 * min), emergencyStatus: "limited",
    facilities: [
      facility("Emergency Department", "limited", "MEDIUM", 30 * min),
      facility("Maternity", "available", "MEDIUM", 30 * min),
      facility("Pediatrics", "limited", "LOW", 40 * min),
      facility("Blood Bank", "unknown", "UNKNOWN", 0),
    ],
  },
  {
    _id: "m8", name: "Powai Multispeciality Hospital", slug: "powai-multispeciality",
    hospitalType: "Private", locality: "Powai", city: "Mumbai", region: "East",
    address: "Hiranandani Gardens, Powai", pincode: "400076",
    phone: "+91-22-2570-0000", emergencyPhone: "102",
    location: { type: "Point", coordinates: [72.9050, 19.1176] },
    specialties: ["Emergency", "Cardiology", "Respiratory", "General Medicine"],
    departments: ["Emergency", "Cardiology", "Respiratory", "General Medicine"],
    verificationStatus: "unverified", lastUpdated: null, emergencyStatus: "closed",
    facilities: [
      facility("Emergency Department", "unknown", "UNKNOWN", 0),
      facility("ICU", "unknown", "UNKNOWN", 0),
      facility("Ventilator", "unknown", "UNKNOWN", 0),
    ],
  },
];

// Legacy filter helper retained for backward compatibility with older callers.
export function filterFixtures(list, { q, region, status, specialty } = {}) {
  return list.filter((h) => {
    if (region && h.region !== region) return false;
    if (status && h.emergencyStatus !== status) return false;
    if (specialty && !(h.departments || []).includes(specialty)) return false;
    if (q) {
      const hay = `${h.name} ${h.city} ${(h.departments || []).join(" ")}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });
}
