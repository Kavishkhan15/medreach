import json
import urllib.parse
import requests
import time

USER_AGENT = "MedReachResearch/0.1 (academic study; read-only; mailto:research@medreach.local)"
HEADERS = {"User-Agent": USER_AGENT}

TARGET_DOIS = [
    # Topic 1: Digital healthcare access & patient navigation
    "10.59067/afjhms.v11i2.126",
    "10.21203/rs.3.rs-10831662/v1",
    "10.1371/journal.pone.0223537",
    "10.1007/s11912-024-01514-9",
    "10.1136/fmch-2023-002397",

    # Topic 2: Resource availability & data freshness (decay, AoI, timeliness)
    "10.1109/infcom.2012.6195689",
    "10.1109/itw44776.2019.8988983",
    "10.1109/vtc2020-fall49728.2020.9348764",
    "10.1145/3639830.3639849",
    "10.1109/tits.2020.3039617",

    # Topic 3: Hospital capacity, bed-management & COVID dashboards
    "10.18203/2394-6040.ijcmph20260718",
    "10.1016/j.inhs.2026.100048",
    "10.1007/978-981-16-1740-9_27",
    "10.1136/bmj.q883",
    "10.1109/iccnct68477.2026.11590821",
    "10.64753/jcasc.v10i3.3643",

    # Topic 4: Blood stock, e-RaktKosh, wastage & social requests
    "10.36948/ijfmr.2024.v06i02.14122",
    "10.21088/ijprp.2278.148x.7418.12",
    "10.7759/cureus.20500",
    "10.21276/ijcmr.2019.6.5.60",
    "10.1109/icitr69413.2025.11353793",
    "10.4103/ajts.ajts_75_25",
    "10.71097/ijsat.v16.i4.8701",
    "10.1111/trf.15998",

    # Topic 5: Interoperability, registries (HFR, FHIR, ABDM)
    "10.2139/ssrn.5988514",
    "10.18203/2394-6040.ijcmph20262227",
    "10.20944/preprints202606.1791.v1",
    "10.1002/hcs2.67",
    "10.36948/ijfmr.2026.v08i03.79174",
    "10.36948/ijfmr.2026.v08i02.80872",

    # Topic 6: Information provenance, trust & verification
    "10.3389/fpubh.2026.1986759",
    "10.1145/3610061",
    "10.1109/icedeg58167.2023.10121951",
    "10.1177/02663821261487913",
    "10.2139/ssrn.7130058",

    # Topic 7: Urban healthcare access & inequalities in Mumbai
    "10.12688/wellcomeopenres.13127.1",
    "10.7759/cureus.104142",
    "10.1186/1471-2458-11-150",
    "10.1186/1475-9276-8-21",
    "10.26727/njrcm.2018.7.1.26-31",
    "10.18203/2394-6040.ijcmph20162055",

    # Topic 8: Online directories' accuracy & phantom networks
    "10.37765/ajmc.2024.89627",
    "10.37765/ajmc.2025.89791",
    "10.1002/wmh3.607",
    "10.1215/03616878-10852610",
    "10.1002/wmh3.625",
    "10.1080/03630242.2022.2083284",
    "10.37765/ajmc.2023.89318"
]

print(f"Verifying {len(TARGET_DOIS)} DOIs against Crossref / OpenAlex...")
verified_corpus = {}

for idx, doi in enumerate(TARGET_DOIS):
    url = f"https://api.crossref.org/works/{doi}"
    try:
        r = requests.get(url, headers=HEADERS, timeout=12)
        if r.status_code == 200:
            msg = r.json().get("message", {})
            title = msg.get("title", [""])[0] if msg.get("title") else ""
            authors = []
            for a in msg.get("author", []):
                name = f"{a.get('given', '')} {a.get('family', '')}".strip()
                if name:
                    authors.append(name)
            year = None
            pub = msg.get("published", {}) or msg.get("published-print", {}) or msg.get("published-online", {}) or msg.get("created", {})
            if pub and "date-parts" in pub and pub["date-parts"]:
                year = pub["date-parts"][0][0]
            venue = msg.get("container-title", [""])[0] if msg.get("container-title") else ""
            verified_corpus[doi] = {
                "doi": doi,
                "title": title,
                "authors": authors,
                "year": year,
                "venue": venue,
                "publisher": msg.get("publisher", ""),
                "url": f"https://doi.org/{doi}",
                "status": "VERIFIED_CROSSREF"
            }
            print(f"[{idx+1}/{len(TARGET_DOIS)}] Verified (Crossref): {doi} -> {year} | {title[:50]}")
        else:
            # Fallback to OpenAlex
            oa_url = f"https://api.openalex.org/works/https://doi.org/{doi}"
            r2 = requests.get(oa_url, headers=HEADERS, timeout=12)
            if r2.status_code == 200:
                oa_data = r2.json()
                title = oa_data.get("title", "")
                authors = [a.get("author", {}).get("display_name", "") for a in oa_data.get("authorships", [])]
                year = oa_data.get("publication_year")
                venue = oa_data.get("primary_location", {}).get("source", {}).get("display_name", "") if oa_data.get("primary_location") and oa_data.get("primary_location", {}).get("source") else ""
                verified_corpus[doi] = {
                    "doi": doi,
                    "title": title,
                    "authors": authors,
                    "year": year,
                    "venue": venue,
                    "publisher": oa_data.get("primary_location", {}).get("source", {}).get("host_organization_name", ""),
                    "url": f"https://doi.org/{doi}",
                    "status": "VERIFIED_OPENALEX"
                }
                print(f"[{idx+1}/{len(TARGET_DOIS)}] Verified (OpenAlex): {doi} -> {year} | {title[:50]}")
            else:
                print(f"[{idx+1}/{len(TARGET_DOIS)}] UNVERIFIED: {doi} (CR {r.status_code}, OA {r2.status_code})")
    except Exception as e:
        print(f"Error {doi}: {e}")
    time.sleep(1.1)

print(f"\nTotal verified references: {len(verified_corpus)}")
with open("/home/anonymous/medreach/research-measurements/literature/verified_corpus.json", "w", encoding="utf-8") as f:
    json.dump(verified_corpus, f, indent=2)

