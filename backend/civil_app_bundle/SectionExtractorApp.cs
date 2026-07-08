using System;
using System.IO;
using System.Collections.Generic;
using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.Civil.ApplicationServices;
using Autodesk.Civil.DatabaseServices;

// CRÍTICO: cuando el assembly declara atributos CommandClass (hay uno en
// AlignmentExtractorApp.cs), AutoCAD SOLO escanea esas clases. Sin esta línea,
// ExtractSectionsJSON queda como "Unknown command" en accoreconsole.
[assembly: Autodesk.AutoCAD.Runtime.CommandClass(typeof(AlignmentExtractorApp.SectionCommands))]

// ─────────────────────────────────────────────────────────────────────────────
// SectionExtractor v2 — "extraer TODO lo que Civil ya procesó, descartar después"
//
// Cambios vs v1:
//  - schemaVersion 2: { schemaVersion, generatedAt, warnings[], stations[] }
//  - points ORDENADOS tal como Civil los dibuja (no pares de links sueltos)
//  - styleName (identidad limpia: "00 Terreno Natural", "_Hatch Relleno")
//  - sourceName (superficie/corredor de origen), area (m² si Civil la expone),
//    closed (si el contorno cierra)
//  - shapes de corredor con offset/elevación ABSOLUTOS vía XYZ (adiós al
//    desfase relativo-a-rasante) — con fallback al SOE relativo marcado como tal
//  - warnings[] en el JSON: nada de fallos silenciosos
//  - serialización tolerante a NaN/Infinity (se sanean a null)
// ─────────────────────────────────────────────────────────────────────────────

namespace AlignmentExtractorApp
{
    public class SectionDataV2
    {
        public string alignmentId { get; set; }
        public string sampleLineGroupId { get; set; }
        public string sampleLineName { get; set; }
        public double station { get; set; }
        // v3: marco de la Section View del cadista (Civil recorta el dibujo a
        // este rectángulo; el visor debe hacer lo mismo).
        public double? viewOffsetLeft { get; set; }
        public double? viewOffsetRight { get; set; }
        public double? viewElevMin { get; set; }
        public double? viewElevMax { get; set; }
        // v4: la LÁMINA tal cual — textos impresos junto a la vista (bandas del
        // cadista: CT=, CC=, etc.). bandCT/bandCC parseados de esos textos; el
        // visor los muestra idénticos a la lámina, sea cual sea la config.
        public List<string> bandTexts { get; set; }
        public double? bandCT { get; set; }
        public double? bandCC { get; set; }
        // v4: cuadro de metrados (QTO) de la vista, celda por celda.
        public List<List<string>> qtoTable { get; set; }
        public List<SectionShapeV2> sections { get; set; } = new List<SectionShapeV2>();
    }

    public class SectionShapeV2
    {
        public string name { get; set; }
        public string styleName { get; set; }
        public string sourceType { get; set; }
        public string sourceName { get; set; }
        // identidad EXACTA del material QTO ("Corte. Eject.", "Rell. Over")
        public string materialName { get; set; }
        // capa de dibujo ("09.03 Materiales", "02.09 Vista de secciones")
        public string layer { get; set; }
        public double? area { get; set; }
        public bool closed { get; set; }
        public bool draw { get; set; } = true;
        public string exactColor { get; set; }
        public bool isHatch { get; set; }
        // [[offset, elevation], ...] en ORDEN de dibujo de Civil
        public List<double?[]> points { get; set; } = new List<double?[]>();
        // solo shapes de corredor: true si offset/elev son absolutos (via XYZ)
        public bool? absolute { get; set; }
    }

    public class SectionResultV2
    {
        public int schemaVersion { get; set; } = 3;
        public string generatedAt { get; set; }
        public List<string> warnings { get; set; } = new List<string>();
        public List<SectionDataV2> stations { get; set; } = new List<SectionDataV2>();
    }

    public class SectionCommands
    {
        [Autodesk.AutoCAD.Runtime.CommandMethod("ExtractSectionsJSON")]
        public static void ExtractSectionsJSON()
        {
            Document doc = Application.DocumentManager.MdiActiveDocument;
            try
            {
                doc.Editor.WriteMessage("\nExtracting Civil 3D Sections (v2)...\n");
                SectionRunner.Run();
                doc.Editor.WriteMessage("\nSection extraction completed successfully.\n");
            }
            catch (Exception ex)
            {
                doc.Editor.WriteMessage($"\nFATAL ERROR: {ex.GetType().Name} - {ex.Message}\nStack Trace: {ex.StackTrace}\n");
                // aún así, dejar un resultado con el error para que la web lo reporte
                try
                {
                    var res = new SectionResultV2 { generatedAt = DateTime.UtcNow.ToString("o") };
                    res.warnings.Add($"FATAL: {ex.GetType().Name} - {ex.Message}");
                    File.WriteAllText("section_result.json", SectionRunner.SerializeSafe(res));
                }
                catch { }
            }
        }
    }

    public static class SectionRunner
    {
        // ── helpers de reflexión defensiva (con reporte, no silencio) ──
        private static object TryGet(object target, string prop)
        {
            if (target == null) return null;
            try
            {
                var p = target.GetType().GetProperty(prop);
                return p != null ? p.GetValue(target) : null;
            }
            catch { return null; }
        }

        private static double? TryNum(object target, params string[] names)
        {
            foreach (var n in names)
            {
                var v = TryGet(target, n);
                if (v != null)
                {
                    try { return Convert.ToDouble(v); } catch { }
                }
            }
            return null;
        }

        // Área (m²) de un hatch con posibles VARIOS loops concatenados (los
        // hatches de Civil vuelven al punto inicial de cada loop). Shoelace
        // FIRMADO por loop: los agujeros (islas, sentido opuesto) RESTAN —
        // coherente con even-odd. La matemática vive AQUÍ, el visor solo dibuja.
        private static double LoopArea(List<double?[]> pts)
        {
            double total = 0;
            int start = 0;
            Action<int, int> addLoop = (s, e) => {
                double a = 0;
                for (int i = s; i < e; i++) {
                    var p1 = pts[i]; var p2 = pts[i + 1];
                    if (!p1[0].HasValue || !p2[0].HasValue) return;
                    a += p1[0].Value * p2[1].Value - p2[0].Value * p1[1].Value;
                }
                total += a / 2.0; // firmado: agujero resta
            };
            for (int i = start + 2; i < pts.Count; i++) {
                if (!pts[i][0].HasValue || !pts[start][0].HasValue) continue;
                double dx = pts[i][0].Value - pts[start][0].Value;
                double dy = pts[i][1].Value - pts[start][1].Value;
                if (Math.Sqrt(dx * dx + dy * dy) < 0.05) {
                    addLoop(start, i);
                    start = i + 1;
                    i = start + 1;
                }
            }
            if (start < pts.Count - 1) addLoop(start, pts.Count - 1);
            return Math.Abs(total);
        }

        private static double? Clean(double? v)
        {
            if (!v.HasValue) return null;
            if (double.IsNaN(v.Value) || double.IsInfinity(v.Value)) return null;
            return v.Value;
        }

        private static string ResolveName(Transaction trans, ObjectId id)
        {
            try
            {
                if (id.IsNull) return null;
                var obj = trans.GetObject(id, OpenMode.ForRead);
                return TryGet(obj, "Name") as string;
            }
            catch { return null; }
        }

        public static string SerializeSafe(object payload)
        {
            var options = new System.Text.Json.JsonSerializerOptions
            {
                WriteIndented = false,
                NumberHandling = System.Text.Json.Serialization.JsonNumberHandling.AllowNamedFloatingPointLiterals
            };
            return System.Text.Json.JsonSerializer.Serialize(payload, options);
        }

        [System.Runtime.CompilerServices.MethodImpl(System.Runtime.CompilerServices.MethodImplOptions.NoInlining)]
        public static void Run()
        {
            Document doc = Application.DocumentManager.MdiActiveDocument;
            Database db = doc.Database;
            var result = new SectionResultV2 { generatedAt = DateTime.UtcNow.ToString("o") };
            Action<string> ping = (msg) => {
                try { doc.Editor.WriteMessage($"\n[SEC] {msg}\n"); } catch { }
            };
            ping("Run started");

            using (Transaction trans = db.TransactionManager.StartTransaction())
            {
                ping("tx started");
                // ── SectionViews (AeccDbGraphCrossSection): leer la config REAL del
                // cadista — (a) marco de la vista (Offset/Elevation min-max) y
                // (b) GraphOverrides = filas del tab "Sections" (Draw / estilo).
                var secOverridesMap = new Dictionary<ObjectId, dynamic>();
                var overridesBySampleLine = new Dictionary<ObjectId, List<dynamic>>();
                var frameBySampleLine = new Dictionary<ObjectId, double?[]>();
                // v4: ubicación de cada vista (para asociarle textos de banda y
                // cuadros QTO por cercanía) + lo recolectado en el dibujo.
                var locBySampleLine = new Dictionary<ObjectId, double[]>();
                var rawTexts = new List<object[]>();   // [x, y, texto]
                var rawQtos = new List<object[]>();    // [x, y, List<List<string>> filas]
                var textsBySL = new Dictionary<ObjectId, List<string>>();
                var qtoBySL = new Dictionary<ObjectId, List<List<string>>>();
                try {
                    var bt = trans.GetObject(db.BlockTableId, OpenMode.ForRead) as BlockTable;
                    bool ovDumped = false;
                    bool qtoDumped = false;
                    // v4 defensivo: solo ModelSpace + Paper layouts (donde vive Civil).
                    // Escanear TODOS los BTR (incluidos bloques anónimos de láminas)
                    // colgó el motor a >60s en DWGs con muchas Section Views.
                    var scanBtrs = new List<ObjectId>();
                    scanBtrs.Add(SymbolUtilityServices.GetBlockModelSpaceId(db));
                    try {
                        var layoutDict = trans.GetObject(db.LayoutDictionaryId, OpenMode.ForRead) as DBDictionary;
                        if (layoutDict != null) {
                            foreach (DBDictionaryEntry ent in layoutDict) {
                                try {
                                    var layout = trans.GetObject(ent.Value, OpenMode.ForRead) as Layout;
                                    if (layout != null && layout.BlockTableRecordId != SymbolUtilityServices.GetBlockModelSpaceId(db))
                                        scanBtrs.Add(layout.BlockTableRecordId);
                                } catch { }
                            }
                        }
                    } catch { }
                    int scanCap = 200000; // tope duro anti-cuelgue
                    int scanned = 0;
                    ping($"scanning {scanBtrs.Count} BTRs");
                    foreach (ObjectId btrId in scanBtrs) {
                        BlockTableRecord btr = null;
                        try { btr = trans.GetObject(btrId, OpenMode.ForRead) as BlockTableRecord; } catch { }
                        if (btr == null) continue;
                        foreach (ObjectId entId in btr) {
                            if (++scanned > scanCap) break;
                            string cls;
                            try { cls = entId.ObjectClass.Name; } catch { continue; }

                            // v4: textos sueltos (las bandas del cadista imprimen CT=/CC= como texto)
                            if (cls == "AcDbText" || cls == "AcDbMText") {
                                try {
                                    var tobj = trans.GetObject(entId, OpenMode.ForRead);
                                    if (tobj is DBText dt && !string.IsNullOrWhiteSpace(dt.TextString))
                                        rawTexts.Add(new object[] { dt.Position.X, dt.Position.Y, dt.TextString.Trim() });
                                    else if (tobj is MText mt && !string.IsNullOrWhiteSpace(mt.Text))
                                        rawTexts.Add(new object[] { mt.Location.X, mt.Location.Y, mt.Text.Trim() });
                                } catch { }
                                continue;
                            }

                            // v4: cuadros de metrados (QTO) — leerlos celda por celda
                            if (cls.IndexOf("QuantityTakeoffTable", StringComparison.OrdinalIgnoreCase) >= 0) {
                                try {
                                    var tobj = trans.GetObject(entId, OpenMode.ForRead);
                                    var tbl = tobj as Autodesk.AutoCAD.DatabaseServices.Table;
                                    if (tbl != null) {
                                        var rows = new List<List<string>>();
                                        int nr = 0; int nc = 0;
                                        try { nr = tbl.Rows.Count; nc = tbl.Columns.Count; } catch { }
                                        for (int r = 0; r < nr && r < 80; r++) {
                                            var row = new List<string>();
                                            for (int c = 0; c < nc && c < 16; c++) {
                                                string cell = "";
                                                try { cell = tbl.Cells[r, c].TextString; } catch { }
                                                row.Add(cell ?? "");
                                            }
                                            rows.Add(row);
                                        }
                                        if (rows.Count > 0)
                                            rawQtos.Add(new object[] { tbl.Position.X, tbl.Position.Y, rows });
                                    } else if (!qtoDumped) {
                                        qtoDumped = true;
                                        var pn = new List<string>();
                                        foreach (var p in tobj.GetType().GetProperties()) pn.Add(p.Name);
                                        result.warnings.Add($"DIAG QTO ({cls}) no es Table; props: {string.Join(",", pn)}");
                                    }
                                } catch (Exception qe) {
                                    if (!qtoDumped) { qtoDumped = true; result.warnings.Add("DIAG QTO error: " + qe.Message); }
                                }
                                continue;
                            }

                            if (cls != "AeccDbGraphCrossSection" && cls != "AeccDbGraphSectionView" && cls != "AeccDbSectionView") continue;
                            dynamic sv = null;
                            try { sv = trans.GetObject(entId, OpenMode.ForRead); } catch { }
                            if (sv == null) continue;

                            // (a) marco de la vista, indexado por su Sample Line
                            ObjectId slKey = ObjectId.Null;
                            try { slKey = (ObjectId)sv.SampleLineId; } catch { }
                            if (!slKey.IsNull) {
                                frameBySampleLine[slKey] = new double?[] {
                                    Clean(TryNum(sv, "OffsetLeft")),
                                    Clean(TryNum(sv, "OffsetRight")),
                                    Clean(TryNum(sv, "ElevationMin")),
                                    Clean(TryNum(sv, "ElevationMax"))
                                };
                                try {
                                    var loc = sv.Location;
                                    locBySampleLine[slKey] = new double[] { (double)loc.X, (double)loc.Y };
                                } catch { }
                            }

                            // (b) filas de la Section View: Draw real por sección
                            try {
                                dynamic overrides = sv.GraphOverrides;
                                if (overrides != null) {
                                    var ovList = new List<dynamic>();
                                    foreach (var item in overrides) {
                                        if (!ovDumped) {
                                            ovDumped = true;
                                            var pn = new List<string>();
                                            foreach (var p in ((object)item).GetType().GetProperties()) pn.Add(p.Name);
                                            result.warnings.Add($"DIAG GraphOverride props: {string.Join(",", pn)}");
                                        }
                                        ovList.Add(item);
                                        // mapear directo por id de la sección si el SDK lo expone
                                        var secRef = TryGet(item, "SectionId") ?? TryGet(item, "EntityId") ?? TryGet(item, "Id");
                                        if (secRef is ObjectId oid && !oid.IsNull) secOverridesMap[oid] = item;
                                    }
                                    if (!slKey.IsNull) overridesBySampleLine[slKey] = ovList;
                                }
                            } catch (Exception goEx) {
                                result.warnings.Add("GraphOverrides: " + goEx.Message);
                            }
                        }
                    }
                    ping($"scan end: {scanned} ents, {frameBySampleLine.Count} vistas, {rawTexts.Count} textos, {rawQtos.Count} QTO");
                    result.warnings.Add($"DIAG v3: vistas con marco={frameBySampleLine.Count}, overrides mapeados por id={secOverridesMap.Count}, por vista={overridesBySampleLine.Count}");

                    // v4: asociar textos/QTO a la vista MÁS CERCANA (las láminas van
                    // en grilla; el corte es 0.75× del espaciado mínimo entre vistas).
                    var locList = new List<KeyValuePair<ObjectId, double[]>>(locBySampleLine);
                    double minSpacing = double.MaxValue;
                    for (int a = 0; a < locList.Count; a++)
                        for (int b = a + 1; b < locList.Count; b++) {
                            double dx = locList[a].Value[0] - locList[b].Value[0];
                            double dy = locList[a].Value[1] - locList[b].Value[1];
                            double dd = Math.Sqrt(dx * dx + dy * dy);
                            if (dd > 1e-6 && dd < minSpacing) minSpacing = dd;
                        }
                    double cutoff = locList.Count <= 1 ? double.MaxValue : minSpacing * 0.75;

                    ObjectId NearestSL(double x, double y, out double dist) {
                        ObjectId best = ObjectId.Null; dist = double.MaxValue;
                        foreach (var kv in locList) {
                            double dx = kv.Value[0] - x; double dy = kv.Value[1] - y;
                            double dd = Math.Sqrt(dx * dx + dy * dy);
                            if (dd < dist) { dist = dd; best = kv.Key; }
                        }
                        return best;
                    }

                    foreach (var t in rawTexts) {
                        var sl = NearestSL((double)t[0], (double)t[1], out var dT);
                        if (sl.IsNull || dT > cutoff) continue;
                        if (!textsBySL.TryGetValue(sl, out var lst)) { lst = new List<string>(); textsBySL[sl] = lst; }
                        if (lst.Count < 40) lst.Add((string)t[2]);
                    }
                    foreach (var q in rawQtos) {
                        var sl = NearestSL((double)q[0], (double)q[1], out var dQ);
                        if (sl.IsNull || dQ > cutoff * 2) continue; // los cuadros van algo más lejos de la vista
                        if (!qtoBySL.ContainsKey(sl)) qtoBySL[sl] = (List<List<string>>)q[2];
                    }
                    result.warnings.Add($"DIAG v4: textos={rawTexts.Count} → {textsBySL.Count} vistas · QTO={rawQtos.Count} → {qtoBySL.Count} vistas");
                } catch (Exception e) {
                    result.warnings.Add("Error escaneando SectionViews: " + e.Message);
                }

                var sectionTypesDumped = new HashSet<string>();
                ping("civilDoc access");
                var civilDoc = Autodesk.Civil.ApplicationServices.CivilApplication.ActiveDocument;
                ObjectIdCollection alignIds = civilDoc.GetAlignmentIds();
                ping($"{alignIds.Count} alignments");
                if (alignIds.Count == 0) result.warnings.Add("El DWG no tiene alineamientos.");

                // v4: CURACIÓN — si llega params.json ({"alignmentIds":[...]}), solo
                // se extraen las secciones de esos ejes (lo que el usuario marcó
                // como real). Sin params = comportamiento de siempre (todo).
                HashSet<string> onlyAligns = null;
                try {
                    if (File.Exists("params.json")) {
                        using (var pdoc = System.Text.Json.JsonDocument.Parse(File.ReadAllText("params.json"))) {
                            if (pdoc.RootElement.TryGetProperty("alignmentIds", out var arr)
                                && arr.ValueKind == System.Text.Json.JsonValueKind.Array) {
                                onlyAligns = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                                foreach (var it in arr.EnumerateArray()) {
                                    var s = it.GetString();
                                    if (!string.IsNullOrWhiteSpace(s)) onlyAligns.Add(s.Trim());
                                }
                                if (onlyAligns.Count == 0) onlyAligns = null;
                            }
                        }
                        result.warnings.Add($"v4: filtro de ejes activo ({(onlyAligns == null ? 0 : onlyAligns.Count)})");
                    }
                } catch (Exception pe) { result.warnings.Add("params.json ilegible: " + pe.Message); }

                int alignIdx = 0;
                foreach (ObjectId alignId in alignIds)
                {
                    alignIdx++;
                    Alignment alignment = trans.GetObject(alignId, OpenMode.ForRead) as Alignment;
                    if (alignment == null) continue;
                    if (onlyAligns != null && !onlyAligns.Contains(alignment.Name)) continue;
                    ping($"[{alignIdx}/{alignIds.Count}] {alignment.Name} start");

                    ObjectIdCollection slgIds = alignment.GetSampleLineGroupIds();
                    ping($"  {slgIds.Count} SLGs");
                    if (slgIds.Count == 0)
                        result.warnings.Add($"Alineamiento '{alignment.Name}': sin Sample Line Groups (no hay secciones que extraer).");

                    foreach (ObjectId slgId in slgIds)
                    {
                        SampleLineGroup slg = trans.GetObject(slgId, OpenMode.ForRead) as SampleLineGroup;
                        if (slg == null) continue;

                        ObjectIdCollection slIds = slg.GetSampleLineIds();
                        int slIdx = 0;
                        // heartbeat cada N sample lines para no dejar mudo al motor
                        int pingEvery = 5;
                        foreach (ObjectId slId in slIds)
                        {
                            slIdx++;
                            if (slIdx % pingEvery == 0) ping($"  SL {slIdx}/{slIds.Count}");
                            SampleLine sl = trans.GetObject(slId, OpenMode.ForRead) as SampleLine;
                            if (sl == null) continue;

                            var secData = new SectionDataV2
                            {
                                alignmentId = alignment.Name,
                                sampleLineGroupId = slg.Name,
                                sampleLineName = sl.Name,
                                station = sl.Station
                            };

                            // v3: marco de la Section View de esta estación (para recortar como Civil)
                            if (frameBySampleLine.TryGetValue(slId, out var frame)) {
                                secData.viewOffsetLeft = frame[0];
                                secData.viewOffsetRight = frame[1];
                                secData.viewElevMin = frame[2];
                                secData.viewElevMax = frame[3];
                            }

                            // v4: textos de banda de la LÁMINA (CT=/CC= del cadista, tal cual)
                            if (textsBySL.TryGetValue(slId, out var bandTexts) && bandTexts.Count > 0) {
                                secData.bandTexts = bandTexts;
                                foreach (var btx in bandTexts) {
                                    if (secData.bandCT == null) {
                                        var m = System.Text.RegularExpressions.Regex.Match(btx, @"(?<![A-Za-z])C\.?T\.?\s*[=:]\s*(-?\d+(?:[.,]\d+)?)");
                                        if (m.Success && double.TryParse(m.Groups[1].Value.Replace(',', '.'), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var vct))
                                            secData.bandCT = vct;
                                    }
                                    if (secData.bandCC == null) {
                                        var m = System.Text.RegularExpressions.Regex.Match(btx, @"(?<![A-Za-z])C\.?C\.?\s*[=:]\s*(-?\d+(?:[.,]\d+)?)");
                                        if (m.Success && double.TryParse(m.Groups[1].Value.Replace(',', '.'), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var vcc))
                                            secData.bandCC = vcc;
                                    }
                                }
                            }
                            // v4: cuadro de metrados de esta vista
                            if (qtoBySL.TryGetValue(slId, out var qtoRows)) secData.qtoTable = qtoRows;
                            List<dynamic> slOverrides = null;
                            overridesBySampleLine.TryGetValue(slId, out slOverrides);

                            var sampledSources = new HashSet<ObjectId>();

                            // ── 1) Secciones del sample line: puntos EN ORDEN + estilo + área ──
                            ObjectIdCollection sectionIds = sl.GetSectionIds();
                            int secIdx = -1;
                            foreach (ObjectId secId in sectionIds)
                            {
                                secIdx++;
                                var section = trans.GetObject(secId, OpenMode.ForRead) as Autodesk.Civil.DatabaseServices.Section;
                                if (section == null) continue;
                                try { sampledSources.Add(section.SourceId); } catch { }

                                var shape = new SectionShapeV2
                                {
                                    name = section.Name,
                                    sourceType = section.GetType().Name,
                                };

                                // Identidad LIMPIA: estilo + objeto de origen + material QTO + capa
                                bool draw = true;
                                ObjectId? styleId = null;

                                // Draw REAL del cadista: por id de sección; si el SDK no expone
                                // el id en la fila, por índice (las filas van en el orden de
                                // GetSectionIds de la misma sample line).
                                dynamic ov = null;
                                if (!secOverridesMap.TryGetValue(secId, out ov)) {
                                    if (slOverrides != null && secIdx < slOverrides.Count) ov = slOverrides[secIdx];
                                }
                                if (ov != null) {
                                    try {
                                        var drawVal = TryGet(ov, "Draw") ?? TryGet(ov, "DrawSection") ?? TryGet(ov, "Visible");
                                        if (drawVal is bool drw) draw = drw;
                                        if (TryGet(ov, "UseOverrideStyle") is bool uo && uo) {
                                            styleId = TryGet(ov, "OverrideStyleId") as ObjectId?;
                                        }
                                    } catch {}
                                }
                                if (styleId == null || !styleId.HasValue || styleId.Value.IsNull) {
                                    try { styleId = section.StyleId; } catch { }
                                }
                                // StyleName es propiedad DIRECTA del SDK (descubierto por DIAG).
                                // Capturamos la excepción UNA vez para saber la verdad si falla.
                                try { shape.styleName = section.StyleName; }
                                catch (Exception exSn) {
                                    if (sectionTypesDumped.Add("SNERR")) result.warnings.Add($"DIAG StyleName lanza: {exSn.GetType().Name} {exSn.Message}");
                                }

                                // MaterialSection: clase propia con la identidad del material QTO
                                if (section is MaterialSection matSec)
                                {
                                    if (sectionTypesDumped.Add("MATPROPS")) {
                                        var pn = new List<string>();
                                        foreach (var p in typeof(MaterialSection).GetProperties()) pn.Add(p.Name);
                                        result.warnings.Add($"DIAG MaterialSection TODAS: {string.Join(",", pn)}");
                                    }
                                    shape.materialName = TryGet(matSec, "MaterialName") as string
                                        ?? TryGet(matSec, "Material") as string;
                                    var matArea = Clean(TryNum(matSec, "Area", "SectionArea"));
                                    if (matArea.HasValue && matArea.Value > 0) shape.area = matArea;
                                }
                                
                                shape.draw = draw;
                                // Solo como respaldo: NO pisar el StyleName directo si ya lo tenemos
                                if (string.IsNullOrEmpty(shape.styleName)) {
                                    try { shape.styleName = ResolveName(trans, (ObjectId)(styleId ?? ObjectId.Null)); } catch { }
                                }
                                
                                if (styleId.HasValue && !styleId.Value.IsNull) {
                                    try {
                                        dynamic style = trans.GetObject(styleId.Value, OpenMode.ForRead);
                                        var method = style.GetType().GetMethod("GetDisplayStyleSection") ?? style.GetType().GetMethod("GetDisplayStylePlan");
                                        if (method != null) {
                                            dynamic displayStyle = null;
                                            bool isHatch = false;
                                            var parameters = method.GetParameters();
                                            if (parameters.Length == 1) {
                                                var enumType = parameters[0].ParameterType;
                                                foreach (var enumVal in Enum.GetValues(enumType)) {
                                                    try {
                                                        dynamic ds = method.Invoke(style, new object[] { enumVal });
                                                        if (ds != null && (bool)ds.Visible) {
                                                            displayStyle = ds;
                                                            string enumName = enumVal.ToString();
                                                            if (enumName != null && (enumName.Contains("Area") || enumName.Contains("Hatch"))) {
                                                                isHatch = true; break;
                                                            }
                                                        }
                                                    } catch {}
                                                }
                                            }
                                            if (displayStyle != null) {
                                                var cadColor = displayStyle.Color;
                                                shape.exactColor = $"#{cadColor.ColorValue.R:X2}{cadColor.ColorValue.G:X2}{cadColor.ColorValue.B:X2}";
                                                shape.isHatch = isHatch;
                                            }
                                        }
                                    } catch {}
                                }
                                try { shape.sourceName = ResolveName(trans, section.SourceId); } catch { }
                                shape.materialName = TryGet(section, "MaterialName") as string;
                                shape.layer = TryGet(section, "Layer") as string;

                                // Área si Civil la expone (Material List la tiene calculada)
                                shape.area = Clean(TryNum(section, "Area"));

                                // ¿Contorno cerrado?
                                var closedVal = TryGet(section, "IsClosed") ?? TryGet(section, "Closed");
                                if (closedVal is bool b) shape.closed = b;

                                // Puntos EN ORDEN (como Civil los dibuja)
                                try
                                {
                                    var pts = section.SectionPoints;
                                    if (pts != null)
                                    {
                                        foreach (object pt in pts)
                                        {
                                            var loc = TryGet(pt, "Location");
                                            var x = Clean(TryNum(loc, "X"));
                                            var y = Clean(TryNum(loc, "Y"));
                                            if (x.HasValue && y.HasValue)
                                                shape.points.Add(new double?[] { x, y });
                                        }
                                    }
                                    if (shape.points.Count == 0)
                                        result.warnings.Add($"Sección '{section.Name}' @PK {sl.Station:F2}: sin puntos legibles.");
                                }
                                catch (Exception e)
                                {
                                    result.warnings.Add($"Sección '{section.Name}' @PK {sl.Station:F2}: {e.Message}");
                                }

                                // Si Civil no reporta 'closed', inferirlo del contorno
                                if (!shape.closed && shape.points.Count > 3)
                                {
                                    var f = shape.points[0]; var l = shape.points[shape.points.Count - 1];
                                    if (f[0].HasValue && l[0].HasValue &&
                                        Math.Abs(f[0].Value - l[0].Value) < 0.001 && Math.Abs(f[1].Value - l[1].Value) < 0.001)
                                        shape.closed = true;
                                }

                                // v3: área oficial calculada AQUÍ (Civil suele exponer 0).
                                // Solo para cuerpos (hatch/cerrados); shoelace por loop.
                                if ((!shape.area.HasValue || shape.area.Value <= 0)
                                    && (shape.isHatch || shape.closed) && shape.points.Count >= 3)
                                {
                                    var a = LoopArea(shape.points);
                                    if (a > 0) shape.area = Math.Round(a, 4);
                                }

                                secData.sections.Add(shape);
                            }

                            // ── 2) Shapes del corredor: coordenadas ABSOLUTAS vía XYZ ──
                            try
                            {
                                if (civilDoc.CorridorCollection != null)
                                {
                                    foreach (ObjectId corridorId in civilDoc.CorridorCollection)
                                    {
                                        if (!sampledSources.Contains(corridorId)) continue;
                                        Corridor corridor = trans.GetObject(corridorId, OpenMode.ForRead) as Corridor;
                                        if (corridor == null) continue;

                                        dynamic dynCorridor = corridor;
                                        foreach (var baseline in dynCorridor.Baselines)
                                        {
                                            foreach (var region in baseline.BaselineRegions)
                                            {
                                                foreach (var assembly in region.AppliedAssemblies)
                                                {
                                                    dynamic dynAssembly = assembly;
                                                    dynamic shapes = null;
                                                    try { shapes = dynAssembly.Shapes; } catch { }
                                                    if (shapes == null) continue;

                                                    foreach (var calcShape in shapes)
                                                    {
                                                        var shape = new SectionShapeV2
                                                        {
                                                            sourceType = "CorridorShape",
                                                            sourceName = corridor.Name,
                                                            closed = true,
                                                        };
                                                        double shapeStation = -1.0;
                                                        bool hasPoints = false;
                                                        bool usedAbsolute = false;

                                                        try
                                                        {
                                                            dynamic dynShape = calcShape;
                                                            var codes = new List<string>();
                                                            try { foreach (var c in dynShape.CorridorCodes) codes.Add(c.ToString()); } catch { }
                                                            shape.name = codes.Count > 0 ? string.Join(",", codes) : "Shape";

                                                            foreach (var calcLink in dynShape.CalculatedLinks)
                                                            {
                                                                dynamic pts = calcLink.CalculatedPoints;
                                                                for (int i = 0; i < pts.Count; i++)
                                                                {
                                                                    dynamic pt = pts[i];
                                                                    dynamic soe = pt.StationOffsetElevationToBaseline;
                                                                    if (!hasPoints)
                                                                    {
                                                                        shapeStation = Convert.ToDouble(soe.X);
                                                                        hasPoints = true;
                                                                    }
                                                                    double offset = Convert.ToDouble(soe.Y);

                                                                    // elevación ABSOLUTA desde XYZ (mundo);
                                                                    // fallback: SOE.Z (relativa a rasante)
                                                                    double? elevAbs = null;
                                                                    try
                                                                    {
                                                                        dynamic xyz = pt.XYZ;
                                                                        elevAbs = Convert.ToDouble(xyz.Z);
                                                                        usedAbsolute = true;
                                                                    }
                                                                    catch { }
                                                                    double elev = elevAbs ?? Convert.ToDouble(soe.Z);

                                                                    var cx = Clean(offset); var cy = Clean(elev);
                                                                    if (cx.HasValue && cy.HasValue)
                                                                        shape.points.Add(new double?[] { cx, cy });
                                                                }
                                                            }
                                                        }
                                                        catch (Exception ex)
                                                        {
                                                            result.warnings.Add($"CorridorShape '{shape.name}' @PK {sl.Station:F2}: {ex.Message}");
                                                        }

                                                        shape.absolute = usedAbsolute;
                                                        if (hasPoints && Math.Abs(shapeStation - sl.Station) < 1.0 && shape.points.Count >= 3)
                                                            secData.sections.Add(shape);
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            catch (Exception ex)
                            {
                                result.warnings.Add($"Corredor @PK {sl.Station:F2}: {ex.Message}");
                            }

                            result.stations.Add(secData);
                        }
                    }
                }

                File.WriteAllText("section_result.json", SerializeSafe(result));
                doc.Editor.WriteMessage($"\n[v2] Estaciones: {result.stations.Count} | Warnings: {result.warnings.Count}\n");
                trans.Commit();
            }
        }
    }
}
