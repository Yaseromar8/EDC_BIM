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

namespace ECDLink
{
    [DataContract]
    public class ColorGroupDto
    {
        [DataMember(Name = "color", IsRequired = false)] public string Color { get; set; }
        [DataMember(Name = "externalIds", IsRequired = false)] public string[] ExternalIds { get; set; }
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

    public static class LinkService
    {
        private static readonly HttpClient Http = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
        private static readonly ConcurrentQueue<LinkCommandDto> Pending = new ConcurrentQueue<LinkCommandDto>();

        private static ExternalEvent _externalEvent;
        private static ApplyCommandsHandler _handler;
        private static CancellationTokenSource _cts;
        private static long _sinceId;

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
                        else
                        {
                            LastError = "HTTP " + (int)res.StatusCode;
                        }
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
