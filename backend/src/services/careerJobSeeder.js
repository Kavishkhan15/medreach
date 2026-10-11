import { Hospital } from "../models/Hospital.js";
import { ResourceProvider } from "../models/ResourceProvider.js";
import { Job } from "../models/Job.js";
import { User } from "../models/User.js";

const hospitalJobTemplates = [
  {
    targetMatch: /King Edward Memorial|KEM/i,
    jobs: [
      {
        title: "Senior Resident - Emergency & Trauma Medicine",
        category: "Doctor",
        department: "Emergency Medicine & Trauma Casualty",
        employmentType: "full_time",
        salaryText: "₹1,25,000 - ₹1,55,000 / month",
        description: "Lead critical resuscitation, trauma triage, and rapid stabilization in one of Mumbai's busiest municipal trauma care departments. Oversee junior residents and coordinate with neurosurgical and orthopedic casualty teams.",
        requirements: "MD / DNB in Emergency Medicine or General Medicine with MMC registration and active ACLS/ATLS certification.",
      },
      {
        title: "Critical Care Staff Nurse (Trauma & Burns ICU)",
        category: "Nurse",
        department: "Intensive Care Unit (ICU)",
        employmentType: "full_time",
        salaryText: "₹48,000 - ₹62,000 / month",
        description: "Provide continuous monitoring, mechanical ventilator management, and vasoactive inotropic support for complex surgical and burn trauma casualties.",
        requirements: "B.Sc Nursing or GNM with Maharashtra Nursing Council registration; minimum 2 years ICU / Critical Care experience.",
      },
      {
        title: "Medical Imaging Technologist (CT & Digital X-Ray)",
        category: "Technician",
        department: "Radiology & Diagnostic Imaging",
        employmentType: "full_time",
        salaryText: "₹36,000 - ₹50,000 / month",
        description: "Operate multi-slice CT scanners and portable digital X-ray units in round-the-clock emergency casualty shifts.",
        requirements: "B.Sc in Medical Radiography Technology (BMRT) or DMLT with 2+ years clinical hospital experience.",
      },
    ],
  },
  {
    targetMatch: /Tata Memorial/i,
    jobs: [
      {
        title: "Fellowship in Surgical Oncology",
        category: "Doctor",
        department: "Surgical Oncology",
        employmentType: "full_time",
        salaryText: "₹1,30,000 - ₹1,65,000 / month",
        description: "Engage in advanced cancer resections, clinical trials, and multidisciplinary tumor boards at India's premier cancer care and research center.",
        requirements: "MS/DNB in General Surgery or ENT/Gynecology with demonstrated academic interest in oncology.",
      },
      {
        title: "Specialist Oncology Chemotherapy Nurse",
        category: "Nurse",
        department: "Medical Oncology Daycare",
        employmentType: "full_time",
        salaryText: "₹52,000 - ₹68,000 / month",
        description: "Safely administer cytotoxic chemotherapy protocols, manage infusion extravasations, and educate oncology patients on central line/port maintenance.",
        requirements: "B.Sc Nursing with Oncology Nursing certification or minimum 2 years solid-tumor chemotherapy administration.",
      },
      {
        title: "Clinical Pharmacist - Oncology Compounding",
        category: "Pharmacist",
        department: "Pharmacy Services & Cleanroom",
        employmentType: "full_time",
        salaryText: "₹42,000 - ₹58,000 / month",
        description: "Review oncology protocols, prepare sterile IV cytotoxic admixtures under biosafety laminar flow hoods, and audit dosage guidelines.",
        requirements: "B.Pharm or Pharm.D registered with Maharashtra State Pharmacy Council (MSPC).",
      },
    ],
  },
  {
    targetMatch: /Lilavati/i,
    jobs: [
      {
        title: "Attending Consultant - Interventional Cardiology",
        category: "Doctor",
        department: "Cardiology & Cath Lab",
        employmentType: "full_time",
        salaryText: "₹2,00,000 - ₹2,80,000 / month",
        description: "Conduct diagnostic catheterizations, primary angioplasties (PPCI), and emergency cardiac interventions in state-of-the-art flat-panel cath labs.",
        requirements: "DM/DNB in Cardiology with recognized post-doctoral fellowship in coronary interventions and MMC registration.",
      },
      {
        title: "Senior Staff Nurse (NICU / PICU Speciality)",
        category: "Nurse",
        department: "Neonatal & Pediatric Intensive Care",
        employmentType: "full_time",
        salaryText: "₹55,000 - ₹72,000 / month",
        description: "Provide tertiary neonatal critical care, surfactant administration, and high-frequency oscillatory ventilation monitoring.",
        requirements: "Post-Basic B.Sc or B.Sc Nursing with minimum 3 years dedicated Level-3 NICU expertise. BLS/PALS certified.",
      },
      {
        title: "Dialysis & Hemofiltration Technician",
        category: "Technician",
        department: "Nephrology & Dialysis",
        employmentType: "full_time",
        salaryText: "₹34,000 - ₹48,000 / month",
        description: "Operate advanced hemodialysis machines, manage vascular access cannulation, and monitor continuous renal replacement therapy (CRRT).",
        requirements: "Diploma in Hemodialysis Technology with 1+ year clinical hemodialysis experience.",
      },
    ],
  },
  {
    targetMatch: /Sion|Lokmanya Tilak/i,
    jobs: [
      {
        title: "Casualty Medical Officer (CMO) - Level 1 Trauma",
        category: "Doctor",
        department: "Accident & Emergency Casualty",
        employmentType: "full_time",
        salaryText: "₹1,15,000 - ₹1,40,000 / month",
        description: "Triage emergency presentations, initiate primary ATLS surveys, order urgent point-of-care ultrasound (POCUS), and coordinate trauma transfers.",
        requirements: "MBBS with MMC permanent registration and mandatory 1 year emergency casualty experience.",
      },
      {
        title: "Emergency Response & Trauma Coordinator",
        category: "Emergency Staff",
        department: "Trauma Care Network",
        employmentType: "full_time",
        salaryText: "₹40,000 - ₹55,000 / month",
        description: "Expedite patient transit between casualty triage, CT scanning, and emergency operation theatres during high-tide and mass-casualty surges.",
        requirements: "Bachelor in Hospital Administration or Emergency Medical Care with experience in municipal trauma networks.",
      },
    ],
  },
  {
    targetMatch: /Nanavati/i,
    jobs: [
      {
        title: "Senior Radiographer & 3T MRI Imaging Specialist",
        category: "Technician",
        department: "Radiology & Neuro-Imaging",
        employmentType: "full_time",
        salaryText: "₹45,000 - ₹62,000 / month",
        description: "Perform 3T MRI brain protocols, stroke perfusion sequences, and musculoskeletal MRI for super-specialty cases.",
        requirements: "B.Sc MRT or Diploma with 3+ years experience operating 1.5T/3T MRI scanners.",
      },
      {
        title: "Hospital Operations Manager - Patient Care Services",
        category: "Administrative",
        department: "Healthcare Operations",
        employmentType: "full_time",
        salaryText: "₹75,000 - ₹1,05,000 / month",
        description: "Optimize inpatient bed turnover, streamline admission-to-discharge workflows, and maintain NABH quality compliance.",
        requirements: "MHA / MBA in Healthcare Management with 3+ years leadership in tertiary healthcare operations.",
      },
    ],
  },
];

export async function seedCareersFromProviders({ adminId = null } = {}) {
  let admin = adminId ? await User.findById(adminId) : null;
  if (!admin) {
    admin = await User.findOne({ role: { $in: ["system_admin"] } });
  }
  if (!admin) {
    // If no admin user found, cannot seed jobs
    return [];
  }

  const seededJobs = [];
  const deadline = new Date(Date.now() + 60 * 86400000); // 60 days ahead

  // 1. Seed Hospital Jobs across Mumbai
  for (const template of hospitalJobTemplates) {
    const hospital = await Hospital.findOne({ name: template.targetMatch });
    if (!hospital) continue;

    for (const jobDef of template.jobs) {
      const job = await Job.findOneAndUpdate(
        { hospital: hospital._id, title: jobDef.title },
        {
          $set: {
            ...jobDef,
            hospital: hospital._id,
            organizationType: "hospital",
            organizationName: hospital.name,
            location: `${hospital.locality || hospital.city || "Mumbai"}, Maharashtra`,
            deadline,
            status: "draft",
            verificationStatus: "unverified",
            createdBy: admin._id,
            demo: true,
          },
          $unset: { reviewedBy: 1 },
        },
        { upsert: true, new: true, runValidators: true }
      );
      seededJobs.push(job);
    }
  }

  // 2. Seed Diagnostic Centres Jobs
  const diagnostics = await ResourceProvider.find({ kind: "diagnostic", active: true }).limit(5);
  for (const diag of diagnostics) {
    const diagJobs = [
      {
        title: "Senior Medical Lab Technologist (Biochemistry & Serology)",
        category: "Technician",
        department: "Clinical Pathology",
        employmentType: "full_time",
        salaryText: "₹32,000 - ₹46,000 / month",
        description: `Perform automated blood analysis, calibrate chemiluminescence analyzers, and validate high-volume routine test runs at ${diag.name}.`,
        requirements: "DMLT / B.Sc in Medical Laboratory Technology with 2+ years NABL-accredited laboratory experience.",
      },
      {
        title: "Phlebotomist & Sample Collection Specialist",
        category: "Technician",
        department: "Phlebotomy Services",
        employmentType: "full_time",
        salaryText: "₹22,000 - ₹30,000 / month",
        description: "Handle sterile venous blood draws, pediatric capillary collections, and electronic barcoding for diagnostic specimens.",
        requirements: "Certified Phlebotomy Technician (CPT) or DMLT with gentle needle technique and cold-chain compliance experience.",
      },
    ];

    for (const jobDef of diagJobs) {
      const job = await Job.findOneAndUpdate(
        { provider: diag._id, title: jobDef.title },
        {
          $set: {
            ...jobDef,
            provider: diag._id,
            organizationType: "diagnostic",
            organizationName: diag.name,
            location: `${diag.locality || diag.city || "Mumbai"}, Maharashtra`,
            deadline,
            status: "draft",
            verificationStatus: "unverified",
            createdBy: admin._id,
            demo: true,
          },
          $unset: { reviewedBy: 1 },
        },
        { upsert: true, new: true, runValidators: true }
      );
      seededJobs.push(job);
    }
  }

  // 3. Seed Blood Banks Jobs
  const bloodBanks = await ResourceProvider.find({ kind: "blood_bank", active: true }).limit(4);
  for (const bb of bloodBanks) {
    const bbJobs = [
      {
        title: "Blood Transfusion & Component Separation Technologist",
        category: "Technician",
        department: "Transfusion Medicine",
        employmentType: "full_time",
        salaryText: "₹36,000 - ₹50,000 / month",
        description: `Manage component separation (PRBC, FFP, Platelet concentrates), cross-matching, and Coombs testing at ${bb.name}.`,
        requirements: "DMLT or Degree in Transfusion Medicine with FDA blood bank approval registration.",
      },
      {
        title: "Donor Screening & Apheresis Nurse",
        category: "Nurse",
        department: "Voluntary Donor Services",
        employmentType: "full_time",
        salaryText: "₹32,000 - ₹44,000 / month",
        description: "Screen voluntary blood donors for hemoglobin and vitals; conduct apheresis and single-donor platelet (SDP) procedures.",
        requirements: "GNM / B.Sc Nursing with experience in voluntary blood donation drives and donor counseling.",
      },
    ];

    for (const jobDef of bbJobs) {
      const job = await Job.findOneAndUpdate(
        { provider: bb._id, title: jobDef.title },
        {
          $set: {
            ...jobDef,
            provider: bb._id,
            organizationType: "blood_bank",
            organizationName: bb.name,
            location: `${bb.locality || bb.city || "Mumbai"}, Maharashtra`,
            deadline,
            status: "draft",
            verificationStatus: "unverified",
            createdBy: admin._id,
            demo: true,
          },
          $unset: { reviewedBy: 1 },
        },
        { upsert: true, new: true, runValidators: true }
      );
      seededJobs.push(job);
    }
  }

  // 4. Seed Ambulance Providers Jobs
  const ambulances = await ResourceProvider.find({ kind: "ambulance", active: true }).limit(3);

  for (const amb of ambulances) {
    const ambJobs = [
      {
        title: "Advanced Life Support (ALS) Paramedic Lead",
        category: "Emergency Staff",
        department: "Mobile Emergency Care Fleet",
        employmentType: "full_time",
        salaryText: "₹38,000 - ₹52,000 / month",
        description: `Deliver pre-hospital emergency trauma care, airway management, defibrillation, and telemetry transmission onboard ALS ambulances for ${amb.name}.`,
        requirements: "EMT-Paramedic / PGDEMS certification with active BLS/ACLS/PHTLS credentials.",
      },
      {
        title: "Emergency Fleet & Dispatch Controller",
        category: "Administrative",
        department: "Dispatch Operations",
        employmentType: "full_time",
        salaryText: "₹28,000 - ₹38,000 / month",
        description: "Coordinate GPS fleet routing, answer emergency calls, and liaise with casualty receiving departments.",
        requirements: "Graduate with strong verbal communication in Marathi, Hindi, and English.",
      },
    ];

    for (const jobDef of ambJobs) {
      const job = await Job.findOneAndUpdate(
        { provider: amb._id, title: jobDef.title },
        {
          $set: {
            ...jobDef,
            provider: amb._id,
            organizationType: "ambulance",
            organizationName: amb.name,
            location: `${amb.locality || amb.city || "Mumbai"}, Maharashtra`,
            deadline,
            status: "draft",
            verificationStatus: "unverified",
            createdBy: admin._id,
            demo: true,
          },
          $unset: { reviewedBy: 1 },
        },
        { upsert: true, new: true, runValidators: true }
      );
      seededJobs.push(job);
    }
  }

  return seededJobs;
}
