import json
import re

with open("/home/anonymous/medreach/research-measurements/literature/extracted_candidates.json", "r", encoding="utf-8") as f:
    candidates = json.load(f)

# Keywords per category
categories = {
    "directory_accuracy": [
        "phantom network", "provider directory", "physician directory", "inaccurate directory", 
        "directory accuracy", "network adequacy", "secret shopper", "inaccuracy rate"
    ],
    "bed_capacity_dashboards": [
        "bed availability", "bed management", "bed allocation", "capacity management",
        "bed tracker", "icu bed", "hospital capacity", "war room", "covid-19 bed", "dashboard"
    ],
    "blood_systems": [
        "eraktkosh", "e-raktkosh", "blood bank", "blood shortage", "blood inventory",
        "blood wastage", "blood donor recruitment", "blood request", "transfusion service"
    ],
    "interoperability_registries": [
        "abdm", "ayushman bharat digital mission", "national digital health mission", "ndhm",
        "health facility registry", "hfr", "fhir", "fast healthcare interoperability resources",
        "health data exchange", "interoperability"
    ],
    "freshness_provenance": [
        "data freshness", "age of information", "information decay", "timeliness",
        "provenance", "trust", "verification", "information credibility", "source tracking"
    ],
    "urban_mumbai_access": [
        "mumbai", "slum", "patient navigation", "out-of-pocket expenditure", "healthcare inequality",
        "urban health", "public-private", "healthcare access"
    ]
}

categorized = {k: [] for k in categories}

for doi, p in candidates.items():
    title = p.get("title", "")
    abstract = p.get("abstract", "")
    venue = p.get("venue", "")
    full_text = f"{title} {abstract} {venue}".lower()
    
    for cat, kws in categories.items():
        score = sum(1 for kw in kws if kw in full_text)
        if score > 0:
            categorized[cat].append((score, doi, p))

for cat in categorized:
    categorized[cat].sort(key=lambda x: x[0], reverse=True)
    print(f"Category: {cat} -> {len(categorized[cat])} papers")
    for score, doi, p in categorized[cat][:6]:
        print(f"  [{score}] {doi}: {p.get('title')[:75]} ({p.get('year')})")

