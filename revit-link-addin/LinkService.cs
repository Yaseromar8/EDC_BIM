// LinkService — el corazón del vínculo: sondea el canal del frente cada 1 s y
// aplica los comandos (aislar/seleccionar/limpiar) dentro de Revit vía
// ExternalEvent (la API de Revit es mono-hilo: NUNCA tocar el modelo desde el
// hilo del sondeo).
//
// Identidades: los externalIds que publica la web SON UniqueIds de Revit
// (la traducción SVF2 los preserva) → doc.GetElement(uniqueId) directo.
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Autodesk.Revit.UI.Events;

namespace ECDLink
{
    [DataContract]
    public class ColorGroupDto
    {
        [DataMember(Name = "color", IsRequired = false)] public string Color { get; set; }
        [DataMember(Name = "externalIds", IsRequired = false)] public string[] ExternalIds { get; set; }
    }

    // ── Canal INVERSO Revit → web ────────────────────────────────────────────
    [DataContract]
    public class SelPayloadDto
    {
        [DataMember(Name = "externalIds")] public string[] ExternalIds { get; set; }
    }

    [DataContract]
    public class SelReportDto
    {
        [DataMember(Name = "project")] public string Project { get; set; }
        [DataMember(Name = "kind")] public string Kind { get; set; }
        [DataMember(Name = "payload")] public SelPayloadDto Payload { get; set; }
    }

    [DataContract]
    public class ScheduleDto
    {
        [DataMember(Name = "name")] public string Name { get; set; }
        [DataMember(Name = "columns")] public string[] Columns { get; set; }
        [DataMember(Name = "rows")] public string[][] Rows { get; set; }
    }

    [DataContract]
    public class SchedPayloadDto
    {
        [DataMember(Name = "schedules")] public ScheduleDto[] Schedules { get; set; }
    }

    [DataContract]
    public class SchedReportDto
    {
        [DataMember(Name = "project")] public string Project { get; set; }
        [DataMember(Name = "kind")] public string Kind { get; set; }
        [DataMember(Name = "payload")] public SchedPayloadDto Payload { get; set; }
    }

    [DataContract]
    public class LinkCommandDto
    {
        [DataMember(Name = "id")] public long Id { get; set; }
        [DataMember(Name = "action")] public string Action { get; set; }
        [DataMember(Name = "externalIds", IsRequired = false)] public string[] ExternalIds { get; set; }
        [DataMember(Name = "groups", IsRequired = false)] public ColorGroupDto[] Groups { get; set; }
        [DataMember(Name = "by", IsRequired = false)] public string By { get; set; }
    }

    [DataContract]
    public class PollResponseDto
    {
        [DataMember(Name = "success")] public bool Success { get; set; }
        [DataMember(Name = "commands")] public LinkCommandDto[] Commands { get; set; }
        [DataMember(Name = "last_id")] public long LastId { get; set; }
    }

    [DataContract]
    public class ActiveFrentesDto
    {
        [DataMember(Name = "success")] public bool Success { get; set; }
        [DataMember(Name = "active", IsRequired = false)] public string Active { get; set; }
        [DataMember(Name = "frentes", IsRequired = false)] public string[] Frentes { get; set; }
    }

    public static class LinkService
    {
        private static readonly HttpClient Http = new HttpClient { Timeout = TimeSpan.FromSeconds(8) };
        private static readonly ConcurrentQueue<LinkCommandDto> Pending = new ConcurrentQueue<LinkCommandDto>();
        // Reportes Revit→web pendientes de subir (JSON ya serializado, listo para POST).
        private static readonly ConcurrentQueue<string> Reports = new ConcurrentQueue<string>();

        private static ExternalEvent _externalEvent;
        private static ApplyCommandsHandler _handler;
        private static CancellationTokenSource _cts;
        private static long _sinceId;

        // Selección inversa: se muestrea en el evento Idling (Revit 2023 no tiene
        // SelectionChanged). Deduplicamos por clave para no spamear el canal.
        private static DateTime _lastIdleCheck = DateTime.MinValue;
        private static string _lastSelKey = null;

        public static bool Running { get; private set; }
        public static string BackendUrl { get; private set; }
        public static string Project { get; private set; }
        public static string Token { get; private set; }
        public static string LastError { get; private set; }

        public static void Start(string backendUrl, string project, string token)
        {
            Stop();
            BackendUrl = backendUrl.TrimEnd('/');
            Project = project.Trim();
            Token = (token ?? "").Trim();
            _sinceId = 0;
            _lastSelKey = null;   // re-reporta la selección al re-vincular
            LastError = null;

            if (_handler == null)
            {
                _handler = new ApplyCommandsHandler();
                _externalEvent = ExternalEvent.Create(_handler);
            }

            _cts = new CancellationTokenSource();
            Running = true;
            Task.Run(() => PollLoop(_cts.Token));
        }

        public static void Stop()
        {
            Running = false;
            try { _cts?.Cancel(); } catch { }
            _cts = null;
        }

        // Auto-detección: pregunta al backend qué frente tiene ABIERTO el usuario
        // en el visor web ahora mismo. Llamada bloqueante corta (para el diálogo).
        public static string DetectActiveFrente(string backendUrl, string token)
        {
            try
            {
                var url = (backendUrl ?? "").TrimEnd('/') + "/api/link/active-frentes";
                using (var req = new HttpRequestMessage(HttpMethod.Get, url))
                {
                    if (!string.IsNullOrEmpty(token))
                        req.Headers.TryAddWithoutValidation("Authorization", "Bearer " + token.Trim());
                    var res = Http.SendAsync(req).GetAwaiter().GetResult();
                    if (!res.IsSuccessStatusCode) return null;
                    var body = res.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult();
                    return Deserialize<ActiveFrentesDto>(body)?.Active;
                }
            }
            catch { return null; }
        }

        private static async Task PollLoop(CancellationToken ct)
        {
            while (!ct.IsCancellationRequested)
            {
                try
                {
                    var url = $"{BackendUrl}/api/link/commands?project={Uri.EscapeDataString(Project)}&since={_sinceId}";
                    using (var req = new HttpRequestMessage(HttpMethod.Get, url))
                    {
                        if (!string.IsNullOrEmpty(Token))
                            req.Headers.TryAddWithoutValidation("Authorization", "Bearer " + Token);

                        var res = await Http.SendAsync(req, ct).ConfigureAwait(false);
                        if (res.IsSuccessStatusCode)
                        {
                            var body = await res.Content.ReadAsByteArrayAsync().ConfigureAwait(false);
                            var data = Deserialize<PollResponseDto>(body);
                            if (data != null && data.Success)
                            {
                                _sinceId = Math.Max(_sinceId, data.LastId);
                                if (data.Commands != null && data.Commands.Length > 0)
                                {
                                    foreach (var cmd in data.Commands) Pending.Enqueue(cmd);
                                    _externalEvent.Raise(); // aplicar en el hilo de Revit
                                }
                                LastError = null;
                            }
                        }
                        else if ((int)res.StatusCode == 401)
                        {
                            LastError = "Token caducado o inválido — re-vincula (botón ECD) con un token fresco.";
                        }
                        else
                        {
                            LastError = "HTTP " + (int)res.StatusCode;
                        }
                    }

                    // Subir reportes Revit→web pendientes (selección inversa / metrados).
                    while (Reports.TryDequeue(out var reportBody))
                    {
                        try
                        {
                            using (var preq = new HttpRequestMessage(HttpMethod.Post, $"{BackendUrl}/api/link/report"))
                            {
                                if (!string.IsNullOrEmpty(Token))
                                    preq.Headers.TryAddWithoutValidation("Authorization", "Bearer " + Token);
                                preq.Content = new StringContent(reportBody, Encoding.UTF8, "application/json");
                                await Http.SendAsync(preq, ct).ConfigureAwait(false);
                            }
                        }
                        catch (OperationCanceledException) when (ct.IsCancellationRequested) { return; }
                        catch (Exception ex) { LastError = "report: " + ex.Message; }
                    }
                }
                // OJO: un TIMEOUT de HttpClient también lanza TaskCanceledException.
                // Solo salir si la cancelación es NUESTRA (Stop); un timeout de red
                // es transitorio y el sondeo debe seguir vivo. (Antes, un solo hipo
                // de red mataba el vínculo en silencio → chip "Esperando Revit…".)
                catch (OperationCanceledException) when (ct.IsCancellationRequested) { break; }
                catch (OperationCanceledException) { LastError = "timeout de red (reintentando)"; }
                catch (Exception ex) { LastError = ex.Message; }

                try { await Task.Delay(1000, ct).ConfigureAwait(false); }
                catch (OperationCanceledException) { break; }
            }
        }

        private static T Deserialize<T>(byte[] json) where T : class
        {
            try
            {
                using (var ms = new MemoryStream(json))
                {
                    var ser = new DataContractJsonSerializer(typeof(T));
                    return ser.ReadObject(ms) as T;
                }
            }
            catch { return null; }
        }

        private static string Serialize<T>(T obj)
        {
            using (var ms = new MemoryStream())
            {
                var ser = new DataContractJsonSerializer(typeof(T));
                ser.WriteObject(ms, obj);
                return Encoding.UTF8.GetString(ms.ToArray());
            }
        }

        // ── Selección inversa: muestreo en Idling (hilo de Revit, seguro) ────────
        // Suscrito desde ECDLinkApp.OnStartup. Cuando el usuario selecciona en
        // Revit, se encola un reporte que el poll loop sube a la web.
        public static void HandleIdling(object sender, IdlingEventArgs e)
        {
            if (!Running) return;
            var now = DateTime.UtcNow;
            if ((now - _lastIdleCheck).TotalMilliseconds < 600) return; // no saturar
            _lastIdleCheck = now;
            try
            {
                var uidoc = (sender as UIApplication)?.ActiveUIDocument;
                if (uidoc == null) return;
                var doc = uidoc.Document;
                var uids = new List<string>();
                foreach (var id in uidoc.Selection.GetElementIds())
                {
                    try { var el = doc.GetElement(id); if (el != null) uids.Add(el.UniqueId); }
                    catch { }
                }
                var key = string.Join(",", uids);
                if (key == _lastSelKey) return;   // sin cambios → no reportar
                _lastSelKey = key;
                var report = new SelReportDto
                {
                    Project = Project,
                    Kind = "selection",
                    Payload = new SelPayloadDto { ExternalIds = uids.ToArray() },
                };
                Reports.Enqueue(Serialize(report));
            }
            catch { /* el Idling de Revit JAMÁS debe romperse por nosotros */ }
        }

        // ── Metrados: leer las Tablas de planificación TAL CUAL las configuró el
        // modelador (columnas visibles, celdas ya calculadas por Revit). ─────────
        private static string BuildSchedulesReport(Document doc)
        {
            var list = new List<ScheduleDto>();
            var collector = new FilteredElementCollector(doc).OfClass(typeof(ViewSchedule));
            foreach (ViewSchedule vs in collector)
            {
                try
                {
                    if (vs.IsTemplate) continue;
                    if (vs.IsTitleblockRevisionSchedule) continue; // ruido: revisiones de rótulo
                    var def = vs.Definition;
                    if (def == null) continue;

                    // Encabezados de columna respetando lo que puso el modelador.
                    var cols = new List<string>();
                    int fieldCount = def.GetFieldCount();
                    for (int i = 0; i < fieldCount; i++)
                    {
                        ScheduleField f;
                        try { f = def.GetField(i); } catch { continue; }
                        if (f.IsHidden) continue;
                        var h = f.ColumnHeading;
                        if (string.IsNullOrEmpty(h)) { try { h = f.GetName(); } catch { } }
                        cols.Add(h ?? "");
                    }

                    // Filas: leer el cuerpo tal cual se ve (datos, agrupaciones, totales).
                    var rows = new List<string[]>();
                    var body = vs.GetTableData().GetSectionData(SectionType.Body);
                    int nRows = body.NumberOfRows, nCols = body.NumberOfColumns;
                    for (int r = 0; r < nRows; r++)
                    {
                        var row = new string[nCols];
                        for (int c = 0; c < nCols; c++)
                        {
                            try { row[c] = vs.GetCellText(SectionType.Body, r, c); }
                            catch { row[c] = ""; }
                        }
                        rows.Add(row);
                    }

                    if (rows.Count == 0 && cols.Count == 0) continue; // tabla vacía sin config
                    list.Add(new ScheduleDto { Name = vs.Name, Columns = cols.ToArray(), Rows = rows.ToArray() });
                }
                catch { /* saltar tabla problemática, seguir con las demás */ }
            }
            var report = new SchedReportDto
            {
                Project = Project,
                Kind = "schedules",
                Payload = new SchedPayloadDto { Schedules = list.ToArray() },
            };
            return Serialize(report);
        }

        // ── Aplicación de comandos DENTRO del contexto de Revit ──────────────
        private class ApplyCommandsHandler : IExternalEventHandler
        {
            public string GetName() => "ECD Link — aplicar comandos";

            // Elementos actualmente pintados por el Live Link (para poder despintar).
            private static readonly HashSet<ElementId> Colored = new HashSet<ElementId>();

            public void Execute(UIApplication app)
            {
                var uidoc = app.ActiveUIDocument;
                if (uidoc == null) return;
                var doc = uidoc.Document;

                // Procesar TODOS los comandos en orden. (Antes se colapsaba al último:
                // un 'colorize' seguido de 'isolate' perdía los colores.)
                var batch = new List<LinkCommandDto>();
                while (Pending.TryDequeue(out var cmd)) batch.Add(cmd);

                foreach (var last in batch)
                {
                    try { Apply(uidoc, doc, last); }
                    catch (Exception ex) { LastError = "Aplicando " + last.Action + ": " + ex.Message; }
                }
            }

            private static void Apply(UIDocument uidoc, Document doc, LinkCommandDto last)
            {
                var ids = ResolveIds(doc, last.ExternalIds);

                switch (last.Action)
                {
                    case "select":
                        uidoc.Selection.SetElementIds(ids);
                        break;

                    case "isolate":
                        if (ids.Count == 0) return;
                        using (var t = new Transaction(doc, "ECD Link — aislar"))
                        {
                            t.Start();
                            uidoc.ActiveView.IsolateElementsTemporary(ids);
                            t.Commit();
                        }
                        uidoc.Selection.SetElementIds(ids);
                        try { uidoc.ShowElements(ids); } catch { /* zoom es cortesía, no crítico */ }
                        break;

                    case "hide":
                        // Ocultar puro (la web tiene ocultos sin aislamiento). Se resetea
                        // el modo temporal y se oculta el set COMPLETO — así también se
                        // reflejan los des-ocultados (espejo idempotente del estado web).
                        if (ids.Count == 0) return;
                        using (var t = new Transaction(doc, "ECD Link — ocultar"))
                        {
                            t.Start();
                            uidoc.ActiveView.DisableTemporaryViewMode(TemporaryViewMode.TemporaryHideIsolate);
                            uidoc.ActiveView.HideElementsTemporary(ids);
                            t.Commit();
                        }
                        break;

                    case "clear":
                        using (var t = new Transaction(doc, "ECD Link — restaurar vista"))
                        {
                            t.Start();
                            uidoc.ActiveView.DisableTemporaryViewMode(TemporaryViewMode.TemporaryHideIsolate);
                            t.Commit();
                        }
                        uidoc.Selection.SetElementIds(new List<ElementId>());
                        break;

                    case "colorize":
                        ApplyColors(uidoc, doc, last.Groups);
                        break;

                    case "clearcolors":
                        ClearColors(uidoc, doc);
                        break;

                    case "export-schedules":
                        // Leer las tablas del modelo (hilo de Revit) y encolar el
                        // reporte; el poll loop lo sube a la web.
                        try { Reports.Enqueue(BuildSchedulesReport(doc)); }
                        catch (Exception ex) { LastError = "schedules: " + ex.Message; }
                        break;
                }
            }

            // ── Colores del filtro web → overrides gráficos por vista ─────────
            private static void ApplyColors(UIDocument uidoc, Document doc, ColorGroupDto[] groups)
            {
                var view = uidoc.ActiveView;
                var solidFillId = GetSolidFillId(doc);

                using (var t = new Transaction(doc, "ECD Link — colores del filtro"))
                {
                    t.Start();

                    // Despintar lo anterior (el estado web es la verdad completa).
                    var reset = new OverrideGraphicSettings();
                    foreach (var id in Colored)
                    {
                        try { view.SetElementOverrides(id, reset); } catch { /* elemento borrado o de otra vista */ }
                    }
                    Colored.Clear();

                    foreach (var g in groups ?? new ColorGroupDto[0])
                    {
                        var color = ParseHexColor(g.Color);
                        if (color == null) continue;
                        var ogs = new OverrideGraphicSettings()
                            .SetSurfaceForegroundPatternColor(color)
                            .SetCutForegroundPatternColor(color)
                            .SetProjectionLineColor(color);
                        if (solidFillId != ElementId.InvalidElementId)
                        {
                            ogs = ogs.SetSurfaceForegroundPatternId(solidFillId)
                                     .SetCutForegroundPatternId(solidFillId);
                        }

                        foreach (var eid in ResolveIds(doc, g.ExternalIds))
                        {
                            try { view.SetElementOverrides(eid, ogs); Colored.Add(eid); }
                            catch { /* elemento no soporta overrides en esta vista */ }
                        }
                    }

                    t.Commit();
                }
            }

            private static void ClearColors(UIDocument uidoc, Document doc)
            {
                if (Colored.Count == 0) return;
                using (var t = new Transaction(doc, "ECD Link — quitar colores"))
                {
                    t.Start();
                    var reset = new OverrideGraphicSettings();
                    foreach (var id in Colored)
                    {
                        try { uidoc.ActiveView.SetElementOverrides(id, reset); } catch { }
                    }
                    Colored.Clear();
                    t.Commit();
                }
            }

            private static ElementId GetSolidFillId(Document doc)
            {
                try
                {
                    var patterns = new FilteredElementCollector(doc).OfClass(typeof(FillPatternElement));
                    foreach (FillPatternElement fp in patterns)
                    {
                        if (fp.GetFillPattern().IsSolidFill) return fp.Id;
                    }
                }
                catch { }
                return ElementId.InvalidElementId;
            }

            private static Color ParseHexColor(string hex)
            {
                try
                {
                    var h = (hex ?? "").TrimStart('#');
                    if (h.Length != 6) return null;
                    return new Color(
                        Convert.ToByte(h.Substring(0, 2), 16),
                        Convert.ToByte(h.Substring(2, 2), 16),
                        Convert.ToByte(h.Substring(4, 2), 16));
                }
                catch { return null; }
            }

            private static IList<ElementId> ResolveIds(Document doc, string[] uniqueIds)
            {
                var ids = new List<ElementId>();
                if (uniqueIds == null) return ids;
                foreach (var uid in uniqueIds)
                {
                    if (string.IsNullOrWhiteSpace(uid)) continue;
                    try
                    {
                        var el = doc.GetElement(uid);
                        if (el != null) ids.Add(el.Id);
                    }
                    catch { /* elemento de otro modelo del frente: se ignora con gracia */ }
                }
                return ids;
            }
        }
    }
}
