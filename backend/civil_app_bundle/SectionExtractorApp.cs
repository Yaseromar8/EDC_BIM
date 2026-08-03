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
        // v5 AUDITOR: filas del Material List del CORRIDOR (fuente oficial de
        // cantidades del cadista). Se construyen navegando Corridor.MaterialLists.
        // Se pueblan por sample line si el corredor las expone; si no, quedan
        // implícitas en los MaterialSection dentro de sections[] (que ya traen
        // area, leftOffset, rightOffset).
        public List<CorridorMaterialV5> corridorMaterials { get; set; }
        public List<SectionShapeV2> sections { get; set; } = new List<SectionShapeV2>();
    }

    // v5: fila del Material List del Corridor por SL — cantidades oficiales de Civil
    public class CorridorMaterialV5
    {
        public string corridorName { get; set; }
        public string materialListName { get; set; }
        public string materialName { get; set; }
        public double? area { get; set; }
        public double? volume { get; set; }
        public double? cumulativeVolume { get; set; }
    }

    // ── v6 SONDEO QTO: la RECETA que el cadista configuró en Compute Materials ──
    // Cada material del Material List del Sample Line Group se define comparando
    // SUPERFICIES (encima/debajo) y/o shapes de corredor. Esto es la fuente para
    // saber qué materiales pueden reconstruirse como sólido continuo entre
    // topografías (misma configuración del cadista, evaluada fuera de las SL).
    public class QtoRecipeItemV6
    {
        public string kind { get; set; }       // "surface" | "corridor" | "shape" | "structure"
        public string name { get; set; }       // nombre de la superficie / corredor
        public string condition { get; set; }  // "Above" | "Below" (solo superficies)
    }

    public class QtoRecipeV6
    {
        public string alignmentId { get; set; }
        public string sampleLineGroup { get; set; }
        public string materialListName { get; set; }
        public string materialListGuid { get; set; }
        public string materialName { get; set; }
        public string quantityType { get; set; } // Cut / Fill / CutAndRefill / Structures…
        public string shapeStyle { get; set; }
        public List<QtoRecipeItemV6> items { get; set; } = new List<QtoRecipeItemV6>();
    }

    // v6: inventario de superficies TIN del DWG (topografías disponibles)
    public class SurfaceInfoV6
    {
        public string name { get; set; }
        public string type { get; set; }          // TinSurface / TinVolumeSurface / GridSurface
        public string description { get; set; }
        public long? triangles { get; set; }
        public long? points { get; set; }
        public double?[] extents { get; set; }    // [minX, minY, maxX, maxY] mundo
        public double?[] elevRange { get; set; }  // [minZ, maxZ]
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
        // v6 SONDEO: recetas QTO del cadista + inventario de topografías.
        // Aditivos al contrato (los consumidores viejos los ignoran).
        public List<QtoRecipeV6> qtoRecipes { get; set; }
        public List<SurfaceInfoV6> surfaces { get; set; }
    }

    // ── v7 FASE 2: triángulos crudos de las topografías que usan las recetas
    // QTO — el backend evalúa la receta del cadista en CONTINUO y construye el
    // sólido por material. Salida propia (surfaces_result.json) para no
    // engordar la extracción de secciones.
    public class SurfaceMeshV7
    {
        public string name { get; set; }
        public int triCount { get; set; }
        public List<double> vertices { get; set; } = new List<double>();  // x,y,z absolutos
        public List<int> indices { get; set; } = new List<int>();
    }

    public class SurfacesResultV7
    {
        public int schemaVersion { get; set; } = 1;
        public string generatedAt { get; set; }
        public double[] clip { get; set; }
        public List<string> warnings { get; set; } = new List<string>();
        public List<SurfaceMeshV7> surfaces { get; set; } = new List<SurfaceMeshV7>();
    }

    public class SectionCommands
    {
        [Autodesk.AutoCAD.Runtime.CommandMethod("ExtractSurfacesJSON")]
        public static void ExtractSurfacesJSON()
        {
            Document doc = Application.DocumentManager.MdiActiveDocument;
            try
            {
                doc.Editor.WriteMessage("\nExtracting Civil 3D Surfaces (v7)...\n");
                SurfaceRunner.Run();
                doc.Editor.WriteMessage("\nSurface extraction completed.\n");
            }
            catch (Exception ex)
            {
                doc.Editor.WriteMessage($"\nFATAL: {ex.GetType().Name} - {ex.Message}\n");
                try
                {
                    var res = new SurfacesResultV7 { generatedAt = DateTime.UtcNow.ToString("o") };
                    res.warnings.Add($"FATAL: {ex.GetType().Name} - {ex.Message}");
                    File.WriteAllText("surfaces_result.json", SectionRunner.SerializeSafe(res));
                }
                catch { }
            }
        }

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

    public static class SurfaceRunner
    {
        public static void Run()
        {
            Document doc = Application.DocumentManager.MdiActiveDocument;
            Database db = doc.Database;
            var result = new SurfacesResultV7 { generatedAt = DateTime.UtcNow.ToString("o") };
            Action<string> ping = (msg) => { try { doc.Editor.WriteMessage($"\n[SURF] {msg}\n"); } catch { } };

            // params.json: {"surfaceNames":[...], "clip":[minX,minY,maxX,maxY]}
            var wanted = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            double[] clip = null;
            try
            {
                if (File.Exists("params.json"))
                {
                    using (var pdoc = System.Text.Json.JsonDocument.Parse(File.ReadAllText("params.json")))
                    {
                        if (pdoc.RootElement.TryGetProperty("surfaceNames", out var arr) && arr.ValueKind == System.Text.Json.JsonValueKind.Array)
                            foreach (var it in arr.EnumerateArray())
                            {
                                var s = it.GetString();
                                if (!string.IsNullOrWhiteSpace(s)) wanted.Add(s.Trim());
                            }
                        if (pdoc.RootElement.TryGetProperty("clip", out var cl) && cl.ValueKind == System.Text.Json.JsonValueKind.Array && cl.GetArrayLength() == 4)
                        {
                            clip = new double[4];
                            int ci = 0;
                            foreach (var it in cl.EnumerateArray()) clip[ci++] = it.GetDouble();
                        }
                    }
                }
            }
            catch (Exception pe) { result.warnings.Add("params.json ilegible: " + pe.Message); }
            result.clip = clip;
            if (wanted.Count == 0) result.warnings.Add("sin surfaceNames en params.json: no se exporta nada");
            ping($"pedidas={wanted.Count} clip={(clip == null ? "no" : "si")}");

            using (Transaction trans = db.TransactionManager.StartTransaction())
            {
                var civilDoc = Autodesk.Civil.ApplicationServices.CivilApplication.ActiveDocument;
                bool triDumped = false;
                foreach (ObjectId sid in civilDoc.GetSurfaceIds())
                {
                    if (wanted.Count == 0) break;
                    string name = null;
                    object so = null;
                    try
                    {
                        so = trans.GetObject(sid, OpenMode.ForRead);
                        name = so.GetType().GetProperty("Name")?.GetValue(so) as string;
                    }
                    catch { continue; }
                    if (name == null || !wanted.Contains(name)) continue;

                    var mesh = new SurfaceMeshV7 { name = name };
                    var vmap = new Dictionary<(long, long, long), int>();
                    Func<double, double, double, int> addV = (x, y, z) =>
                    {
                        var key = ((long)Math.Round(x * 1000), (long)Math.Round(y * 1000), (long)Math.Round(z * 1000));
                        if (vmap.TryGetValue(key, out int idx)) return idx;
                        idx = mesh.vertices.Count / 3;
                        mesh.vertices.Add(Math.Round(x, 3));
                        mesh.vertices.Add(Math.Round(y, 3));
                        mesh.vertices.Add(Math.Round(z, 3));
                        vmap[key] = idx;
                        return idx;
                    };
                    try
                    {
                        dynamic dsurf = so;
                        object tris = null;
                        try { tris = dsurf.Triangles; } catch { }
                        if (tris == null) { try { tris = dsurf.GetTriangles(false); } catch { } }
                        if (tris == null)
                        {
                            result.warnings.Add($"'{name}': sin acceso a triángulos");
                            continue;
                        }
                        foreach (var t in (System.Collections.IEnumerable)tris)
                        {
                            try
                            {
                                dynamic dt = t;
                                dynamic p1 = dt.Vertex1.Location;
                                dynamic p2 = dt.Vertex2.Location;
                                dynamic p3 = dt.Vertex3.Location;
                                double x1 = p1.X, y1 = p1.Y, z1 = p1.Z;
                                double x2 = p2.X, y2 = p2.Y, z2 = p2.Z;
                                double x3 = p3.X, y3 = p3.Y, z3 = p3.Z;
                                if (clip != null)
                                {
                                    double mnx = Math.Min(x1, Math.Min(x2, x3)), mxx = Math.Max(x1, Math.Max(x2, x3));
                                    double mny = Math.Min(y1, Math.Min(y2, y3)), mxy = Math.Max(y1, Math.Max(y2, y3));
                                    if (mxx < clip[0] || mnx > clip[2] || mxy < clip[1] || mny > clip[3]) continue;
                                }
                                mesh.indices.Add(addV(x1, y1, z1));
                                mesh.indices.Add(addV(x2, y2, z2));
                                mesh.indices.Add(addV(x3, y3, z3));
                                mesh.triCount++;
                            }
                            catch (Exception te)
                            {
                                if (!triDumped)
                                {
                                    triDumped = true;
                                    var pn = new List<string>();
                                    try { foreach (var p in t.GetType().GetProperties()) pn.Add(p.Name); } catch { }
                                    result.warnings.Add($"DIAG triangle ({t.GetType().Name}): {string.Join(",", pn)} err={te.Message}");
                                }
                            }
                        }
                        result.surfaces.Add(mesh);
                        ping($"'{name}': {mesh.triCount} tris, {mesh.vertices.Count / 3} vtx");
                    }
                    catch (Exception se) { result.warnings.Add($"'{name}': {se.Message}"); }
                }
                trans.Commit();
            }
            File.WriteAllText("surfaces_result.json", SectionRunner.SerializeSafe(result));
            ping("surfaces_result.json escrito");
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

        // v8.2: asigna un valor de ENUM por reflexión (el tipo exacto del enum
        // varía entre versiones del SDK; se busca el nombre que contenga la pista)
        private static void SetEnumProp(object target, string propName, string hint)
        {
            if (target == null) return;
            var pi = target.GetType().GetProperty(propName);
            if (pi == null || !pi.CanWrite || !pi.PropertyType.IsEnum) return;
            foreach (var n in Enum.GetNames(pi.PropertyType))
            {
                if (n.ToLowerInvariant().Contains(hint))
                {
                    pi.SetValue(target, Enum.Parse(pi.PropertyType, n));
                    return;
                }
            }
        }

        // ── v8.2 PRE-PASS DENSIFICAR: crear sample lines en memoria y hacer que
        // CIVIL les compute los materiales de la receta del cadista. Corre en
        // su propia transacción con Commit (solo memoria de la sesión: el DWG
        // nunca se guarda; el Result del workitem es únicamente el JSON).
        private static void DensifyPrePass(Database db, SectionResultV2 result)
        {
            double step = 0;
            HashSet<string> onlyA = null;
            try
            {
                if (!File.Exists("params.json")) return;
                using (var pd = System.Text.Json.JsonDocument.Parse(File.ReadAllText("params.json")))
                {
                    if (pd.RootElement.TryGetProperty("densifyStep", out var dsv)) step = dsv.GetDouble();
                    if (pd.RootElement.TryGetProperty("alignmentIds", out var arr) && arr.ValueKind == System.Text.Json.JsonValueKind.Array)
                    {
                        onlyA = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                        foreach (var it in arr.EnumerateArray())
                        {
                            var s = it.GetString();
                            if (!string.IsNullOrWhiteSpace(s)) onlyA.Add(s.Trim());
                        }
                        if (onlyA.Count == 0) onlyA = null;
                    }
                }
            }
            catch { return; }
            if (step <= 0.4) return;
            var dumped = new HashSet<string>();
            using (Transaction tD = db.TransactionManager.StartTransaction())
            {
                var civilDoc = Autodesk.Civil.ApplicationServices.CivilApplication.ActiveDocument;
                foreach (ObjectId alignId in civilDoc.GetAlignmentIds())
                {
                    Alignment al = tD.GetObject(alignId, OpenMode.ForRead) as Alignment;
                    if (al == null) continue;
                    if (onlyA != null && !onlyA.Contains(al.Name)) continue;
                    foreach (ObjectId slgId in al.GetSampleLineGroupIds())
                    {
                        SampleLineGroup slg = null;
                        try { slg = tD.GetObject(slgId, OpenMode.ForWrite) as SampleLineGroup; }
                        catch { try { slg = tD.GetObject(slgId, OpenMode.ForRead) as SampleLineGroup; } catch { } }
                        if (slg == null) continue;
                        var existing = new List<double>();
                        foreach (ObjectId exId in slg.GetSampleLineIds())
                        {
                            var exSl = tD.GetObject(exId, OpenMode.ForRead) as SampleLine;
                            if (exSl != null) existing.Add(exSl.Station);
                        }
                        if (existing.Count < 2) continue;
                        existing.Sort();
                        // fuentes de material → muestreo dinámico
                        try
                        {
                            dynamic mss = ((dynamic)slg).GetMaterialSectionSources();
                            int touched = 0;
                            foreach (var srcx in (System.Collections.IEnumerable)mss)
                            {
                                try { ((dynamic)srcx).IsSampled = true; } catch (Exception e1) { if (dumped.Add("IS")) result.warnings.Add("v8.2 IsSampled: " + e1.Message); }
                                try { SetEnumProp(srcx, "UpdateMode", "dynam"); } catch (Exception e2) { if (dumped.Add("UM")) result.warnings.Add("v8.2 src.UpdateMode: " + e2.Message); }
                                touched++;
                            }
                            result.warnings.Add($"v8.2 fuentes de material tocadas: {touched}");
                        }
                        catch (Exception se) { result.warnings.Add("v8.2 fuentes: " + se.Message); }
                        int created = 0, failed = 0;
                        string firstErr = null;
                        double s0 = existing[0], s1 = existing[existing.Count - 1];
                        for (double s = Math.Ceiling(s0 / step) * step; s < s1; s += step)
                        {
                            bool near = false;
                            foreach (var ex in existing)
                                if (Math.Abs(ex - s) < step * 0.45) { near = true; break; }
                            if (near) continue;
                            try
                            {
                                SampleLine.Create($"ECD_DENS_{s:F0}", slgId, s);
                                created++;
                            }
                            catch (Exception ce)
                            {
                                failed++;
                                if (firstErr == null) firstErr = ce.Message;
                            }
                        }
                        result.warnings.Add($"v8.2 prepass SLG '{slg.Name}': +{created} SL, {failed} fallos{(firstErr != null ? " (" + firstErr + ")" : "")}");
                        // secciones de las SL nuevas → modo dinámico (despierta el cálculo)
                        int wrote = 0;
                        try
                        {
                            foreach (ObjectId exId in slg.GetSampleLineIds())
                            {
                                var exSl = tD.GetObject(exId, OpenMode.ForRead) as SampleLine;
                                if (exSl == null || !exSl.Name.StartsWith("ECD_DENS")) continue;
                                foreach (ObjectId secId in exSl.GetSectionIds())
                                {
                                    Autodesk.Civil.DatabaseServices.Section sec = null;
                                    try { sec = tD.GetObject(secId, OpenMode.ForWrite) as Autodesk.Civil.DatabaseServices.Section; }
                                    catch { continue; }
                                    if (sec == null) continue;
                                    if (dumped.Add("SECMETH"))
                                    {
                                        var mn = new List<string>();
                                        foreach (var mi in sec.GetType().GetMethods())
                                            if (!mi.Name.StartsWith("get_") && !mi.Name.StartsWith("set_")) mn.Add(mi.Name);
                                        result.warnings.Add($"DIAG v8.2 {sec.GetType().Name} methods: {string.Join(",", mn)}");
                                    }
                                    try { SetEnumProp(sec, "UpdateMode", "dynam"); wrote++; }
                                    catch (Exception e3) { if (dumped.Add("SUM")) result.warnings.Add("v8.2 sec.UpdateMode: " + e3.Message); }
                                }
                            }
                        }
                        catch { }
                        result.warnings.Add($"v8.2 secciones a dinámico: {wrote}");
                        // recomputar QTO con el motor de Civil por cada mapping
                        try
                        {
                            var names2 = ((dynamic)slg).GetQTOMappingNames();
                            foreach (var nm in (System.Collections.IEnumerable)names2)
                            {
                                try
                                {
                                    var mg = ((dynamic)slg).GetMappingGuid(nm.ToString());
                                    ((dynamic)slg).GetTotalVolumeResultDataForMaterialList(mg);
                                }
                                catch { }
                            }
                        }
                        catch { }
                    }
                }
                tD.Commit();
            }
            result.warnings.Add("v8.2 prepass: COMMIT en memoria hecho");
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

            // v8.2: el densificado va ANTES y en transacción PROPIA con COMMIT en
            // memoria (el DWG jamás se guarda): anidado en la transacción de
            // lectura, el abort final descartaba el muestreo y las secciones de
            // material de las SL nuevas quedaban vacías.
            try { DensifyPrePass(db, result); }
            catch (Exception dpx) { result.warnings.Add("v8.2 prepass: " + dpx.Message); }

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
                bool svLocDumped = false;
                bool svLocErrDumped = false;
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

                            // v5: cuadros de metrados (QTO) — clase Civil.
                            // Descubierto por DIAG anterior: GetSelectedMaterials() +
                            // MaterialListGuid. Asociar por Location (Extents3d) igual
                            // que las vistas de sección.
                            if (cls.IndexOf("QuantityTakeoffTable", StringComparison.OrdinalIgnoreCase) >= 0) {
                                try {
                                    dynamic qobj = trans.GetObject(entId, OpenMode.ForRead);
                                    // Location por Extents3d (mismo camino que las vistas)
                                    double qx = 0, qy = 0;
                                    bool hasLoc = false;
                                    try {
                                        Extents3d ext = ((Autodesk.AutoCAD.DatabaseServices.Entity)qobj).GeometricExtents;
                                        qx = (ext.MinPoint.X + ext.MaxPoint.X) * 0.5;
                                        qy = (ext.MinPoint.Y + ext.MaxPoint.Y) * 0.5;
                                        hasLoc = true;
                                    } catch { }
                                    // MaterialListGuid = identidad del ML asociado
                                    string mlGuid = null;
                                    try { mlGuid = qobj.MaterialListGuid.ToString(); } catch { }
                                    // Materiales SELECCIONADOS en este cuadro (fuente OFICIAL)
                                    var rows = new List<List<string>>();
                                    rows.Add(new List<string> { "material", "guid" });
                                    try {
                                        dynamic sel = qobj.GetSelectedMaterials();
                                        if (sel != null) {
                                            foreach (dynamic sm in sel) {
                                                string sname = null; string sguid = null;
                                                try { sname = sm.Name as string ?? sm.MaterialName as string; } catch { }
                                                try { sguid = sm.Guid.ToString(); } catch { try { sguid = sm.MaterialGuid.ToString(); } catch { } }
                                                rows.Add(new List<string> { sname ?? "", sguid ?? "" });
                                                if (!qtoDumped) {
                                                    qtoDumped = true;
                                                    var pn = new List<string>();
                                                    foreach (var p in ((object)sm).GetType().GetProperties()) pn.Add(p.Name);
                                                    result.warnings.Add($"DIAG QTOitem props: {string.Join(",", pn)}");
                                                }
                                            }
                                        }
                                    } catch (Exception qe) {
                                        if (!qtoDumped) { qtoDumped = true; result.warnings.Add("DIAG QTO GetSelectedMaterials error: " + qe.Message); }
                                    }
                                    if (mlGuid != null) rows.Insert(0, new List<string> { "MaterialListGuid", mlGuid });
                                    if (hasLoc) rawQtos.Add(new object[] { qx, qy, rows });
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
                                // v5: Location del SectionView. La API expone
                                // Location como Point3d (struct) — el cast dinámico
                                // falla silenciosamente y devuelve 0. Usamos
                                // GeometricExtents que sí retorna un Extents3d con
                                // Min/Max directamente accesibles como double.
                                double? lx = null, ly = null;
                                try {
                                    Extents3d ext = ((Autodesk.AutoCAD.DatabaseServices.Entity)sv).GeometricExtents;
                                    lx = (ext.MinPoint.X + ext.MaxPoint.X) * 0.5;
                                    ly = (ext.MinPoint.Y + ext.MaxPoint.Y) * 0.5;
                                } catch (Exception locEx) {
                                    if (!svLocErrDumped) {
                                        svLocErrDumped = true;
                                        result.warnings.Add($"DIAG GeometricExtents error: {locEx.GetType().Name} {locEx.Message}");
                                    }
                                }
                                if (lx.HasValue && ly.HasValue)
                                    locBySampleLine[slKey] = new double[] { lx.Value, ly.Value };
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

                // ── v6: INVENTARIO DE TOPOGRAFÍAS (una vez por documento) ──
                // Qué superficies TIN existen, su cobertura y densidad — para
                // decidir con datos qué materiales pueden volverse sólido continuo.
                try
                {
                    ObjectIdCollection surfIds = civilDoc.GetSurfaceIds();
                    result.surfaces = new List<SurfaceInfoV6>();
                    foreach (ObjectId sid in surfIds)
                    {
                        try
                        {
                            var so = trans.GetObject(sid, OpenMode.ForRead);
                            var info = new SurfaceInfoV6
                            {
                                name = TryGet(so, "Name") as string,
                                type = so.GetType().Name,
                                description = TryGet(so, "Description") as string,
                            };
                            try
                            {
                                var ent = so as Autodesk.AutoCAD.DatabaseServices.Entity;
                                if (ent != null)
                                {
                                    var ext = ent.GeometricExtents;
                                    info.extents = new double?[] {
                                        Clean(ext.MinPoint.X), Clean(ext.MinPoint.Y),
                                        Clean(ext.MaxPoint.X), Clean(ext.MaxPoint.Y) };
                                    info.elevRange = new double?[] { Clean(ext.MinPoint.Z), Clean(ext.MaxPoint.Z) };
                                }
                            }
                            catch { }
                            // conteos por propiedades (varias rutas según el tipo)
                            try
                            {
                                dynamic ds = so;
                                object props = null;
                                try { props = ds.GetTinProperties(); } catch { }
                                if (props == null) { try { props = ds.GetGeneralProperties(); } catch { } }
                                if (props != null)
                                {
                                    var t = TryNum(props, "NumberOfTriangles", "TrianglesCount");
                                    var pcount = TryNum(props, "NumberOfPoints", "PointsCount", "NumberOfVertices");
                                    if (t.HasValue) info.triangles = Convert.ToInt64(t.Value);
                                    if (pcount.HasValue) info.points = Convert.ToInt64(pcount.Value);
                                    if (sectionTypesDumped.Add("SURFPROPS"))
                                    {
                                        var pn = new List<string>();
                                        foreach (var p in props.GetType().GetProperties()) pn.Add(p.Name);
                                        result.warnings.Add($"DIAG SurfaceProps({info.type}): {string.Join(",", pn)}");
                                    }
                                }
                            }
                            catch { }
                            result.surfaces.Add(info);
                        }
                        catch (Exception sx) { result.warnings.Add("Surface item: " + sx.Message); }
                    }
                    ping($"v6: {result.surfaces.Count} superficies");
                }
                catch (Exception ex) { result.warnings.Add("v6 inventario superficies: " + ex.Message); }

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

                        // v8.2: verificación del PRE-PASS de densificado (si corrió)
                        if (sectionTypesDumped.Add("V8VERIF"))
                        {
                            try
                            {
                                foreach (ObjectId exId in slg.GetSampleLineIds())
                                {
                                    var exSl = trans.GetObject(exId, OpenMode.ForRead) as SampleLine;
                                    if (exSl == null || !exSl.Name.StartsWith("ECD_DENS")) continue;
                                    int nsec = 0, nptsv = 0;
                                    foreach (ObjectId secId2 in exSl.GetSectionIds())
                                    {
                                        var sec2 = trans.GetObject(secId2, OpenMode.ForRead) as Autodesk.Civil.DatabaseServices.Section;
                                        if (sec2 == null || sec2.GetType().Name != "MaterialSection") continue;
                                        nsec++;
                                        try { nptsv += (int)((dynamic)sec2).SectionPoints.Count; } catch { }
                                    }
                                    result.warnings.Add($"v8.2 verif '{exSl.Name}': {nsec} matSections, {nptsv} pts");
                                    break;
                                }
                            }
                            catch { }
                        }

                        // ── v6: RECETAS QTO del cadista (una vez por SLG) ──
                        // MaterialLists del grupo = lo que él mapeó en Compute
                        // Materials: material → superficies (Above/Below) y/o
                        // corredor. Defensivo con DIAG (la forma exacta del SDK
                        // varía por versión; un solo viaje debe traerlo todo).
                        try
                        {
                            dynamic dslg = slg;
                            object mlists = null;
                            try { mlists = dslg.MaterialLists; } catch { }
                            if (mlists == null) { try { mlists = dslg.GetMaterialLists(); } catch { } }
                            if (mlists == null)
                            {
                                result.warnings.Add($"v6 SLG '{slg.Name}': MaterialLists no expuesto");
                            }
                            else
                            {
                                if (result.qtoRecipes == null) result.qtoRecipes = new List<QtoRecipeV6>();
                                // v6.1: firmas EXACTAS de los métodos QTO del SLG (una vez)
                                if (sectionTypesDumped.Add("V6SLGSIG"))
                                {
                                    foreach (var mname in new[] { "GetQTOMappingNames", "GetMappingGuid", "GetMaterialNamesInMapping", "GetMaterialGuid", "GetMaterialComponents", "GetMaterialLocations", "GetTotalVolumeResultDataForMaterialList" })
                                    {
                                        try
                                        {
                                            foreach (var mi in slg.GetType().GetMethods())
                                            {
                                                if (mi.Name != mname) continue;
                                                var ps = new List<string>();
                                                foreach (var pp in mi.GetParameters()) ps.Add(pp.ParameterType.Name + " " + pp.Name);
                                                result.warnings.Add($"DIAG v6 SLG.{mname}({string.Join(", ", ps)}) -> {mi.ReturnType.Name}");
                                            }
                                        }
                                        catch { }
                                    }
                                    try
                                    {
                                        var names = ((dynamic)slg).GetQTOMappingNames();
                                        var ln = new List<string>();
                                        foreach (var n in (System.Collections.IEnumerable)names) ln.Add(n.ToString());
                                        result.warnings.Add("v6 QTOMappingNames: " + string.Join(" | ", ln));
                                    }
                                    catch (Exception qe) { result.warnings.Add("v6 GetQTOMappingNames: " + qe.Message); }
                                }
                                foreach (var ml in (System.Collections.IEnumerable)mlists)
                                {
                                    string mlName = TryGet(ml, "Name") as string;
                                    string mlGuid = null;
                                    try { mlGuid = ((object)((dynamic)ml).Guid).ToString(); } catch { }
                                    object mats = ml; // MaterialList ES la colección de materiales
                                    System.Collections.IEnumerable matSeq = null;
                                    try { matSeq = (System.Collections.IEnumerable)mats; } catch { }
                                    if (matSeq == null) { try { matSeq = (System.Collections.IEnumerable)((dynamic)ml).Materials; } catch { } }
                                    if (matSeq == null)
                                    {
                                        result.warnings.Add($"v6 ML '{mlName}': materiales no enumerables");
                                        continue;
                                    }
                                    foreach (var mat in matSeq)
                                    {
                                        var rec = new QtoRecipeV6
                                        {
                                            alignmentId = alignment.Name,
                                            sampleLineGroup = slg.Name,
                                            materialListName = mlName,
                                            materialListGuid = mlGuid,
                                            materialName = TryGet(mat, "Name") as string,
                                        };
                                        try { rec.quantityType = ((object)((dynamic)mat).QuantityType).ToString(); } catch { }
                                        if (rec.quantityType == null) { try { rec.quantityType = ((object)((dynamic)mat).MaterialQuantityType).ToString(); } catch { } }
                                        try { rec.shapeStyle = ResolveName(trans, (ObjectId)((dynamic)mat).ShapeStyleId); } catch { }
                                        if (sectionTypesDumped.Add("V6MATPROPS"))
                                        {
                                            var pn = new List<string>();
                                            foreach (var p in mat.GetType().GetProperties()) pn.Add(p.Name);
                                            result.warnings.Add($"DIAG v6 Material props: {string.Join(",", pn)}");
                                        }
                                        // v6.1: QTOMaterial ES una colección (Item/Count) de items
                                        // de criterio — enumerarla directo (SurfaceItems no existe).
                                        Action<object> addItem = (qit) =>
                                        {
                                            if (qit == null) return;
                                            if (sectionTypesDumped.Add("V6QITEM"))
                                            {
                                                var pn = new List<string>();
                                                foreach (var p in qit.GetType().GetProperties()) pn.Add(p.Name + ":" + p.PropertyType.Name);
                                                result.warnings.Add($"DIAG v6 QTOMaterialItem ({qit.GetType().Name}): {string.Join(",", pn)}");
                                            }
                                            var it = new QtoRecipeItemV6();
                                            try { var v = TryGet(qit, "ItemType") ?? TryGet(qit, "Type") ?? TryGet(qit, "DataType"); it.kind = v == null ? null : v.ToString(); } catch { }
                                            try { it.name = ResolveName(trans, (ObjectId)((dynamic)qit).SurfaceId); } catch { }
                                            if (it.name == null) { try { it.name = ResolveName(trans, (ObjectId)((dynamic)qit).CorridorId); } catch { } }
                                            if (it.name == null) { try { it.name = ResolveName(trans, (ObjectId)((dynamic)qit).ObjectId); } catch { } }
                                            if (it.name == null) { try { it.name = TryGet(qit, "Name") as string; } catch { } }
                                            try { var c = TryGet(qit, "Condition") ?? TryGet(qit, "MaterialCondition") ?? TryGet(qit, "SurfaceCondition"); it.condition = c == null ? null : c.ToString(); } catch { }
                                            rec.items.Add(it);
                                        };
                                        int itemCount = -1;
                                        try { itemCount = (int)((dynamic)mat).Count; } catch { }
                                        for (int qi = 0; qi < itemCount; qi++)
                                        {
                                            try { addItem((object)((dynamic)mat)[qi]); }
                                            catch (Exception ei) { if (sectionTypesDumped.Add("V6IDX")) result.warnings.Add("v6 indexer QTOMaterial: " + ei.Message); }
                                        }
                                        if (rec.items.Count == 0)
                                        {
                                            try { foreach (var qit in (System.Collections.IEnumerable)mat) addItem(qit); }
                                            catch (Exception ee) { if (sectionTypesDumped.Add("V6ENUM")) result.warnings.Add("v6 enum QTOMaterial: " + ee.Message); }
                                        }
                                        // Subcriteria (si el material anida criterios)
                                        try
                                        {
                                            object sub = ((dynamic)mat).Subcriteria;
                                            if (sub != null && sectionTypesDumped.Add("V6SUB"))
                                            {
                                                var pn = new List<string>();
                                                foreach (var p in sub.GetType().GetProperties()) pn.Add(p.Name + ":" + p.PropertyType.Name);
                                                result.warnings.Add($"DIAG v6 Subcriteria ({sub.GetType().Name}): {string.Join(",", pn)}");
                                            }
                                        }
                                        catch { }
                                        // v6.1: componentes de la receta vía métodos del SLG (guids a mano)
                                        try
                                        {
                                            object comp = null;
                                            string via = null;
                                            try { comp = ((dynamic)slg).GetMaterialComponents((System.Guid)((dynamic)mat).Guid); via = "(matGuid)"; } catch { }
                                            if (comp == null) { try { comp = ((dynamic)slg).GetMaterialComponents((System.Guid)((dynamic)mat).MaterialListGuid, (System.Guid)((dynamic)mat).Guid); via = "(mlGuid, matGuid)"; } catch { } }
                                            if (comp != null)
                                            {
                                                result.warnings.Add($"v6 GetMaterialComponents{via} OK para '{rec.materialName}' tipo={comp.GetType().Name}");
                                                try
                                                {
                                                    foreach (var c in (System.Collections.IEnumerable)comp)
                                                    {
                                                        if (sectionTypesDumped.Add("V6COMP"))
                                                        {
                                                            var pn = new List<string>();
                                                            foreach (var p in c.GetType().GetProperties()) pn.Add(p.Name + ":" + p.PropertyType.Name);
                                                            result.warnings.Add($"DIAG v6 MaterialComponent ({c.GetType().Name}): {string.Join(",", pn)}");
                                                        }
                                                        var it = new QtoRecipeItemV6 { kind = "component" };
                                                        try { it.name = TryGet(c, "Name") as string; } catch { }
                                                        if (it.name == null) { try { it.name = ResolveName(trans, (ObjectId)((dynamic)c).SurfaceId); } catch { } }
                                                        try { var cc = TryGet(c, "Condition") ?? TryGet(c, "ConditionType") ?? TryGet(c, "MaterialCondition"); it.condition = cc == null ? null : cc.ToString(); } catch { }
                                                        rec.items.Add(it);
                                                    }
                                                }
                                                catch (Exception ce) { result.warnings.Add("v6 enum components: " + ce.Message); }
                                            }
                                        }
                                        catch (Exception cx) { if (sectionTypesDumped.Add("V6COMPERR")) result.warnings.Add("v6 GetMaterialComponents: " + cx.Message); }
                                        result.qtoRecipes.Add(rec);
                                    }
                                }
                                ping($"v6: recetas QTO SLG '{slg.Name}' = {(result.qtoRecipes == null ? 0 : result.qtoRecipes.Count)}");
                            }
                        }
                        catch (Exception ex) { result.warnings.Add($"v6 recetas QTO SLG '{slg.Name}': {ex.Message}"); }

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

                                // v6: SourceName es propiedad DIRECTA de la sección (DIAG lo
                                // confirmó); ResolveName(SourceId) devolvía null. Para
                                // MaterialSection es la identidad LIMPIA del material QTO del
                                // cadista — sin prefijo de sample line ni id — y alimenta el
                                // contrato canónico del backend (role/kind/materialKey).
                                if (string.IsNullOrEmpty(shape.sourceName)) {
                                    try { shape.sourceName = TryGet(section, "SourceName") as string; } catch { }
                                }
                                if (string.IsNullOrEmpty(shape.materialName)
                                    && section is MaterialSection
                                    && !string.IsNullOrEmpty(shape.sourceName)) {
                                    shape.materialName = shape.sourceName;
                                }
                                // v6 DIAG (una vez): métodos del SampleLineGroup — para
                                // descubrir la API de listas de material (quantityType futuro)
                                if (sectionTypesDumped.Add("SLGM")) {
                                    try {
                                        var mn = new HashSet<string>();
                                        foreach (var m in slg.GetType().GetMethods())
                                            if (!m.Name.StartsWith("get_") && !m.Name.StartsWith("set_")) mn.Add(m.Name);
                                        result.warnings.Add($"DIAG SLG metodos: {string.Join(",", mn)}");
                                    } catch { }
                                }

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

                            // v5 AUDITOR: Material Lists del Corridor → cantidades OFICIALES
                            // (Civil las calcula y las imprime en el cuadro QTO — este es
                            // el mismo dato que ve el auditor en el plano).
                            // Recorremos TODOS los corridors del documento (sin filtrar por
                            // sampledSources: la SL puede sampleaer una superficie, no el
                            // corridor directo, pero el ML sigue asociado al alineamiento).
                            try
                            {
                                if (civilDoc.CorridorCollection != null)
                                {
                                    foreach (ObjectId corridorId in civilDoc.CorridorCollection)
                                    {
                                        Corridor corr = trans.GetObject(corridorId, OpenMode.ForRead) as Corridor;
                                        if (corr == null) continue;
                                        // Solo material lists del CORRIDOR que corresponde
                                        // a este alineamiento (matching por baseline).
                                        bool alignMatch = false;
                                        try {
                                            foreach (var bl in ((dynamic)corr).Baselines) {
                                                try {
                                                    if ((ObjectId)bl.AlignmentId == alignId) { alignMatch = true; break; }
                                                } catch { }
                                            }
                                        } catch { }
                                        if (!alignMatch) continue;
                                        try {
                                            dynamic dc = corr;
                                            dynamic mLists = null;
                                            try { mLists = dc.GetMaterialLists(); }
                                            catch { try { mLists = dc.MaterialLists; } catch { } }
                                            if (mLists == null) continue;
                                            if (sectionTypesDumped.Add("MLDUMP")) {
                                                var mnames = new List<string>();
                                                foreach (var m in ((object)mLists).GetType().GetMethods()) mnames.Add(m.Name);
                                                result.warnings.Add($"DIAG MaterialLists methods: {string.Join(",", mnames)}");
                                            }
                                            foreach (var ml in mLists) {
                                                if (sectionTypesDumped.Add("MLPROPS")) {
                                                    var pn = new List<string>();
                                                    foreach (var p in ((object)ml).GetType().GetProperties()) pn.Add(p.Name);
                                                    var mn = new List<string>();
                                                    foreach (var m in ((object)ml).GetType().GetMethods()) mn.Add(m.Name);
                                                    result.warnings.Add($"DIAG MaterialList props: {string.Join(",", pn)}");
                                                    result.warnings.Add($"DIAG MaterialList methods: {string.Join(",", mn)}");
                                                }
                                                string mlName = null;
                                                try { mlName = (string)((dynamic)ml).Name; } catch { }
                                                dynamic materials = null;
                                                try { materials = ((dynamic)ml).GetMaterialSectionData(sl.Station); } catch { }
                                                if (materials == null) { try { materials = ((dynamic)ml).Materials; } catch { } }
                                                if (materials == null) continue;
                                                if (sectionTypesDumped.Add("MATPROPSDATA")) {
                                                    try {
                                                        foreach (var mm in materials) {
                                                            var pn = new List<string>();
                                                            foreach (var p in ((object)mm).GetType().GetProperties()) pn.Add(p.Name);
                                                            result.warnings.Add($"DIAG Material item props: {string.Join(",", pn)}");
                                                            break;
                                                        }
                                                    } catch { }
                                                }
                                                foreach (var mm in materials) {
                                                    try {
                                                        var row = new CorridorMaterialV5 {
                                                            corridorName = corr.Name,
                                                            materialListName = mlName,
                                                            materialName = TryGet(mm, "Name") as string ?? TryGet(mm, "MaterialName") as string,
                                                            area = Clean(TryNum(mm, "Area", "SectionArea", "CutArea", "FillArea")),
                                                            volume = Clean(TryNum(mm, "Volume", "IncrementalVolume", "IncVolume")),
                                                            cumulativeVolume = Clean(TryNum(mm, "CumulativeVolume", "CumVolume", "TotalVolume"))
                                                        };
                                                        if (secData.corridorMaterials == null) secData.corridorMaterials = new List<CorridorMaterialV5>();
                                                        secData.corridorMaterials.Add(row);
                                                    } catch { }
                                                }
                                            }
                                        } catch (Exception meX) {
                                            result.warnings.Add($"CorridorMaterials '{corr.Name}' @PK {sl.Station:F2}: {meX.Message}");
                                        }
                                    }
                                }
                            } catch { }

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
