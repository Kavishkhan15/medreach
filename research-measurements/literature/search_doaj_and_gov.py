import os
import json
import urllib.parse
import requests
import time

RAW_DIR = "/home/anonymous/medreach/research-measurements/literature/raw"
USER_AGENT = "MedReachResearch/0.1 (academic study; read-only; mailto:research@medreach.local)"
HEADERS = {"User-Agent": USER_AGENT}

DOAJ_QUERIES = [
    "blood bank information system india",
    "hospital bed capacity real time",
    "Ayushman Bharat digital health",
    "healthcare access mumbai",
    "provider directory accuracy"
]

for idx, q in enumerate(DOAJ_QUERIES):
    url = f"https://doaj.org/api/v2/search/articles/{urllib.parse.quote(q)}?pageSize=10"
    fname = os.path.join(RAW_DIR, f"doaj_{idx}.json")
    try:
        r = requests.get(url, headers=HEADERS, timeout=15)
        if r.status_code == 200:
            with open(fname, "w", encoding="utf-8") as f:
                json.dump(r.json(), f, indent=2)
            print(f"[DOAJ] Query '{q}' returned results.")
        else:
            print(f"[DOAJ] HTTP {r.status_code}")
    except Exception as e:
        print(f"[DOAJ] Error: {e}")
    time.sleep(1.2)

# Check official Indian government portals / stable documents
GOV_URLS = [
    {"name": "abdm_hfr", "url": "https://abdm.gov.in/hfr"},
    {"name": "eraktkosh_home", "url": "https://www.eraktkosh.in/BLDAHIMS/bloodbank/aboutUs.cnt"},
    {"name": "ndhm_blueprint", "url": "https://www.nhp.gov.in/NHPfiles/National_Digital_Health_Blueprint_Report.pdf"}
]

for gov in GOV_URLS:
    fname = os.path.join(RAW_DIR, f"gov_{gov['name']}.meta.json")
    try:
        r = requests.get(gov['url'], headers=HEADERS, timeout=15, stream=True)
        meta = {
            "name": gov["name"],
            "url": gov["url"],
            "status_code": r.status_code,
            "headers": dict(r.headers),
            "access_date": "2026-10-23"
        }
        with open(fname, "w", encoding="utf-8") as f:
            json.dump(meta, f, indent=2)
        print(f"[Gov] {gov['name']}: {r.status_code}")
    except Exception as e:
        print(f"[Gov] Error fetching {gov['name']}: {e}")
    time.sleep(1.2)

