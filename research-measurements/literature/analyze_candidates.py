import json

with open("/home/anonymous/medreach/research-measurements/literature/extracted_candidates.json", "r", encoding="utf-8") as f:
    candidates = json.load(f)

print(f"Total candidates loaded: {len(candidates)}")

topics = {
    "blood": ["raktkosh", "blood bank", "blood donor", "transfusion", "blood shortage", "blood supply", "blood wastage"],
    "bed": ["bed", "capacity", "icu", "occupancy", "dashboard", "allocation", "surge", "ward"],
    "interop": ["abdm", "ayushman", "fhir", "interoperability", "registry", "health facility registry", "ndhm", "electronic health record"],
    "directory": ["directory", "phantom network", "inaccuracy", "provider directory", "physician directory"],
    "freshness_trust": ["freshness", "decay", "provenance", "timeliness", "trust", "verification", "credibility", "misinformation"],
    "urban_mumbai": ["mumbai", "india", "urban health", "slum", "inequality", "out-of-pocket", "patient navigation", "primary care"]
}

matches_by_topic = {k: [] for k in topics}

for doi, p in candidates.items():
    text = (p.get("title", "") + " " + p.get("abstract", "") + " " + p.get("venue", "")).lower()
    for top, kws in topics.items():
        if any(kw in text for kw in kws):
            matches_by_topic[top].append(p)

for top, items in matches_by_topic.items():
    print(f"Topic {top}: {len(items)} matching papers")

