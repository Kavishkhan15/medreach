import os
import json
import urllib.parse
import requests
import time

RAW_DIR = "/home/anonymous/medreach/research-measurements/literature/raw"
USER_AGENT = "MedReachResearch/0.1 (academic study; read-only; mailto:research@medreach.local)"
HEADERS = {"User-Agent": USER_AGENT}

QUERIES = [
    # Kaul Age of Information
    "Real-time status: How often should one update? Sanjit Kaul Roy Yates Marco Gruteser",
    # COVID Twitter SOS India
    "Analyzing COVID-19 tweets for medical resource requests India",
    "SOS requests on Twitter during COVID-19 India blood beds oxygen",
    # Provider directory CMS / phantom networks
    "Simon Haeder phantom networks psychiatric provider directories",
    "Secret shopper provider directories Medicaid managed care",
    # Mumbai healthcare access Dharavi / MCGM
    "Healthcare seeking behavior in Dharavi Mumbai",
    "COVID-19 response Mumbai municipal corporation war room decentralized"
]

for idx, q in enumerate(QUERIES):
    url = f"https://api.crossref.org/works?query={urllib.parse.quote(q)}&rows=5&select=DOI,title,author,published,container-title,abstract,type,URL"
    fname = os.path.join(RAW_DIR, f"crossref_foundational_{idx}.json")
    if not os.path.exists(fname):
        try:
            r = requests.get(url, headers=HEADERS, timeout=15)
            if r.status_code == 200:
                with open(fname, "w", encoding="utf-8") as f:
                    json.dump(r.json(), f, indent=2)
                print(f"Foundational query {idx} fetched.")
            else:
                print(f"HTTP {r.status_code} for query {idx}")
        except Exception as e:
            print(f"Error query {idx}: {e}")
        time.sleep(1.2)

print("Foundational queries complete.")
