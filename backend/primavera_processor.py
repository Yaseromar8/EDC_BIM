import xml.etree.ElementTree as ET
import datetime

def parse_primavera_xml(xml_content):
    """
    Parses a Primavera P6 XML file with a 'Zero Residue' approach,
    capturing 100% of the activity data tags.
    """
    try:
        # Use ET.parse for large files if it was a file path, 
        # but here it's xml_content (string/bytes).
        root = ET.fromstring(xml_content)
        
        # 0. Extract UDF Types for mapping
        udf_types = {}
        for udf_t in root.findall(".//{*}UDFType"):
            oid = udf_t.findtext("{*}ObjectId")
            title = udf_t.findtext("{*}Title")
            if oid and title:
                udf_types[oid] = title

        # 1. First, extract WBS hierarchy
        wbs_map = {}
        for wbs in root.findall(".//{*}WBS"):
            wbs_id = wbs.findtext("{*}ObjectId")
            parent_id = wbs.findtext("{*}ParentObjectId")
            name = wbs.findtext("{*}Name")
            code = wbs.findtext("{*}Code")
            wbs_map[wbs_id] = {
                "id": wbs_id,
                "parentId": parent_id,
                "name": name,
                "code": code,
                "type": "WBS",
                "children": []
            }

        # 2. Extract activities and link to WBS
        tasks = []
        activities = root.findall(".//{*}Activity")
        
        for act in activities:
            all_data = {}
            udfs = {}
            for child in act:
                tag_name = child.tag.split('}')[-1] if '}' in child.tag else child.tag
                if tag_name == "UDF":
                    t_oid = child.findtext("{*}TypeObjectId")
                    val = child.findtext("{*}TextValue") or child.findtext("{*}DoubleValue") or child.findtext("{*}CodeValue")
                    if t_oid in udf_types:
                        udfs[udf_types[t_oid]] = val
                else:
                    all_data[tag_name] = child.text
            
            wbs_obj_id = all_data.get("WBSObjectId")
            activity_id = all_data.get("ObjectId")
            activity_code = all_data.get("Id") or all_data.get("ShortName")
            
            # Date handling
            def clean_d(d): return d.split('T')[0] if d and isinstance(d, str) else None
            
            start = all_data.get("PlannedStartDate") or all_data.get("StartDate")
            finish = all_data.get("PlannedFinishDate") or all_data.get("FinishDate")
            
            percent_str = all_data.get("PercentComplete") or all_data.get("PhysicalPercentComplete")
            try:
                percent = float(percent_str) if percent_str else 0.0
            except (ValueError, TypeError):
                percent = 0.0

            task = {
                "id": activity_id,
                "activityId": activity_code or activity_id,
                "name": all_data.get("Name"),
                "start": clean_d(start),
                "end": clean_d(finish),
                "percent": percent,
                "status": all_data.get("Status") or all_data.get("ActivityStatus"),
                "wbsId": wbs_obj_id,
                "type": "Task",
                "udfs": udfs,
                "all_data": all_data
            }
            
            tasks.append(task)
            if wbs_obj_id and wbs_obj_id in wbs_map:
                wbs_node = wbs_map[wbs_obj_id]
                if isinstance(wbs_node, dict) and "children" in wbs_node:
                    if not isinstance(wbs_node["children"], list):
                        wbs_node["children"] = []
                    wbs_node["children"].append(task)
        
        # Sort tasks by start date
        tasks.sort(key=lambda x: x['start'] if x['start'] else '9999-12-31')
        
        return {
            "success": True,
            "tasks": tasks,
            "wbs": list(wbs_map.values()),
            "count": len(tasks)
        }
        
    except Exception as e:
        print(f"Error parsing Primavera XML: {e}")
        return {"success": False, "error": str(e)}

if __name__ == "__main__":
    # Test with a dummy string if needed
    pass
