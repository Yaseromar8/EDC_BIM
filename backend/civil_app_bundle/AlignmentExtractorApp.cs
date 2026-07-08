using System;
using System.IO;
using System.Collections.Generic;
using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.DatabaseServices;

using Autodesk.Civil.DatabaseServices;

[assembly: Autodesk.AutoCAD.Runtime.CommandClass(typeof(AlignmentExtractorApp.Commands))]
[assembly: Autodesk.AutoCAD.Runtime.ExtensionApplication(typeof(AlignmentExtractorApp.Plugin))]

namespace AlignmentExtractorApp
{
    public class Plugin : Autodesk.AutoCAD.Runtime.IExtensionApplication
    {
        public void Initialize()
        {
            try
            {
                Document doc = Application.DocumentManager.MdiActiveDocument;
                if (doc != null)
                {
                    doc.Editor.WriteMessage("\n--- PLUGIN INITIALIZING ---\n");
                    // Intentionally load CivilRunner to force ReflectionTypeLoadException if missing deps
                    System.Runtime.CompilerServices.RuntimeHelpers.RunClassConstructor(typeof(CivilRunner).TypeHandle);
                    doc.Editor.WriteMessage("\n--- PLUGIN INITIALIZED SUCCESSFULLY ---\n");
                }
            }
            catch (Exception ex)
            {
                Document doc = Application.DocumentManager.MdiActiveDocument;
                if (doc != null)
                {
                    doc.Editor.WriteMessage($"\nINIT ERROR: {ex.GetType().Name} - {ex.Message}\n");
                    if (ex is System.Reflection.ReflectionTypeLoadException rtle)
                    {
                        foreach (var le in rtle.LoaderExceptions)
                        {
                            if (le != null) doc.Editor.WriteMessage($"LoaderEx: {le.Message}\n");
                        }
                    }
                }
            }
        }

        public void Terminate()
        {
        }
    }

    public class AlignmentData
    {
        public string alignmentId { get; set; }
        public string objectId { get; set; }
        // v4: tipo del eje (Centerline/Offset/Miscellaneous/...) — señal para el
        // default de curación: los de diseño suelen ser Centerline; los restos
        // que el cadista no borró suelen ser Offset/Miscellaneous.
        public string alignmentType { get; set; }
        public double startStation { get; set; }
        public double endStation { get; set; }
        public double length { get; set; }
        public List<SubEntityData> subEntities { get; set; } = new List<SubEntityData>();
        public List<ProfileData> profiles { get; set; } = new List<ProfileData>();
        public List<StationEquationData> stationEquations { get; set; } = new List<StationEquationData>();
        public List<DesignSpeedData> designSpeeds { get; set; } = new List<DesignSpeedData>();
        public List<SuperelevationData> superelevations { get; set; } = new List<SuperelevationData>();
        public List<SampleLineData> sampleLines { get; set; } = new List<SampleLineData>();
        
        // Label Group properties
        public double? stationIncrement { get; set; }
        public string stationLabelStyle { get; set; }
    }

    public class ProfileData
    {
        public string name { get; set; }
        public string type { get; set; }
        public string objectId { get; set; }
        public string parentAlignment { get; set; }
        public string layer { get; set; }
        public string style { get; set; }
        public double startStation { get; set; }
        public double endStation { get; set; }
        public List<ProfilePointData> points { get; set; } = new List<ProfilePointData>();
        public List<ProfileEntityData> entities { get; set; } = new List<ProfileEntityData>();
    }

    public class ProfilePointData
    {
        public double station { get; set; }
        public double x { get; set; }
        public double y { get; set; }
        public double z { get; set; }
    }

    public class ProfileEntityData
    {
        public string type { get; set; }
        public double startStation { get; set; }
        public double endStation { get; set; }
        public double length { get; set; }
        
        // Tangent properties
        public double? startElevation { get; set; }
        public double? endElevation { get; set; }
        public double? grade { get; set; }
        
        // Curve properties (Parabola/Circular)
        public double? pviStation { get; set; }
        public double? pviElevation { get; set; }
        public double? kValue { get; set; }
        public double? radius { get; set; }
    }

    public class StationEquationData
    {
        public double rawStationBack { get; set; }
        public double stationAhead { get; set; }
        public string equationType { get; set; }
    }

    public class DesignSpeedData
    {
        public double station { get; set; }
        public double speed { get; set; }
    }

    public class SuperelevationData
    {
        public double station { get; set; }
        public double? crossSlopeLeft { get; set; }
        public double? crossSlopeRight { get; set; }
    }

    public class SampleLineData
    {
        public string name { get; set; }
        public double station { get; set; }
    }

    public class SubEntityData
    {
        public string type { get; set; }
        public double startStation { get; set; }
        public double endStation { get; set; }
        public double length { get; set; }
        public Point2D startPoint { get; set; }
        public Point2D endPoint { get; set; }
        // For Arcs
        public Point2D center { get; set; }
        public double radius { get; set; }
        public double startAngle { get; set; }
        public double endAngle { get; set; }
        public double sweepAngle { get; set; }
        public bool? clockwise { get; set; }
        // For Clothoids/Spirals
        public double parameterA { get; set; }
        public double startRadius { get; set; }
        public double endRadius { get; set; }
    }

    public class Point2D
    {
        public double x { get; set; }
        public double y { get; set; }
        public double? z { get; set; }
    }

    public class Commands
    {
        [Autodesk.AutoCAD.Runtime.CommandMethod("HelloWorld")]
        public static void HelloWorld()
        {
            Document doc = Application.DocumentManager.MdiActiveDocument;
            doc.Editor.WriteMessage("\nHELLO WORLD FROM C# APPBUNDLE!\n");
        }

        [Autodesk.AutoCAD.Runtime.CommandMethod("ExtractAlignmentJSON")]
        public static void ExtractAlignmentJSON()
        {
            Document doc = Application.DocumentManager.MdiActiveDocument;
            try
            {
                doc.Editor.WriteMessage("\nAttempting to run CivilRunner...\n");
                CivilRunner.Run();
                doc.Editor.WriteMessage("\nCivilRunner completed successfully.\n");
            }
            catch (Exception ex)
            {
                doc.Editor.WriteMessage($"\nFATAL ERROR: {ex.GetType().Name} - {ex.Message}\nStack Trace: {ex.StackTrace}\n");
                
                // Si es un ReflectionTypeLoadException o TypeLoadException, intenta volcar más detalles
                if (ex is System.Reflection.ReflectionTypeLoadException rtle)
                {
                    foreach (var loaderException in rtle.LoaderExceptions)
                    {
                        if (loaderException != null)
                            doc.Editor.WriteMessage($"\nLoader Exception: {loaderException.Message}\n");
                    }
                }
            }
        }

        [Autodesk.AutoCAD.Runtime.CommandMethod("ExtractCurvesJSON")]
        public static void ExtractCurvesJSON()
        {
            Document doc = Application.DocumentManager.MdiActiveDocument;
            try
            {
                doc.Editor.WriteMessage("\nExtracting Civil 3D alignment curves...\n");
                CivilRunner.Run();
                doc.Editor.WriteMessage("\nCurve extraction completed successfully.\n");
            }
            catch (Exception ex)
            {
                doc.Editor.WriteMessage($"\nFATAL ERROR: {ex.GetType().Name} - {ex.Message}\nStack Trace: {ex.StackTrace}\n");

                if (ex is System.Reflection.ReflectionTypeLoadException rtle)
                {
                    foreach (var loaderException in rtle.LoaderExceptions)
                    {
                        if (loaderException != null)
                            doc.Editor.WriteMessage($"\nLoader Exception: {loaderException.Message}\n");
                    }
                }
            }
        }

        // NOTA: el comando ExtractSectionsJSON vive en SectionExtractorApp.cs
        // (SectionCommands). Estaba duplicado aquí y AutoCAD rechaza comandos
        // repetidos al hacer netload.
    }

    public static class CivilRunner
    {
        [System.Runtime.CompilerServices.MethodImpl(System.Runtime.CompilerServices.MethodImplOptions.NoInlining)]
        public static void Run()
        {
            Document doc = Application.DocumentManager.MdiActiveDocument;
            Database db = doc.Database;
            List<AlignmentData> alignmentsList = new List<AlignmentData>();

            using (Transaction trans = db.TransactionManager.StartTransaction())
            {
                var civilDoc = Autodesk.Civil.ApplicationServices.CivilApplication.ActiveDocument;
                
                Dictionary<string, int> entityCounts = new Dictionary<string, int>();

                // First attempt: CivilDocument GetAlignmentIds (most reliable if fully loaded)
                ObjectIdCollection alignIds = civilDoc.GetAlignmentIds();
                doc.Editor.WriteMessage($"\n--- Found {alignIds.Count} alignments via CivilApplication ---\n");

                if (alignIds.Count > 0)
                {
                    foreach (ObjectId alignId in alignIds)
                    {
                        Alignment alignment = trans.GetObject(alignId, OpenMode.ForRead) as Alignment;
                        if (alignment == null) continue;

                        alignmentsList.Add(ExtractAlignmentData(alignment, trans));
                    }
                }
                else
                {
                    // Fallback to iterating ModelSpace
                    BlockTable bt = trans.GetObject(db.BlockTableId, OpenMode.ForRead) as BlockTable;
                    BlockTableRecord mSpace = trans.GetObject(bt[BlockTableRecord.ModelSpace], OpenMode.ForRead) as BlockTableRecord;

                    foreach (ObjectId entId in mSpace)
                    {
                        string typeName = entId.ObjectClass.Name;
                        if (entityCounts.ContainsKey(typeName))
                            entityCounts[typeName]++;
                        else
                            entityCounts[typeName] = 1;

                        Alignment alignment = trans.GetObject(entId, OpenMode.ForRead) as Alignment;
                        if (alignment == null) continue;

                        alignmentsList.Add(ExtractAlignmentData(alignment, trans));
                    }

                    doc.Editor.WriteMessage("\n--- ENTITY SUMMARY ---\n");
                    foreach (var kvp in entityCounts)
                    {
                        doc.Editor.WriteMessage($"{kvp.Key}: {kvp.Value}\n");
                    }
                    doc.Editor.WriteMessage("----------------------\n");
                }

                var options = new System.Text.Json.JsonSerializerOptions { WriteIndented = true };
                string jsonOutput = System.Text.Json.JsonSerializer.Serialize(alignmentsList, options);
                System.IO.File.WriteAllText("alignment.json", jsonOutput);

                trans.Commit();
            }
        }

        private static AlignmentData ExtractAlignmentData(Alignment alignment, Transaction trans)
        {
            AlignmentData alignData = new AlignmentData
            {
                alignmentId = alignment.Name,
                objectId = alignment.ObjectId.Handle.ToString(),
                startStation = alignment.StartingStation,
                endStation = alignment.EndingStation,
                length = Math.Abs(alignment.EndingStation - alignment.StartingStation),
                subEntities = new List<SubEntityData>()
            };
            try { alignData.alignmentType = alignment.AlignmentType.ToString(); } catch { }

            foreach (AlignmentEntity entity in alignment.Entities)
            {
                for (int i = 0; i < entity.SubEntityCount; i++)
                {
                    alignData.subEntities.Add(ExtractSubEntityData(entity[i]));
                }
            }

            try
            {
                System.Reflection.MethodInfo getLabelGroupMethod = alignment.GetType().GetMethod("GetStationLabelGroupIds", Type.EmptyTypes);
                if (getLabelGroupMethod != null)
                {
                    ObjectIdCollection lgIds = getLabelGroupMethod.Invoke(alignment, null) as ObjectIdCollection;
                    if (lgIds != null)
                    {
                        foreach (ObjectId lgId in lgIds)
                        {
                            var lg = trans.GetObject(lgId, OpenMode.ForRead);
                            double? inc = TryReadDouble(lg, "Increment");
                            if (inc.HasValue)
                            {
                                alignData.stationIncrement = inc.Value;
                                alignData.stationLabelStyle = TryReadString(lg, "StyleName") ?? TryReadString(lg, "Name");
                                break;
                            }
                        }
                    }
                }
                else
                {
                    // Maybe it requires an enum, let's use dynamic reflection on the first enum we find
                    System.Reflection.MethodInfo getLabelGroupEnumMethod = alignment.GetType().GetMethod("GetStationLabelGroupIds");
                    if (getLabelGroupEnumMethod != null)
                    {
                        // Get the parameter type
                        var parameters = getLabelGroupEnumMethod.GetParameters();
                        if (parameters.Length == 1)
                        {
                            Type enumType = parameters[0].ParameterType;
                            // 0 is usually MajorStation in most Autodesk enums
                            object enumValue = Enum.ToObject(enumType, 0);
                            ObjectIdCollection lgIds = getLabelGroupEnumMethod.Invoke(alignment, new object[] { enumValue }) as ObjectIdCollection;
                            if (lgIds != null)
                            {
                                foreach (ObjectId lgId in lgIds)
                                {
                                    var lg = trans.GetObject(lgId, OpenMode.ForRead);
                                    double? inc = TryReadDouble(lg, "Increment");
                                    if (inc.HasValue)
                                    {
                                        alignData.stationIncrement = inc.Value;
                                        alignData.stationLabelStyle = TryReadString(lg, "StyleName") ?? TryReadString(lg, "Name");
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
            }
            catch (Exception)
            {
                // Fallback increment
                alignData.stationIncrement = 10.0;
            }

            try
            {
                // Profiles
                ObjectIdCollection profileIds = alignment.GetProfileIds();
                foreach (ObjectId profId in profileIds)
                {
                    Profile profile = trans.GetObject(profId, OpenMode.ForRead) as Profile;
                    if (profile != null)
                    {
                        ProfileData pData = new ProfileData
                        {
                            name = profile.Name,
                            type = profile.ProfileType.ToString(),
                            objectId = profile.ObjectId.Handle.ToString(),
                            parentAlignment = alignment.Name,
                            layer = TryReadString(profile, "Layer"),
                            style = TryReadString(profile, "StyleName", "ProfileStyleName"),
                            startStation = TryReadDouble(profile, "StartingStation", "StartStation") ?? alignment.StartingStation,
                            endStation = TryReadDouble(profile, "EndingStation", "EndStation") ?? alignment.EndingStation,
                            points = new List<ProfilePointData>(),
                            entities = new List<ProfileEntityData>()
                        };

                        foreach (ProfileEntity pEnt in profile.Entities)
                        {
                            ProfileEntityData pEntData = new ProfileEntityData
                            {
                                type = pEnt.EntityType.ToString(),
                                startStation = TryReadDouble(pEnt, "StartStation") ?? 0,
                                endStation = TryReadDouble(pEnt, "EndStation") ?? 0,
                                length = TryReadDouble(pEnt, "Length") ?? 0
                            };

                            if (pEnt is ProfileTangent pTangent)
                            {
                                pEntData.startElevation = pTangent.StartElevation;
                                pEntData.endElevation = pTangent.EndElevation;
                                pEntData.grade = pTangent.Grade;
                            }
                            else if (pEnt is ProfileParabolaSymmetric pParabolaSym)
                            {
                                pEntData.pviStation = pParabolaSym.PVIStation;
                                pEntData.pviElevation = pParabolaSym.PVIElevation;
                                pEntData.kValue = pParabolaSym.K;
                            }
                            else if (pEnt is ProfileParabolaAsymmetric pParabolaAsym)
                            {
                                pEntData.pviStation = pParabolaAsym.PVIStation;
                                pEntData.pviElevation = pParabolaAsym.PVIElevation;
                            }
                            else if (pEnt is ProfileCircular pCircular)
                            {
                                pEntData.pviStation = pCircular.PVIStation;
                                pEntData.pviElevation = pCircular.PVIElevation;
                                pEntData.radius = pCircular.Radius;
                            }

                            pData.entities.Add(pEntData);
                        }

                        pData.points = SampleProfilePoints(alignment, profile, pData);
                        alignData.profiles.Add(pData);
                    }
                }

                // Station Equations
                foreach (StationEquation eq in alignment.StationEquations)
                {
                    alignData.stationEquations.Add(new StationEquationData
                    {
                        rawStationBack = eq.RawStationBack,
                        stationAhead = eq.StationAhead,
                        equationType = eq.EquationType.ToString()
                    });
                }

                // Design Speeds
                foreach (DesignSpeed speed in alignment.DesignSpeeds)
                {
                    alignData.designSpeeds.Add(new DesignSpeedData
                    {
                        station = speed.Station,
                        speed = speed.Value
                    });
                }

                // Superelevation (Try-catch per item as it might not be initialized)
                try
                {
                    foreach (SuperelevationCurve curve in alignment.SuperelevationCurves)
                    {
                        foreach (SuperelevationCriticalStation cs in curve.CriticalStations)
                        {
                            alignData.superelevations.Add(new SuperelevationData
                            {
                                station = cs.Station,
                                crossSlopeLeft = TryReadDouble(cs, "CrossSlopeLeft"),
                                crossSlopeRight = TryReadDouble(cs, "CrossSlopeRight")
                            });
                        }
                    }
                }
                catch { }

                // Sample Lines
                ObjectIdCollection slgIds = alignment.GetSampleLineGroupIds();
                foreach (ObjectId slgId in slgIds)
                {
                    SampleLineGroup slg = trans.GetObject(slgId, OpenMode.ForRead) as SampleLineGroup;
                    if (slg != null)
                    {
                        ObjectIdCollection slIds = slg.GetSampleLineIds();
                        foreach (ObjectId slId in slIds)
                        {
                            SampleLine sl = trans.GetObject(slId, OpenMode.ForRead) as SampleLine;
                            if (sl != null)
                            {
                                alignData.sampleLines.Add(new SampleLineData
                                {
                                    name = sl.Name,
                                    station = sl.Station
                                });
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Application.DocumentManager.MdiActiveDocument.Editor.WriteMessage($"\nError extracting extended data for alignment {alignment.Name}: {ex.Message}\n");
            }

            return alignData;
        }

        private static SubEntityData ExtractSubEntityData(AlignmentSubEntity subEnt)
        {
            SubEntityData subData = new SubEntityData
            {
                startStation = subEnt.StartStation,
                endStation = subEnt.EndStation,
                length = subEnt.Length,
                startPoint = ConvertPoint(subEnt.StartPoint),
                endPoint = ConvertPoint(subEnt.EndPoint)
            };

            string typeString = subEnt.SubEntityType.ToString().ToLowerInvariant();
            if (typeString.Contains("arc") || typeString.Contains("curve"))
            {
                subData.type = "arc";
                PopulateArcData(subData, subEnt);
            }
            else if (typeString.Contains("spiral") || typeString.Contains("clothoid"))
            {
                subData.type = "clothoid";
                PopulateSpiralData(subData, subEnt);
            }
            else if (typeString.Contains("line") || typeString.Contains("tangent"))
            {
                subData.type = "line";
            }
            else
            {
                subData.type = typeString;
            }

            return subData;
        }

        private static List<ProfilePointData> SampleProfilePoints(Alignment alignment, Profile profile, ProfileData profileData)
        {
            List<ProfilePointData> points = new List<ProfilePointData>();
            List<double> stations = new List<double>();

            double alignmentStart = Math.Min(alignment.StartingStation, alignment.EndingStation);
            double alignmentEnd = Math.Max(alignment.StartingStation, alignment.EndingStation);
            double profileStart = Math.Min(profileData.startStation, profileData.endStation);
            double profileEnd = Math.Max(profileData.startStation, profileData.endStation);
            double start = Math.Max(alignmentStart, profileStart);
            double end = Math.Min(alignmentEnd, profileEnd);

            if (end < start)
            {
                start = alignmentStart;
                end = alignmentEnd;
            }

            void AddStation(double? station)
            {
                if (!station.HasValue) return;
                double value = station.Value;
                if (double.IsNaN(value) || double.IsInfinity(value)) return;
                if (value < start - 1e-6 || value > end + 1e-6) return;
                stations.Add(Math.Max(start, Math.Min(end, value)));
            }

            AddStation(start);
            AddStation(end);

            foreach (ProfileEntityData entity in profileData.entities)
            {
                AddStation(entity.startStation);
                AddStation(entity.endStation);
                AddStation(entity.pviStation);
            }

            foreach (AlignmentEntity entity in alignment.Entities)
            {
                for (int i = 0; i < entity.SubEntityCount; i++)
                {
                    AlignmentSubEntity subEnt = entity[i];
                    AddStation(subEnt.StartStation);
                    AddStation(subEnt.EndStation);
                }
            }

            double length = Math.Abs(end - start);
            double interval = length <= 1200 ? 2.0 : length <= 5000 ? 5.0 : 10.0;
            int maxSamples = 6000;
            int estimatedSamples = (int)Math.Ceiling(length / interval);
            if (estimatedSamples > maxSamples)
            {
                interval = Math.Max(interval, length / maxSamples);
            }

            double first = Math.Ceiling(start / interval) * interval;
            for (double station = first; station <= end + 1e-6; station += interval)
            {
                AddStation(station);
            }

            HashSet<string> seen = new HashSet<string>();
            stations.Sort();

            foreach (double station in stations)
            {
                string key = station.ToString("F4", System.Globalization.CultureInfo.InvariantCulture);
                if (!seen.Add(key)) continue;

                try
                {
                    double x = 0;
                    double y = 0;
                    alignment.PointLocation(station, 0.0, ref x, ref y);
                    double z = profile.ElevationAt(station);

                    points.Add(new ProfilePointData
                    {
                        station = station,
                        x = x,
                        y = y,
                        z = z
                    });
                }
                catch
                {
                    // Civil 3D can reject stations just outside the valid profile range; skip them.
                }
            }

            return points;
        }

        private static void PopulateArcData(SubEntityData subData, AlignmentSubEntity subEnt)
        {
            subData.center = TryReadPoint(subEnt, "CenterPoint", "Center");
            subData.radius = TryReadDouble(subEnt, "Radius", "CurveRadius") ?? 0;
            subData.clockwise = TryReadBool(subEnt, "Clockwise", "IsClockwise", "IsCurveClockwise");

            if (subData.center != null)
            {
                if (subData.radius <= 0)
                {
                    subData.radius = Distance(subData.center, subData.startPoint);
                }

                subData.startAngle = Math.Atan2(
                    subData.startPoint.y - subData.center.y,
                    subData.startPoint.x - subData.center.x);
                subData.endAngle = Math.Atan2(
                    subData.endPoint.y - subData.center.y,
                    subData.endPoint.x - subData.center.x);
                subData.sweepAngle = ComputeSweepAngle(subData.startAngle, subData.endAngle, subData.clockwise == true);
            }
        }

        private static void PopulateSpiralData(SubEntityData subData, AlignmentSubEntity subEnt)
        {
            subData.parameterA = TryReadDouble(subEnt, "ParameterA", "A") ?? 0;
            subData.startRadius = TryReadDouble(subEnt, "StartRadius", "RadiusIn") ?? 0;
            subData.endRadius = TryReadDouble(subEnt, "EndRadius", "RadiusOut") ?? 0;
        }

        private static object TryReadProperty(object target, params string[] names)
        {
            if (target == null) return null;

            Type targetType = target.GetType();
            foreach (string name in names)
            {
                var prop = targetType.GetProperty(name);
                if (prop != null)
                {
                    try
                    {
                        return prop.GetValue(target);
                    }
                    catch
                    {
                    }
                }
            }

            return null;
        }

        private static double? TryReadDouble(object target, params string[] names)
        {
            object value = TryReadProperty(target, names);
            if (value == null) return null;

            try
            {
                return Convert.ToDouble(value);
            }
            catch
            {
                return null;
            }
        }

        private static string TryReadString(object target, params string[] names)
        {
            object value = TryReadProperty(target, names);
            if (value == null) return null;

            try
            {
                return Convert.ToString(value);
            }
            catch
            {
                return null;
            }
        }

        private static bool? TryReadBool(object target, params string[] names)
        {
            object value = TryReadProperty(target, names);
            if (value == null) return null;

            try
            {
                return Convert.ToBoolean(value);
            }
            catch
            {
                return null;
            }
        }

        private static Point2D TryReadPoint(object target, params string[] names)
        {
            object value = TryReadProperty(target, names);
            if (value == null) return null;

            var xProp = value.GetType().GetProperty("X");
            var yProp = value.GetType().GetProperty("Y");
            if (xProp == null || yProp == null) return null;

            try
            {
                return new Point2D
                {
                    x = Convert.ToDouble(xProp.GetValue(value)),
                    y = Convert.ToDouble(yProp.GetValue(value)),
                    z = TryReadDouble(value, "Z")
                };
            }
            catch
            {
                return null;
            }
        }

        private static Point2D ConvertPoint(object value)
        {
            if (value == null) return null;

            var xProp = value.GetType().GetProperty("X");
            var yProp = value.GetType().GetProperty("Y");
            if (xProp == null || yProp == null) return null;

            return new Point2D
            {
                x = Convert.ToDouble(xProp.GetValue(value)),
                y = Convert.ToDouble(yProp.GetValue(value)),
                z = TryReadDouble(value, "Z")
            };
        }

        private static double ComputeSweepAngle(double startAngle, double endAngle, bool clockwise)
        {
            double sweep = endAngle - startAngle;
            if (clockwise)
            {
                if (sweep > 0) sweep -= Math.PI * 2;
            }
            else
            {
                if (sweep < 0) sweep += Math.PI * 2;
            }

            return sweep;
        }

        private static double Distance(Point2D a, Point2D b)
        {
            double dx = a.x - b.x;
            double dy = a.y - b.y;
            return Math.Sqrt(dx * dx + dy * dy);
        }
    }
}
