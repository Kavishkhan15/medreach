import json

with open("/home/anonymous/medreach/research-measurements/literature/extracted_candidates.json", "r") as f:
    candidates = json.load(f)

with open("/home/anonymous/medreach/research-measurements/literature/verified_corpus.json", "r") as f:
    verified = json.load(f)

dossier = {}
for doi, v in verified.items():
    cand = candidates.get(doi, {})
    dossier[doi] = {
        "doi": doi,
        "title": v.get("title") or cand.get("title"),
        "authors": v.get("authors") or cand.get("authors"),
        "year": v.get("year") or cand.get("year"),
        "venue": v.get("venue") or cand.get("venue"),
        "publisher": v.get("publisher"),
        "abstract": cand.get("abstract", ""),
        "url": v.get("url")
    }

with open("/home/anonymous/medreach/research-measurements/literature/curated_dossier.json", "w") as f:
    json.dump(dossier, f, indent=2)

print(f"Generated dossier for {len(dossier)} papers.")
