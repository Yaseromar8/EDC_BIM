import fitz
import os

pdf_path = r"D:\VISOR_APS_TL\backend\uploads\documents\00_Programacion\KenleySeppanen2009location-basedmanagementofconstructionprojects-partofanewtypologyforprojectschedulingmethodologies-preformat.pdf"

def analyze_lob(path):
    doc = fitz.open(path)
    keywords = ["Production Rate", "Flowline", "Buffer", "Productivity", "Location breakdown"]
    results = {}
    
    # 1. Search for Table of Contents or Introduction to get the structure
    toc = doc.get_toc()
    print("--- TABLE OF CONTENTS (Overview) ---")
    for item in toc[:20]:
        print(f"Level {item[0]}: {item[1]} (Page {item[2]})")

    # 2. Search for keyword snippets
    print("\n--- KEYWORD RESEARCH ---")
    for kw in keywords:
        found = 0
        for i in range(len(doc)):
            page = doc[i]
            if page.search_for(kw):
                text = page.get_text()
                # Find the snippet
                idx = text.lower().find(kw.lower())
                snippet = text[max(0, idx-100):idx+200]
                print(f"\n[KW: {kw} | Page {i+1}]:\n{snippet}...")
                found += 1
                if found >= 2: break # Only 2 hits per keyword
    doc.close()

if __name__ == "__main__":
    if os.path.exists(pdf_path):
        analyze_lob(pdf_path)
    else:
        print(f"PDF not found: {pdf_path}")
