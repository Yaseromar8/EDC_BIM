using System;
using System.IO;
using System.Collections.Generic;
using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.Civil.ApplicationServices;
using Autodesk.Civil.DatabaseServices;

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
        public List<SectionShapeV2> sections { get; set; } = new List<SectionShapeV2>();
    }

    public class SectionShapeV2
    {
        public string name { get; set; }
        public string styleName { get; set; }
        public string sourceType { get; set; }
        public string sourceName { get; set; }
        public double? area { get; set; }
        public bool closed { get; set; }
        // [[offset, elevation], ...] en ORDEN de dibujo de Civil
        public List<double?[]> points { get; set; } = new List<double?[]>();
        // solo shapes de corredor: true si offset/elev son absolutos (via XYZ)
        public bool? absolute { get; set; }
    }

    public class SectionResultV2
    {
        public int schemaVersion { get; set; } = 2;
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

            using (Transaction trans = db.TransactionManager.StartTransaction())
            {
                var civilDoc = Autodesk.Civil.ApplicationServices.CivilApplication.ActiveDocument;
                ObjectIdCollection alignIds = civilDoc.GetAlignmentIds();
                if (alignIds.Count == 0) result.warnings.Add("El DWG no tiene alineamientos.");

                foreach (ObjectId alignId in alignIds)
                {
                    Alignment alignment = trans.GetObject(alignId, OpenMode.ForRead) as Alignment;
                    if (alignment == null) continue;

                    ObjectIdCollection slgIds = alignment.GetSampleLineGroupIds();
                    if (slgIds.Count == 0)
                        result.warnings.Add($"Alineamiento '{alignment.Name}': sin Sample Line Groups (no hay secciones que extraer).");

                    foreach (ObjectId slgId in slgIds)
                    {
                        SampleLineGroup slg = trans.GetObject(slgId, OpenMode.ForRead) as SampleLineGroup;
                        if (slg == null) continue;

                        ObjectIdCollection slIds = slg.GetSampleLineIds();
                        foreach (ObjectId slId in slIds)
                        {
                            SampleLine sl = trans.GetObject(slId, OpenMode.ForRead) as SampleLine;
                            if (sl == null) continue;

                            var secData = new SectionDataV2
                            {
                                alignmentId = alignment.Name,
                                sampleLineGroupId = slg.Name,
                                sampleLineName = sl.Name,
                                station = sl.Station
                            };

                            var sampledSources = new HashSet<ObjectId>();

                            // ── 1) Secciones del sample line: puntos EN ORDEN + estilo + área ──
                            ObjectIdCollection sectionIds = sl.GetSectionIds();
                            foreach (ObjectId secId in sectionIds)
                            {
                                var section = trans.GetObject(secId, OpenMode.ForRead) as Autodesk.Civil.DatabaseServices.Section;
                                if (section == null) continue;
                                try { sampledSources.Add(section.SourceId); } catch { }

                                var shape = new SectionShapeV2
                                {
                                    name = section.Name,
                                    sourceType = section.GetType().Name,
                                };

                                // Identidad LIMPIA: estilo + objeto de origen
                                try { shape.styleName = ResolveName(trans, (ObjectId)(TryGet(section, "StyleId") ?? ObjectId.Null)); }
                                catch { }
                                try { shape.sourceName = ResolveName(trans, section.SourceId); } catch { }

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
