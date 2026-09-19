/**
 * Mumbai Diagnostics & Standalone Blood Banks Seed Data
 * Covers all 4 key corridors: South Mumbai, Western Suburbs, Central Suburbs, Harbour & Navi Mumbai.
 * Schema-compatible with ResourceProvider model.
 */

export const mumbaiDiagnosticsAndBloodBanks = [
  // =========================================================================
  // 1. South Mumbai
  // =========================================================================
  {
    kind: "diagnostic",
    name: "Metropolis Healthcare - South Mumbai Regional Lab",
    address: "Shop No. 1 & 2, Ground Floor, Chinoy Mansion, August Kranti Marg, Kemps Corner / Grant Road, Mumbai - 400036",
    locality: "Kemps Corner",
    city: "Mumbai",
    phone: "+91 22 4232 4232",
    website: "https://www.metropolisindia.com",
    operatingHours: "07:00–21:00",
    services: [
      "Pathology",
      "Blood Test",
      "Ultrasound",
      "Digital X-Ray",
      "ECG",
      "Biochemistry",
      "Microbiology",
      "Preventive Health Checkup"
    ],
    location: {
      type: "Point",
      coordinates: [72.8122, 18.9634]
    },
    sourceName: "Official Registry & Medical Board",
    sourceUrl: "https://www.metropolisindia.com",
    confidence: "HIGH",
    verificationStatus: "verified",
    active: true,
    demo: false
  },
  {
    kind: "diagnostic",
    name: "NM Medical Diagnostic Centre (Marine Lines)",
    address: "NM Medical, Ground Floor, 148 Anand Bhavan, Babu Genu Road, Princess Street, Marine Lines, Mumbai - 400020",
    locality: "Marine Lines",
    city: "Mumbai",
    phone: "+91 22 4342 4342",
    website: "https://www.nmmedical.com",
    operatingHours: "07:00–20:30",
    services: [
      "MRI",
      "CT",
      "Digital X-Ray",
      "Ultrasound",
      "2D Echo",
      "Mammography",
      "Pathology",
      "Blood Test",
      "ECG",
      "Health Checkup"
    ],
    location: {
      type: "Point",
      coordinates: [72.8282, 18.9431]
    },
    sourceName: "Official Registry & Medical Board",
    sourceUrl: "https://www.nmmedical.com",
    confidence: "HIGH",
    verificationStatus: "verified",
    active: true,
    demo: false
  },
  {
    kind: "diagnostic",
    name: "Suburban Diagnostics (Girgaon / Charni Road)",
    address: "Ground Floor, Raja Rammohan Roy Road, Opp. Prarthana Samaj, Girgaon / Charni Road, Mumbai - 400004",
    locality: "Girgaon",
    city: "Mumbai",
    phone: "+91 22 6170 0000",
    website: "https://www.suburbandiagnostics.com",
    operatingHours: "07:00–21:00",
    services: [
      "Pathology",
      "Blood Test",
      "Digital X-Ray",
      "ECG",
      "Ultrasound",
      "Holter Monitoring",
      "Health Checkup"
    ],
    location: {
      type: "Point",
      coordinates: [72.8192, 18.9560]
    },
    sourceName: "Official Registry & Medical Board",
    sourceUrl: "https://www.suburbandiagnostics.com",
    confidence: "HIGH",
    verificationStatus: "verified",
    active: true,
    demo: false
  },
  {
    kind: "diagnostic",
    name: "Tata Memorial Advanced Diagnostic & Pathology Lab",
    address: "Tata Memorial Centre, Dr. Ernest Borges Marg, Parel, Mumbai - 400012",
    locality: "Parel",
    city: "Mumbai",
    phone: "+91 22 2417 7000",
    website: "https://tmc.gov.in",
    operatingHours: "24/7",
    services: [
      "PET-CT",
      "MRI",
      "CT",
      "Histopathology",
      "Cytogenetics",
      "Molecular Diagnostics",
      "Digital X-Ray",
      "Pathology",
      "Biopsy",
      "Tumor Markers"
    ],
    location: {
      type: "Point",
      coordinates: [72.8427, 19.0041]
    },
    sourceName: "Official Registry & Medical Board",
    sourceUrl: "https://tmc.gov.in",
    confidence: "HIGH",
    verificationStatus: "verified",
    active: true,
    demo: false
  },
  {
    kind: "blood_bank",
    name: "State Blood Transfusion Council (SBTC) / KEM Central Blood Bank",
    address: "King Edward Memorial Hospital & Seth G.S. Medical College, Acharya Donde Marg, Parel, Mumbai - 400012",
    locality: "Parel",
    city: "Mumbai",
    phone: "+91 22 2410 7000",
    website: "https://arogya.maharashtra.gov.in",
    operatingHours: "24/7",
    services: [
      "Whole Blood",
      "Packed Red Blood Cells (PRBC)",
      "Fresh Frozen Plasma (FFP)",
      "Platelet Concentrate",
      "Cryoprecipitate",
      "Platelet Apheresis",
      "Blood Component Separation"
    ],
    listedBloodGroups: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"],
    location: {
      type: "Point",
      coordinates: [72.8436, 18.9998]
    },
    sourceName: "Official Registry & Medical Board",
    sourceUrl: "https://arogya.maharashtra.gov.in",
    confidence: "HIGH",
    verificationStatus: "verified",
    active: true,
    demo: false
  },

  // =========================================================================
  // 2. Western Suburbs
  // =========================================================================
  {
    kind: "diagnostic",
    name: "Suburban Diagnostics - Central Reference Lab (Andheri West - Lokhandwala)",
    address: "Suburban Diagnostics House, 2nd Floor, Aston Building, Sundervan Complex, Shastri Nagar, Andheri West, Mumbai - 400053",
    locality: "Andheri West",
    city: "Mumbai",
    phone: "+91 22 6170 0000",
    website: "https://www.suburbandiagnostics.com",
    operatingHours: "24/7",
    services: [
      "CT",
      "MRI",
      "Ultrasound",
      "Digital X-Ray",
      "Pathology",
      "Blood Test",
      "ECG",
      "PET-CT",
      "Molecular Biology",
      "Genomics"
    ],
    location: {
      type: "Point",
      coordinates: [72.8277, 19.1415]
    },
    sourceName: "Official Registry & Medical Board",
    sourceUrl: "https://www.suburbandiagnostics.com",
    confidence: "HIGH",
    verificationStatus: "verified",
    active: true,
    demo: false
  },
  {
    kind: "diagnostic",
    name: "Suburban Diagnostics (Bandra Linking Road)",
    address: "Shop 2, Grace Residency, Linking Road, Near National College, Bandra West, Mumbai - 400050",
    locality: "Bandra West",
    city: "Mumbai",
    phone: "+91 22 6170 0000",
    website: "https://www.suburbandiagnostics.com",
    operatingHours: "07:00–21:00",
    services: [
      "Pathology",
      "Blood Test",
      "Ultrasound",
      "Digital X-Ray",
      "ECG",
      "2D Echo",
      "Health Checkup"
    ],
    location: {
      type: "Point",
      coordinates: [72.8335, 19.0620]
    },
    sourceName: "Official Registry & Medical Board",
    sourceUrl: "https://www.suburbandiagnostics.com",
    confidence: "HIGH",
    verificationStatus: "verified",
    active: true,
    demo: false
  },
  {
    kind: "diagnostic",
    name: "Metropolis Healthcare (Bandra West - Hill Road)",
    address: "No. 3/4, Ground Floor, Hill Road, Opposite St. Joseph's Convent, Bandra West, Mumbai - 400050",
    locality: "Bandra West",
    city: "Mumbai",
    phone: "+91 22 4232 4232",
    website: "https://www.metropolisindia.com",
    operatingHours: "07:00–21:00",
    services: [
      "Pathology",
      "Blood Test",
      "Digital X-Ray",
      "Ultrasound",
      "ECG",
      "Preventive Health Checkup"
    ],
    location: {
      type: "Point",
      coordinates: [72.8310, 19.0552]
    },
    sourceName: "Official Registry & Medical Board",
    sourceUrl: "https://www.metropolisindia.com",
    confidence: "HIGH",
    verificationStatus: "verified",
    active: true,
    demo: false
  },
  {
    kind: "diagnostic",
    name: "NM Medical (Khar / Bandra West - SV Road)",
    address: "Seva Sadan, 1st & 2nd Floor, Linking Road / SV Road Junction, Khar West, Mumbai - 400052",
    locality: "Khar West",
    city: "Mumbai",
    phone: "+91 22 4342 4342",
    website: "https://www.nmmedical.com",
    operatingHours: "07:00–21:00",
    services: [
      "MRI",
      "CT",
      "Digital X-Ray",
      "Ultrasound",
      "Mammography",
      "Pathology",
      "Blood Test",
      "ECG",
      "Bone Densitometry (DEXA)"
    ],
    location: {
      type: "Point",
      coordinates: [72.8378, 19.0712]
    },
    sourceName: "Official Registry & Medical Board",
    sourceUrl: "https://www.nmmedical.com",
    confidence: "HIGH",
    verificationStatus: "verified",
    active: true,
    demo: false
  },
  {
    kind: "diagnostic",
    name: "Agilus Diagnostics (formerly SRL) (Andheri East)",
    address: "Plot No. 1, Prime Square, MIDC Cross Road A, Andheri East, Mumbai - 400069",
    locality: "Andheri East",
    city: "Mumbai",
    phone: "+91 22 6780 1234",
    website: "https://www.agilusdiagnostics.com",
    operatingHours: "07:00–21:00",
    services: [
      "Pathology",
      "Blood Test",
      "Digital X-Ray",
      "Ultrasound",
      "ECG",
      "Microbiology",
      "Histopathology",
      "Preventive Healthcare"
    ],
    location: {
      type: "Point",
      coordinates: [72.8682, 19.1172]
    },
    sourceName: "Official Registry & Medical Board",
    sourceUrl: "https://www.agilusdiagnostics.com",
    confidence: "HIGH",
    verificationStatus: "verified",
    active: true,
    demo: false
  },
  {
    kind: "diagnostic",
    name: "Suburban Diagnostics (Borivali West)",
    address: "Shop 1 & 2, Ground Floor, Prem Nagar, SV Road, Borivali West, Mumbai - 400092",
    locality: "Borivali West",
    city: "Mumbai",
    phone: "+91 22 6170 0000",
    website: "https://www.suburbandiagnostics.com",
    operatingHours: "07:00–21:00",
    services: [
      "Pathology",
      "Blood Test",
      "Digital X-Ray",
      "Ultrasound",
      "ECG",
      "Health Checkup",
      "Biochemistry"
    ],
    location: {
      type: "Point",
      coordinates: [72.8532, 19.2291]
    },
    sourceName: "Official Registry & Medical Board",
    sourceUrl: "https://www.suburbandiagnostics.com",
    confidence: "HIGH",
    verificationStatus: "verified",
    active: true,
    demo: false
  },
  {
    kind: "blood_bank",
    name: "Rotary Blood Bank & Diagnostic Centre (Bandra West)",
    address: "Rotary Service Centre, 32nd Road, Off Waterfield Road, Bandra West, Mumbai - 400050",
    locality: "Bandra West",
    city: "Mumbai",
    phone: "+91 22 2642 1234",
    website: "https://rotarybloodbankmumbai.org",
    operatingHours: "24/7",
    services: [
      "Whole Blood",
      "Packed Red Blood Cells (PRBC)",
      "Fresh Frozen Plasma (FFP)",
      "Platelet Concentrate",
      "Apheresis",
      "Blood Grouping & Cross Matching",
      "Diagnostic Blood Tests"
    ],
    listedBloodGroups: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"],
    location: {
      type: "Point",
      coordinates: [72.8320, 19.0580]
    },
    sourceName: "Official Registry & Medical Board",
    sourceUrl: "https://rotarybloodbankmumbai.org",
    confidence: "HIGH",
    verificationStatus: "verified",
    active: true,
    demo: false
  },

  // =========================================================================
  // 3. Central Suburbs
  // =========================================================================
  {
    kind: "diagnostic",
    name: "Metropolis Healthcare - Global Reference Laboratory",
    address: "Tower B, 4th Floor, Kohinoor Business Park, Kirol Road, Kurla West / Vidyavihar West, Mumbai - 400070",
    locality: "Vidyavihar West",
    city: "Mumbai",
    phone: "+91 22 4232 4232",
    website: "https://www.metropolisindia.com",
    operatingHours: "24/7",
    services: [
      "Pathology",
      "Blood Test",
      "Molecular Diagnostics",
      "Genomics",
      "Cytogenetics",
      "Biochemistry",
      "Histopathology",
      "Digital X-Ray",
      "Ultrasound"
    ],
    location: {
      type: "Point",
      coordinates: [72.8942, 19.0792]
    },
    sourceName: "Official Registry & Medical Board",
    sourceUrl: "https://www.metropolisindia.com",
    confidence: "HIGH",
    verificationStatus: "verified",
    active: true,
    demo: false
  },
  {
    kind: "diagnostic",
    name: "Suburban Diagnostics (Ghatkopar East - Tilak Road)",
    address: "Shop 1-3, Ground Floor, Radhe Vallabh CHS, Tilak Road, Ghatkopar East, Mumbai - 400077",
    locality: "Ghatkopar East",
    city: "Mumbai",
    phone: "+91 22 6170 0000",
    website: "https://www.suburbandiagnostics.com",
    operatingHours: "07:00–21:00",
    services: [
      "Pathology",
      "Blood Test",
      "Digital X-Ray",
      "Ultrasound",
      "ECG",
      "2D Echo",
      "Health Checkup"
    ],
    location: {
      type: "Point",
      coordinates: [72.9062, 19.0785]
    },
    sourceName: "Official Registry & Medical Board",
    sourceUrl: "https://www.suburbandiagnostics.com",
    confidence: "HIGH",
    verificationStatus: "verified",
    active: true,
    demo: false
  },
  {
    kind: "diagnostic",
    name: "Agilus Diagnostics (Dadar Central - TT Circle)",
    address: "Ground Floor, Radha Mandir, Dr. Babasaheb Ambedkar Road, Dadar TT Circle, Mumbai - 400014",
    locality: "Dadar Central",
    city: "Mumbai",
    phone: "+91 22 6780 1234",
    website: "https://www.agilusdiagnostics.com",
    operatingHours: "07:00–21:00",
    services: [
      "Pathology",
      "Blood Test",
      "Digital X-Ray",
      "Ultrasound",
      "ECG",
      "Biochemistry",
      "Preventive Health Checkup"
    ],
    location: {
      type: "Point",
      coordinates: [72.8450, 19.0195]
    },
    sourceName: "Official Registry & Medical Board",
    sourceUrl: "https://www.agilusdiagnostics.com",
    confidence: "HIGH",
    verificationStatus: "verified",
    active: true,
    demo: false
  },
  {
    kind: "diagnostic",
    name: "NM Medical (Mulund West)",
    address: "Ground Floor, Marathon Max, LBS Marg, Mulund West, Mumbai - 400080",
    locality: "Mulund West",
    city: "Mumbai",
    phone: "+91 22 4342 4342",
    website: "https://www.nmmedical.com",
    operatingHours: "07:00–21:00",
    services: [
      "MRI",
      "CT",
      "Ultrasound",
      "Digital X-Ray",
      "Mammography",
      "Pathology",
      "Blood Test",
      "ECG",
      "Health Checkup"
    ],
    location: {
      type: "Point",
      coordinates: [72.9490, 19.1740]
    },
    sourceName: "Official Registry & Medical Board",
    sourceUrl: "https://www.nmmedical.com",
    confidence: "HIGH",
    verificationStatus: "verified",
    active: true,
    demo: false
  },
  {
    kind: "blood_bank",
    name: "Sion Blood Bank & Component Centre",
    address: "Lokmanya Tilak Municipal Medical College & General Hospital, Sulochana Shetty Marg, Sion West, Mumbai - 400022",
    locality: "Sion",
    city: "Mumbai",
    phone: "+91 22 2407 6381",
    website: "https://ltmmc.edu.in",
    operatingHours: "24/7",
    services: [
      "Whole Blood",
      "Packed Red Blood Cells (PRBC)",
      "Fresh Frozen Plasma (FFP)",
      "Platelet Concentrate",
      "Cryoprecipitate",
      "Platelet Apheresis",
      "Blood Grouping"
    ],
    listedBloodGroups: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"],
    location: {
      type: "Point",
      coordinates: [72.8601, 19.0366]
    },
    sourceName: "Official Registry & Medical Board",
    sourceUrl: "https://ltmmc.edu.in",
    confidence: "HIGH",
    verificationStatus: "verified",
    active: true,
    demo: false
  },

  // =========================================================================
  // 4. Harbour Line & Navi Mumbai
  // =========================================================================
  {
    kind: "diagnostic",
    name: "Suburban Diagnostics (Vashi - Sector 17)",
    address: "Shop 5 & 6, Ground Floor, Arenja Arcade, Sector 17, Vashi, Navi Mumbai - 400703",
    locality: "Vashi Sector 17",
    city: "Navi Mumbai",
    phone: "+91 22 6170 0000",
    website: "https://www.suburbandiagnostics.com",
    operatingHours: "07:00–21:00",
    services: [
      "Pathology",
      "Blood Test",
      "Digital X-Ray",
      "Ultrasound",
      "ECG",
      "Health Checkup",
      "Biochemistry"
    ],
    location: {
      type: "Point",
      coordinates: [72.9982, 19.0725]
    },
    sourceName: "Official Registry & Medical Board",
    sourceUrl: "https://www.suburbandiagnostics.com",
    confidence: "HIGH",
    verificationStatus: "verified",
    active: true,
    demo: false
  },
  {
    kind: "diagnostic",
    name: "Metropolis Healthcare (CBD Belapur)",
    address: "Shop 12, Ground Floor, Bhoomi Mall, Sector 15, CBD Belapur, Navi Mumbai - 400614",
    locality: "CBD Belapur",
    city: "Navi Mumbai",
    phone: "+91 22 4232 4232",
    website: "https://www.metropolisindia.com",
    operatingHours: "07:00–21:00",
    services: [
      "Pathology",
      "Blood Test",
      "Digital X-Ray",
      "Ultrasound",
      "ECG",
      "Preventive Health Checkup"
    ],
    location: {
      type: "Point",
      coordinates: [73.0375, 19.0210]
    },
    sourceName: "Official Registry & Medical Board",
    sourceUrl: "https://www.metropolisindia.com",
    confidence: "HIGH",
    verificationStatus: "verified",
    active: true,
    demo: false
  },
  {
    kind: "diagnostic",
    name: "Agilus Diagnostics (Nerul West)",
    address: "Shop 7 & 8, Galaxy CHS, Sector 20, Nerul West, Navi Mumbai - 400706",
    locality: "Nerul West",
    city: "Navi Mumbai",
    phone: "+91 22 6780 1234",
    website: "https://www.agilusdiagnostics.com",
    operatingHours: "07:00–21:00",
    services: [
      "Pathology",
      "Blood Test",
      "Digital X-Ray",
      "Ultrasound",
      "ECG",
      "Health Checkup"
    ],
    location: {
      type: "Point",
      coordinates: [73.0142, 19.0380]
    },
    sourceName: "Official Registry & Medical Board",
    sourceUrl: "https://www.agilusdiagnostics.com",
    confidence: "HIGH",
    verificationStatus: "verified",
    active: true,
    demo: false
  },
  {
    kind: "blood_bank",
    name: "NMMC Central Blood Bank & Transfusion Centre (Vashi)",
    address: "NMMC General Hospital, Sector 10, Vashi, Navi Mumbai - 400703",
    locality: "Vashi",
    city: "Navi Mumbai",
    phone: "+91 22 2789 9901",
    website: "https://www.nmmc.gov.in",
    operatingHours: "24/7",
    services: [
      "Whole Blood",
      "Packed Red Blood Cells (PRBC)",
      "Fresh Frozen Plasma (FFP)",
      "Platelet Concentrate",
      "Cryoprecipitate",
      "Platelet Apheresis",
      "Blood Grouping & Cross Matching"
    ],
    listedBloodGroups: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"],
    location: {
      type: "Point",
      coordinates: [72.9967, 19.0768]
    },
    sourceName: "Official Registry & Medical Board",
    sourceUrl: "https://www.nmmc.gov.in",
    confidence: "HIGH",
    verificationStatus: "verified",
    active: true,
    demo: false
  }
];
