import json

with open("/home/anonymous/medreach/research-measurements/literature/curated_dossier.json", "r") as f:
    dossier = json.load(f)

print(f"Loaded {len(dossier)} items for matrix generation.")
