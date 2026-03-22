import xml.etree.ElementTree as ET
from collections import Counter
import os

xml_path = 'd:/VISOR_APS_TL/backend/uploads/documents/00_Programacion/500125-PQ08-LB00.xml'

def audit_xml(path):
    tree = ET.parse(path)
    root = tree.getroot()
    
    # Map UDF Types
    udf_types = {}
    for udf_t in root.findall(".//{*}UDFType"):
        oid = udf_t.findtext("{*}ObjectId")
        title = udf_t.findtext("{*}Title")
        if oid and title:
            udf_types[oid] = title
            
    # Audit distributions
    stats = {title: Counter() for title in udf_types.values()}
    
    # Store some examples of task mapping
    examples = []
    
    for act in root.findall('.//{*}Activity'):
        act_name = act.findtext('{*}Name')
        act_udfs = {}
        for u in act.findall('{*}UDF'):
            t_oid = u.findtext('{*}TypeObjectId')
            if t_oid in udf_types:
                title = udf_types[t_oid]
                val = u.findtext('{*}TextValue') or u.findtext('{*}DoubleValue') or u.findtext('{*}CodeValue') or 'N/A'
                stats[title].update([val])
                act_udfs[title] = val
        
        if len(examples) < 10 and 'FRENTE' in act_udfs:
            examples.append({
                "name": act_name,
                "udfs": act_udfs
            })

    print("--- UDF DISTRIBUTION ---")
    for title, counter in sorted(stats.items(), key=lambda x: len(x[1]), reverse=True):
        if len(counter) > 1:
            print(f"{title}: {len(counter)} unique values. Top 5: {counter.most_common(5)}")

    print("\n--- MAPPING EXAMPLES ---")
    for ex in examples:
        print(f"Task: {ex['name']}")
        print(f"  Hierarchy: {ex['udfs'].get('FRENTE')} > {ex['udfs'].get('ETQ11_COMPONENTE')} > {ex['udfs'].get('ETQ10_ESTRUCTURA')}")

if __name__ == "__main__":
    audit_xml(xml_path)
