import json

with open("/home/anonymous/medreach/research-measurements/literature/extracted_candidates.json", "r", encoding="utf-8") as f:
    candidates = json.load(f)

topics = {
    "blood": ["raktkosh", "blood bank", "blood donor", "transfusion", "blood shortage", "blood supply", "blood wastage"],
    "bed": ["bed", "capacity", "icu", "occupancy", "dashboard", "allocation", "surge"],
    "interop": ["abdm", "ayushman", "fhir", "interoperability", "registry", "health facility registry", "ndhm"],
    "directory": ["directory", "phantom network", "inaccuracy", "provider directory", "physician directory"],
    "freshness_trust": ["freshness", "decay", "provenance", "timeliness", "trust", "verification", "credibility"],
    "urban_mumbai": ["mumbai", "slum", "patient navigation", "out-of-pocket", "inequality"]
}

for top, kws in topics.items():
    print(f"\n==================== TOPIC: {top} ====================")
    count = 0
    for doi, p in candidates.items():
        text = (p.get("title", "") + " " + p.get("abstract", "")).lower()
        if any(kw in text for kw in kws):
            title = p.get("title", "").strip().replace("\n", " ")
            venue = p.get("venue", "").strip()
            year = p.get("year")
            authors = ", ".join(p.get("authors", [])[:3])
            print(f"- [{doi}] ({year}) {title} | {authors} | {venue}")
            count += 1
            if count >= 12:
                break
