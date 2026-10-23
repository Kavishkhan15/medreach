import os
import glob
import json

RAW_DIR = "/home/anonymous/medreach/research-measurements/literature/raw"

papers = {}

# Process Crossref
for fpath in glob.glob(os.path.join(RAW_DIR, "crossref_*.json")):
    try:
        with open(fpath, "r", encoding="utf-8") as f:
            data = json.load(f)
            items = data.get("message", {}).get("items", [])
            for item in items:
                doi = item.get("DOI", "").lower().strip()
                if not doi:
                    continue
                title = item.get("title", [""])[0] if item.get("title") else ""
                authors = []
                for a in item.get("author", []):
                    name = f"{a.get('given', '')} {a.get('family', '')}".strip()
                    if name:
                        authors.append(name)
                year = None
                pub = item.get("published", {}) or item.get("published-print", {}) or item.get("published-online", {})
                if pub and "date-parts" in pub and pub["date-parts"]:
                    year = pub["date-parts"][0][0]
                venue = item.get("container-title", [""])[0] if item.get("container-title") else ""
                papers[doi] = {
                    "doi": doi,
                    "title": title,
                    "authors": authors,
                    "year": year,
                    "venue": venue,
                    "source": "crossref",
                    "abstract": item.get("abstract", "")
                }
    except Exception as e:
        pass

# Process OpenAlex
for fpath in glob.glob(os.path.join(RAW_DIR, "openalex_*.json")):
    try:
        with open(fpath, "r", encoding="utf-8") as f:
            data = json.load(f)
            results = data.get("results", [])
            for res in results:
                doi = res.get("doi")
                if doi:
                    doi = doi.lower().replace("https://doi.org/", "").strip()
                title = res.get("title", "")
                authors = [a.get("author", {}).get("display_name", "") for a in res.get("authorships", [])]
                year = res.get("publication_year")
                venue = res.get("primary_location", {}).get("source", {}).get("display_name", "") if res.get("primary_location") and res.get("primary_location", {}).get("source") else ""
                
                # abstract
                abstract = ""
                inv = res.get("abstract_inverted_index")
                if inv:
                    words = sorted([(pos, w) for w, poses in inv.items() for pos in poses])
                    abstract = " ".join([w for _, w in words])
                
                if doi and doi not in papers:
                    papers[doi] = {
                        "doi": doi,
                        "title": title,
                        "authors": authors,
                        "year": year,
                        "venue": venue,
                        "source": "openalex",
                        "abstract": abstract
                    }
                elif doi in papers:
                    if not papers[doi].get("abstract") and abstract:
                        papers[doi]["abstract"] = abstract
                    if not papers[doi].get("venue") and venue:
                        papers[doi]["venue"] = venue
    except Exception as e:
        pass

print(f"Total unique papers extracted by DOI: {len(papers)}")
with open("/home/anonymous/medreach/research-measurements/literature/extracted_candidates.json", "w", encoding="utf-8") as f:
    json.dump(papers, f, indent=2)

