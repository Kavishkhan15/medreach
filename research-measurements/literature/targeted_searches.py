import os
import json
import time
import urllib.parse
import requests

RAW_DIR = "/home/anonymous/medreach/research-measurements/literature/raw"
USER_AGENT = "MedReachResearch/0.1 (academic study; read-only; mailto:research@medreach.local)"
HEADERS = {"User-Agent": USER_AGENT}

TARGETED_QUERIES = [
    # Phantom networks & provider directory inaccuracy
    {"topic": "directory_inaccuracy", "query": "phantom networks provider directory inaccuracy"},
    {"topic": "directory_inaccuracy", "query": "physician directory accuracy CMS audit"},
    {"topic": "directory_inaccuracy", "query": "secret shopper provider directory wait time inaccurate"},
    {"topic": "directory_inaccuracy", "query": "Simon Haeder provider directories"},
    
    # Mumbai war room / COVID bed dashboards in India
    {"topic": "mumbai_bed_dashboard", "query": "Mumbai COVID-19 war room bed management MCGM BMC"},
    {"topic": "mumbai_bed_dashboard", "query": "COVID-19 bed allocation system India dashboard"},
    {"topic": "mumbai_bed_dashboard", "query": "real-time bed dashboard COVID-19 India"},
    
    # Blood social media requests in India
    {"topic": "blood_social_media", "query": "COVID-19 Twitter blood plasma requests India"},
    {"topic": "blood_social_media", "query": "social media blood donation requests India Twitter SOS"},
    {"topic": "blood_social_media", "query": "e-RaktKosh blood bank inventory India"},
    
    # ABDM, HFR, FHIR
    {"topic": "abdm_hfr", "query": "Ayushman Bharat Digital Mission Health Facility Registry"},
    {"topic": "abdm_hfr", "query": "interoperability FHIR India National Digital Health Mission"},
    {"topic": "abdm_hfr", "query": "digital health infrastructure India ABDM"},
    
    # Age of Information & data freshness
    {"topic": "aoi_freshness", "query": "Age of Information status update data freshness"},
    {"topic": "aoi_freshness", "query": "data freshness real-time resource availability timeliness"},
    
    # Mumbai urban healthcare access & inequalities
    {"topic": "mumbai_healthcare", "query": "healthcare access Mumbai slums out-of-pocket public private"},
    {"topic": "mumbai_healthcare", "query": "patient navigation primary healthcare Mumbai India"}
]

for idx, item in enumerate(TARGETED_QUERIES):
    q = item["query"]
    top = item["topic"]
    print(f"[Targeted {idx+1}/{len(TARGETED_QUERIES)}] {top}: {q}")
    
    # Crossref
    url_cr = f"https://api.crossref.org/works?query={urllib.parse.quote(q)}&rows=10&select=DOI,title,author,published,container-title,abstract,type,URL,score"
    fname_cr = os.path.join(RAW_DIR, f"crossref_targeted_{top}_{idx}.json")
    if not os.path.exists(fname_cr):
        try:
            r = requests.get(url_cr, headers=HEADERS, timeout=15)
            if r.status_code == 200:
                with open(fname_cr, "w", encoding="utf-8") as f:
                    json.dump(r.json(), f, indent=2)
        except Exception as e:
            print(f"Error CR {q}: {e}")
        time.sleep(1.2)
        
    # OpenAlex
    url_oa = f"https://api.openalex.org/works?search={urllib.parse.quote(q)}&per_page=10"
    fname_oa = os.path.join(RAW_DIR, f"openalex_targeted_{top}_{idx}.json")
    if not os.path.exists(fname_oa):
        try:
            r = requests.get(url_oa, headers=HEADERS, timeout=15)
            if r.status_code == 200:
                with open(fname_oa, "w", encoding="utf-8") as f:
                    json.dump(r.json(), f, indent=2)
        except Exception as e:
            print(f"Error OA {q}: {e}")
        time.sleep(1.2)

print("Targeted searches finished.")
