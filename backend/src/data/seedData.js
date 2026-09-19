// Deterministic seed fixtures for Mumbai metropolitan healthcare network.
// Coordinates are strict GeoJSON [longitude, latitude]. Slugs are explicit and stable.

import { mumbaiHospitals } from "./mumbaiHospitalsSeed.js";
import { mumbaiDiagnosticsAndBloodBanks } from "./mumbaiDiagnosticsSeed.js";

export { mumbaiHospitals, mumbaiDiagnosticsAndBloodBanks };
export const hospitals = mumbaiHospitals;

export const adminSeed = {
  email: "admin@medreach.test",
  name: "Ada Admin",
  password: "Admin1234",
  region: "South Mumbai",
};

export const userSeed = {
  email: "user@medreach.test",
  name: "Uma User",
  password: "User1234",
  region: "Central Suburbs",
  emergencyContact: "+91-98200-12345",
};

export const bloodCampaignsSeed = [
  {
    name: "Red Cross Mega Blood Donation Drive",
    organizer: "Indian Red Cross Society & KEM Hospital",
    location: "KEM Hospital Campus, Parel, Mumbai",
    date: new Date(Date.now() + 86400000 * 2),
    endDate: new Date(Date.now() + 86400000 * 3),
    bloodGroups: ["All", "O+", "A+", "B+", "AB+", "O-", "A-", "B-", "AB-"],
    contact: "+91-22-2410-7000",
    email: "donations@redcross-mumbai.org",
    status: "active",
    description: "Annual voluntary blood donation camp supporting trauma and emergency surgical units across Central Mumbai.",
    targetDonors: 250,
  },
  {
    name: "Suburban Blood Heroes Camp",
    organizer: "Rotary Club of Mumbai & Lilavati Blood Centre",
    location: "Bandra Reclamation Community Hall, Bandra West, Mumbai",
    date: new Date(Date.now() + 86400000 * 5),
    endDate: new Date(Date.now() + 86400000 * 5 + 3600000 * 8),
    bloodGroups: ["O-", "A-", "B-", "AB-", "All"],
    contact: "+91-22-2675-1000",
    email: "bloodheroes@rotarymumbai.org",
    status: "active",
    description: "Focused urgent collection drive for rare negative blood types (O-, A-, B-) and general donors in suburban Mumbai.",
    targetDonors: 150,
  },
  {
    name: "Navi Mumbai Corporate Care Blood Camp",
    organizer: "Apollo Hospitals Navi Mumbai Blood Bank",
    location: "Plot # 13, Sector 23, CBD Belapur, Navi Mumbai",
    date: new Date(Date.now() + 86400000 * 8),
    endDate: new Date(Date.now() + 86400000 * 9),
    bloodGroups: ["All"],
    contact: "+91-22-3350-3350",
    email: "bloodbank.navimumbai@apollohospitals.com",
    status: "upcoming",
    description: "Community donation drive for platelet & whole blood reserve augmentation ahead of seasonal caseload.",
    targetDonors: 180,
  },
];
