#!/usr/bin/env python3
"""
generate_dossier.py
Merges all 21 markdown files in /home/anonymous/medreach/docs/research/medreach-healthcare-access
into a single high-quality HTML document styled for professional PDF compilation.
"""

import os
import re
import glob
import markdown

WORKSPACE = "/home/anonymous/medreach/docs/research/medreach-healthcare-access"

ORDERED_FILES = [
    "research-proposal.md",
    "00-research-objectives-and-scope.md",
    "01-medreach-code-and-feature-audit.md",
    "02-existing-platforms-comparison.md",
    "03-literature-search-method.md",
    "04-literature-review.md",
    "05-literature-evidence-matrix.md",
    "06-research-gap-and-novelty-assessment.md",
    "07-research-questions-and-hypotheses.md",
    "08-system-architecture-and-proposed-design.md",
    "09-performance-load-and-stress-testing-methodology.md",
    "10-caching-and-data-freshness-analysis.md",
    "11-backend-reliability-and-security-evidence.md",
    "12-healthcare-access-evaluation-methodology.md",
    "13-statistical-analysis-and-reproducibility.md",
    "14-data-governance-and-ethics.md",
    "15-open-source-tools-and-licensing.md",
    "16-experimental-results.md",
    "17-threats-to-validity-and-limitations.md",
    "18-proposed-paper-outline.md",
    "evidence-register.md"
]

def preprocess_markdown(text):
    # 1. Inline list callouts like:
    # - **Readiness**: > [!WARNING]
    #   > **FLAGGED: CANNOT BE WRITTEN...**
    pattern_inline = r"(?m)^([ \t]*-\s*[^:\n]+:)\s*>[ \t]*\[!(NOTE|IMPORTANT|WARNING|TIP|CAUTION)\][ \t]*\n((?:[ \t]*>[ \t]*.*(?:\n|$))*)"
    def sub_inline(m):
        prefix = m.group(1)
        level = m.group(2)
        body = m.group(3)
        clean_body = re.sub(r"^[ \t]*>[ \t]?", "", body, flags=re.MULTILINE).strip()
        return f"{prefix} <span class=\"callout-inline callout-{level.lower()}\"><span class=\"badge badge-{level.lower()}\">{level}</span> {clean_body}</span>\n"
    text = re.sub(pattern_inline, sub_inline, text)

    # 2. Blockquote callouts:
    # > [!IMPORTANT]
    # > line 1...
    pattern_block = r"(?m)^>[ \t]*\[!(NOTE|IMPORTANT|WARNING|TIP|CAUTION)\][ \t]*\n((?:>[ \t]*.*(?:\n|$))*)"
    def sub_block(m):
        level = m.group(1)
        body = m.group(2)
        clean_body = re.sub(r"^[ \t]*>[ \t]?", "", body, flags=re.MULTILINE).strip()
        return f"\n<div class=\"callout callout-{level.lower()}\" markdown=\"1\">\n<div class=\"callout-badge badge-{level.lower()}\">{level}</div>\n\n{clean_body}\n</div>\n\n"
    text = re.sub(pattern_block, sub_block, text)

    return text

def extract_meta(file_path):
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Title
    m_title = re.search(r"^#\s+(.+)$", content, re.MULTILINE)
    title = m_title.group(1).strip() if m_title else os.path.basename(file_path)

    # Document identifier
    m_id = re.search(r"\*\*Document identifier\*\*:\s*`([^`]+)`", content)
    doc_id = m_id.group(1).strip() if m_id else os.path.splitext(os.path.basename(file_path))[0]

    return {
        "title": title,
        "doc_id": doc_id,
        "file_name": os.path.basename(file_path),
        "raw_content": content
    }

def main():
    docs = []
    for fn in ORDERED_FILES:
        fp = os.path.join(WORKSPACE, fn)
        if not os.path.exists(fp):
            print(f"Warning: file {fp} does not exist!")
            continue
        docs.append(extract_meta(fp))

    print(f"Loaded {len(docs)} documents.")

    # Convert each doc to HTML
    converted_docs = []
    for doc in docs:
        raw = doc["raw_content"]
        preprocessed = preprocess_markdown(raw)
        
        # Convert with python markdown
        html = markdown.markdown(
            preprocessed,
            extensions=[
                "extra",
                "toc",
                "md_in_html",
                "pymdownx.arithmatex"
            ],
            extension_configs={
                "pymdownx.arithmatex": {
                    "generic": True
                }
            }
        )

        # Prefix heading IDs to prevent cross-document collisions
        doc_id = doc["doc_id"]
        html = re.sub(r"<h([1-6]) id=\"([^\"]+)\"", f"<h\\1 id=\"doc-{doc_id}--\\2\"", html)

        # Rewrite internal markdown links (.md -> #doc-...)
        def rewrite_link(m):
            t_doc = m.group(1)
            t_anchor = m.group(2)
            if t_anchor:
                t_anchor = t_anchor.replace("#", "--")
                return f"href=\"#doc-{t_doc}{t_anchor}\""
            return f"href=\"#doc-{t_doc}\""
        
        html = re.sub(r"href=\"([0-9a-zA-Z_\-]+)\.md(#?[^\"]*)\"", rewrite_link, html)

        converted_docs.append({
            "meta": doc,
            "html": html
        })

    # Build TOC HTML
    toc_items = []
    for i, cdoc in enumerate(converted_docs):
        m = cdoc["meta"]
        doc_anchor = f"doc-{m['doc_id']}"
        num_str = f"{i+1:02d}"
        toc_items.append(f"""
        <div class="toc-row">
            <div class="toc-left">
                <span class="toc-num">{num_str}.</span>
                <a class="toc-link" href="#{doc_anchor}">{m['title']}</a>
            </div>
            <div class="toc-right">
                <span class="toc-code"><code>{m['file_name']}</code></span>
            </div>
        </div>
        """)

    toc_html = "\n".join(toc_items)

    # Build complete HTML
    html_template = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>MedReach Healthcare Access Research Dossier</title>
<script>
  window.MathJax = {{
    tex: {{
      inlineMath: [['\\\\(', '\\\\)']],
      displayMath: [['\\\\[', '\\\\]']]
    }},
    svg: {{
      fontCache: 'global'
    }}
  }};
</script>
<script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js"></script>
<style>
  @page {{
    size: A4;
    margin: 18mm 16mm 18mm 16mm;
  }}
  
  *, *:before, *:after {{
    box-sizing: border-box;
  }}

  body {{
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    color: #1e293b;
    background: #ffffff;
    line-height: 1.55;
    font-size: 9pt;
    margin: 0;
    padding: 0;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }}

  /* Cover Page */
  .cover-container {{
    page-break-after: always;
    min-height: 85vh;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 30px 10px;
  }}

  .cover-header {{
    border-bottom: 3px solid #0284c7;
    padding-bottom: 24px;
  }}

  .cover-badge {{
    display: inline-block;
    background: #0284c7;
    color: #ffffff;
    font-size: 8pt;
    font-weight: 700;
    letter-spacing: 1px;
    padding: 4px 12px;
    border-radius: 4px;
    text-transform: uppercase;
    margin-bottom: 16px;
  }}

  .cover-title {{
    font-size: 24pt;
    font-weight: 800;
    color: #0f172a;
    line-height: 1.25;
    margin: 0 0 12px 0;
  }}

  .cover-subtitle {{
    font-size: 13pt;
    color: #475569;
    line-height: 1.45;
    margin: 0 0 20px 0;
  }}

  .cover-summary-box {{
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-left: 4px solid #0284c7;
    border-radius: 6px;
    padding: 16px 20px;
    margin: 20px 0;
    font-size: 9.5pt;
    color: #334155;
  }}

  .cover-partitions {{
    display: flex;
    gap: 16px;
    margin: 24px 0;
  }}

  .partition-card {{
    flex: 1;
    background: #f1f5f9;
    border-radius: 6px;
    padding: 14px 16px;
    border: 1px solid #cbd5e1;
  }}

  .partition-title {{
    font-size: 10pt;
    font-weight: 700;
    color: #0f172a;
    margin-bottom: 6px;
  }}

  .partition-desc {{
    font-size: 8pt;
    color: #475569;
    line-height: 1.4;
  }}

  .cover-metadata-table {{
    width: 100%;
    border-collapse: collapse;
    margin-top: 30px;
    font-size: 8.5pt;
  }}

  .cover-metadata-table td {{
    padding: 6px 12px;
    border-bottom: 1px solid #e2e8f0;
  }}

  .cover-metadata-table td:first-child {{
    font-weight: 600;
    color: #475569;
    width: 32%;
  }}

  .cover-metadata-table td:last-child {{
    color: #0f172a;
    font-family: monospace;
  }}

  /* Table of Contents */
  .toc-page {{
    page-break-before: always;
    page-break-after: always;
    padding: 20px 0;
  }}

  .toc-title {{
    font-size: 18pt;
    font-weight: 800;
    color: #0f172a;
    border-bottom: 2px solid #0f172a;
    padding-bottom: 10px;
    margin-bottom: 20px;
  }}

  .toc-row {{
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 5px 0;
    border-bottom: 1px dotted #cbd5e1;
    font-size: 8.5pt;
  }}

  .toc-left {{
    display: flex;
    align-items: baseline;
    max-width: 78%;
  }}

  .toc-num {{
    font-weight: 700;
    color: #0284c7;
    margin-right: 8px;
    min-width: 24px;
  }}

  .toc-link {{
    color: #1e293b;
    text-decoration: none;
    font-weight: 600;
  }}

  .toc-code code {{
    font-size: 7.5pt;
    color: #64748b;
    background: #f1f5f9;
    padding: 2px 4px;
    border-radius: 3px;
  }}

  /* Document Articles */
  article.doc-section {{
    page-break-before: always;
    padding-top: 10px;
  }}

  .doc-top-bar {{
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    padding: 6px 12px;
    border-radius: 4px;
    margin-bottom: 16px;
    font-size: 8pt;
    color: #64748b;
  }}

  .doc-top-bar .doc-index {{
    font-weight: 700;
    color: #0284c7;
  }}

  .doc-top-bar .doc-file {{
    font-family: monospace;
  }}

  /* Typography */
  h1 {{
    font-size: 18pt;
    font-weight: 800;
    color: #0f172a;
    line-height: 1.3;
    margin: 16px 0 12px 0;
    border-bottom: 1.5px solid #e2e8f0;
    padding-bottom: 6px;
    page-break-after: avoid;
  }}

  h2 {{
    font-size: 13pt;
    font-weight: 700;
    color: #1e293b;
    margin: 20px 0 10px 0;
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 4px;
    page-break-after: avoid;
  }}

  h3 {{
    font-size: 10.5pt;
    font-weight: 700;
    color: #334155;
    margin: 16px 0 8px 0;
    page-break-after: avoid;
  }}

  h4 {{
    font-size: 9pt;
    font-weight: 700;
    color: #475569;
    margin: 12px 0 6px 0;
    page-break-after: avoid;
  }}

  p {{
    margin: 8px 0;
  }}

  ul, ol {{
    margin: 8px 0;
    padding-left: 20px;
  }}

  li {{
    margin: 3px 0;
  }}

  hr {{
    border: 0;
    border-top: 1px solid #e2e8f0;
    margin: 18px 0;
  }}

  /* Tables */
  table {{
    width: 100%;
    border-collapse: collapse;
    margin: 14px 0;
    font-size: 7.8pt;
    line-height: 1.35;
    page-break-inside: auto;
  }}

  thead {{
    display: table-header-group;
  }}

  tr {{
    page-break-inside: avoid;
    page-break-after: auto;
  }}

  th {{
    background-color: #f1f5f9;
    color: #0f172a;
    font-weight: 700;
    border: 1px solid #cbd5e1;
    padding: 5px 7px;
    text-align: left;
    vertical-align: bottom;
  }}

  td {{
    border: 1px solid #e2e8f0;
    padding: 5px 7px;
    text-align: left;
    vertical-align: top;
  }}

  tbody tr:nth-child(even) {{
    background-color: #f8fafc;
  }}

  /* Code Blocks & Preformatted */
  pre {{
    font-family: 'SFMono-Regular', Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
    font-size: 7.2pt;
    line-height: 1.35;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-left: 3px solid #0284c7;
    border-radius: 4px;
    padding: 8px 12px;
    margin: 12px 0;
    white-space: pre-wrap;
    word-break: break-all;
    page-break-inside: avoid;
  }}

  code {{
    font-family: 'SFMono-Regular', Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
    font-size: 8pt;
    background: #f1f5f9;
    color: #0f172a;
    padding: 1.5px 4px;
    border-radius: 3px;
  }}

  pre code {{
    background: none;
    color: inherit;
    padding: 0;
    font-size: inherit;
  }}

  /* Callouts & Alerts */
  .callout {{
    border-left: 4px solid #64748b;
    border-radius: 4px;
    padding: 10px 14px;
    margin: 14px 0;
    page-break-inside: avoid;
  }}

  .callout-badge {{
    display: inline-block;
    font-size: 7pt;
    font-weight: 800;
    padding: 2px 6px;
    border-radius: 3px;
    margin-bottom: 6px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }}

  .callout-important {{
    border-left-color: #7c3aed;
    background: #f5f3ff;
  }}
  .badge-important {{
    background: #7c3aed;
    color: #ffffff;
  }}

  .callout-caution {{
    border-left-color: #dc2626;
    background: #fef2f2;
  }}
  .badge-caution {{
    background: #dc2626;
    color: #ffffff;
  }}

  .callout-warning {{
    border-left-color: #d97706;
    background: #fffbeb;
  }}
  .badge-warning {{
    background: #d97706;
    color: #ffffff;
  }}

  .callout-note {{
    border-left-color: #0284c7;
    background: #f0f9ff;
  }}
  .badge-note {{
    background: #0284c7;
    color: #ffffff;
  }}

  .callout-tip {{
    border-left-color: #059669;
    background: #ecfdf5;
  }}
  .badge-tip {{
    background: #059669;
    color: #ffffff;
  }}

  .callout-inline {{
    display: inline-block;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 8pt;
  }}
  .callout-inline .badge {{
    font-weight: 700;
    font-size: 7pt;
    padding: 1px 4px;
    border-radius: 2px;
  }}

  blockquote {{
    border-left: 3px solid #cbd5e1;
    margin: 10px 0;
    padding: 6px 14px;
    color: #475569;
    background: #f8fafc;
    border-radius: 0 4px 4px 0;
  }}

  /* Math */
  .arithmatex {{
    display: inline;
  }}
  div.arithmatex {{
    display: block;
    margin: 8px 0;
    overflow-x: auto;
  }}
</style>
</head>
<body>

<!-- Cover Page -->
<div class="cover-container">
  <div class="cover-header">
    <span class="cover-badge">Academic Research Dossier &amp; Verification Ledger</span>
    <h1 class="cover-title">MedReach Healthcare Access Research Dossier</h1>
    <div class="cover-subtitle">Freshness-Aware Resource Discovery, Transactional Coordination, and Empirical Framework Evaluation in Fragmented Urban Healthcare Systems</div>
  </div>

  <div class="cover-summary-box">
    <strong>Dossier Description:</strong> This document represents the consolidated master research archive of the MedReach academic programme. It compiles the complete research roadmap, system audits, systematic literature reviews, experimental architectures, ethical frameworks, and the tamper-evident verification ledger across 21 interconnected research specifications.
  </div>

  <div class="cover-partitions">
    <div class="partition-card">
      <div class="partition-title">Track 1: Healthcare Access (Primary)</div>
      <div class="partition-desc">Continuous Age of Information (AoI) decay modeling, multi-source provenance fusion, and two-way transactional bed/blood requests in Mumbai's fragmented urban emergency health system.</div>
    </div>
    <div class="partition-card">
      <div class="partition-title">Track 2: Empirical Web Engineering (Secondary)</div>
      <div class="partition-desc">Descriptive multi-case study analyzing presentation-boundary drift, bundle composition, and code churn across Bootstrap 5, Tailwind CSS 4, and Skeleton CSS 2.</div>
    </div>
  </div>

  <table class="cover-metadata-table">
    <tr><td>Target Metropolitan Domain</td><td>Mumbai Metropolitan Region (MMR), India</td></tr>
    <tr><td>Compilation Scope</td><td>21 Markdown Dossiers (Complete Archive)</td></tr>
    <tr><td>Evidentiary Basis</td><td>52 Scholarly/Institutional Sources; 64 Verification Ledger Claims</td></tr>
    <tr><td>Integrity Governance</td><td>Zero Unexecuted Claims; Strict Phase A Isolation Protocols</td></tr>
    <tr><td>Date of Record</td><td>October 2026</td></tr>
  </table>
</div>

<!-- Table of Contents -->
<div class="toc-page">
  <div class="toc-title">Table of Contents &amp; Document Index</div>
  {toc_html}
</div>

<!-- Document Articles -->
"""

    # Append documents
    for i, cdoc in enumerate(converted_docs):
        m = cdoc["meta"]
        doc_anchor = f"doc-{m['doc_id']}"
        num_str = f"Document {i+1:02d} of {len(converted_docs):02d}"
        
        doc_section_html = f"""
<article class="doc-section" id="{doc_anchor}">
  <div class="doc-top-bar">
    <span class="doc-index">{num_str} &bull; Identifier: {m['doc_id']}</span>
    <span class="doc-file">{m['file_name']}</span>
  </div>
  {cdoc['html']}
</article>
"""
        html_template += doc_section_html

    html_template += """
</body>
</html>
"""

    out_html = os.path.join(WORKSPACE, "merged-research-dossier.html")
    with open(out_html, "w", encoding="utf-8") as f:
        f.write(html_template)

    print(f"Successfully generated {out_html} ({len(html_template):,} characters).")

if __name__ == "__main__":
    main()
