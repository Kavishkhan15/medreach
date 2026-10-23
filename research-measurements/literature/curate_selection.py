import json

with open("/home/anonymous/medreach/research-measurements/literature/extracted_candidates.json", "r", encoding="utf-8") as f:
    candidates = json.load(f)

# Define the 8 exact topics from the prompt
topic_definitions = {
    "1_patient_navigation_digital_access": [
        "patient navigation", "digital health access", "telemedicine access", "navigation platform", "low resource settings"
    ],
    "2_resource_freshness_decay": [
        "age of information", "data freshness", "information decay", "timeliness", "status update", "real-time"
    ],
    "3_bed_capacity_dashboards": [
        "hospital bed", "bed management", "bed allocation", "capacity management", "covid-19 bed", "dashboard", "icu bed"
    ],
    "4_blood_systems_eraktkosh": [
        "eraktkosh", "e-raktkosh", "blood bank", "blood shortage", "blood inventory", "blood wastage", "blood request", "transfusion", "twitter"
    ],
    "5_interoperability_registries": [
        "abdm", "ayushman bharat", "national digital health mission", "ndhm", "health facility registry", "hfr", "fhir", "interoperability"
    ],
    "6_information_provenance_trust": [
        "provenance", "trust", "credibility", "verification", "misinformation", "source traceability"
    ],
    "7_urban_mumbai_inequalities": [
        "mumbai", "slum", "dharavi", "out-of-pocket", "public private", "urban healthcare access", "maternal health care utilization"
    ],
    "8_directory_inaccuracy": [
        "provider directory", "physician directory", "phantom network", "directory inaccuracy", "network adequacy", "secret shopper"
    ]
}

selected_by_topic = {k: [] for k in topic_definitions}

for doi, p in candidates.items():
    title = p.get("title", "")
    abstract = p.get("abstract", "")
    venue = p.get("venue", "")
    full_text = f"{title} {abstract} {venue}".lower()
    
    for top, kws in topic_definitions.items():
        score = sum(1 for kw in kws if kw in full_text)
        if score > 0:
            selected_by_topic[top].append((score, doi, p))

for top in selected_by_topic:
    selected_by_topic[top].sort(key=lambda x: x[0], reverse=True)
    print(f"\n=== {top} (Total matches: {len(selected_by_topic[top])}) ===")
    for score, doi, p in selected_by_topic[top][:8]:
        authors = ", ".join(p.get("authors", [])[:2])
        print(f"[{score}] {doi} | {p.get('year')} | {authors} | {p.get('title')[:70]} | {p.get('venue')[:40]}")

