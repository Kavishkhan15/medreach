import os
import sys
import time
import json
import urllib.parse
import requests

RAW_DIR = "/home/anonymous/medreach/research-measurements/literature/raw"
os.makedirs(RAW_DIR, exist_ok=True)

USER_AGENT = "MedReachResearch/0.1 (academic study; read-only; mailto:research@medreach.local)"
HEADERS = {"User-Agent": USER_AGENT}

QUERIES = [
    # Topic: Blood banking, e-RaktKosh, wastage, social media requests
    {"topic": "blood_systems", "query": "e-RaktKosh"},
    {"topic": "blood_systems", "query": "blood bank information system india wastage"},
    {"topic": "blood_systems", "query": "blood donor recruitment social media twitter india"},
    {"topic": "blood_systems", "query": "blood shortage stockout inventory management india"},
    
    # Topic: Hospital capacity, bed management, COVID dashboards
    {"topic": "bed_management", "query": "hospital bed availability dashboard COVID-19 India"},
    {"topic": "bed_management", "query": "hospital bed management system real time data quality"},
    {"topic": "bed_management", "query": "COVID-19 bed allocation dashboard Mumbai"},
    {"topic": "bed_management", "query": "real-time bed tracking hospital capacity"},
    
    # Topic: Interoperability, registries, ABDM, FHIR, HFR
    {"topic": "interoperability", "query": "Ayushman Bharat Digital Mission health facility registry"},
    {"topic": "interoperability", "query": "FHIR healthcare interoperability India"},
    {"topic": "interoperability", "query": "national digital health blueprint India health facility registry"},
    
    # Topic: Directory accuracy and phantom networks
    {"topic": "directory_accuracy", "query": "provider directory accuracy phantom network"},
    {"topic": "directory_accuracy", "query": "physician directory inaccuracy error rate"},
    {"topic": "directory_accuracy", "query": "online healthcare directory data quality verification"},
    
    # Topic: Freshness, information decay, provenance, trust
    {"topic": "freshness_provenance", "query": "data freshness information decay dynamic resource availability"},
    {"topic": "freshness_provenance", "query": "health information provenance trust verification"},
    
    # Topic: Urban healthcare access, patient navigation, Mumbai
    {"topic": "urban_access_mumbai", "query": "healthcare access inequalities Mumbai slums"},
    {"topic": "urban_access_mumbai", "query": "patient navigation digital healthcare access low resource settings"},
    {"topic": "urban_access_mumbai", "query": "urban primary healthcare access public private Mumbai"}
]

def search_crossref(query, topic, index):
    url = f"https://api.crossref.org/works?query={urllib.parse.quote(query)}&rows=10&select=DOI,title,author,published,container-title,abstract,type,URL,score"
    fname = os.path.join(RAW_DIR, f"crossref_{topic}_{index}.json")
    if os.path.exists(fname):
        with open(fname, "r", encoding="utf-8") as f:
            return json.load(f)
    try:
        r = requests.get(url, headers=HEADERS, timeout=15)
        if r.status_code == 200:
            data = r.json()
            with open(fname, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
            return data
        else:
            print(f"[Crossref] HTTP {r.status_code} for {query}")
    except Exception as e:
        print(f"[Crossref] Error: {e}")
    return None

def search_openalex(query, topic, index):
    url = f"https://api.openalex.org/works?search={urllib.parse.quote(query)}&per_page=10"
    fname = os.path.join(RAW_DIR, f"openalex_{topic}_{index}.json")
    if os.path.exists(fname):
        with open(fname, "r", encoding="utf-8") as f:
            return json.load(f)
    try:
        r = requests.get(url, headers=HEADERS, timeout=15)
        if r.status_code == 200:
            data = r.json()
            with open(fname, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
            return data
        else:
            print(f"[OpenAlex] HTTP {r.status_code} for {query}")
    except Exception as e:
        print(f"[OpenAlex] Error: {e}")
    return None

def search_pubmed(query, topic, index):
    esearch_url = f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pmc&term={urllib.parse.quote(query)}&retmode=json&retmax=10"
    fname = os.path.join(RAW_DIR, f"pubmed_{topic}_{index}.json")
    if os.path.exists(fname):
        with open(fname, "r", encoding="utf-8") as f:
            return json.load(f)
    try:
        r = requests.get(esearch_url, headers=HEADERS, timeout=15)
        if r.status_code == 200:
            data = r.json()
            with open(fname, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
            return data
        else:
            print(f"[PubMed] HTTP {r.status_code} for {query}")
    except Exception as e:
        print(f"[PubMed] Error: {e}")
    return None

print(f"Starting literature search across {len(QUERIES)} queries...")
for idx, q in enumerate(QUERIES):
    print(f"[{idx+1}/{len(QUERIES)}] Querying: {q['query']} ({q['topic']})")
    search_crossref(q['query'], q['topic'], idx)
    time.sleep(1.2)
    search_openalex(q['query'], q['topic'], idx)
    time.sleep(1.2)
    search_pubmed(q['query'], q['topic'], idx)
    time.sleep(1.2)

print("Queries complete. Raw API files saved in:", RAW_DIR)
