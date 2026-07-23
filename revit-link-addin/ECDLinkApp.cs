// ECDLinkApp — registro del botón "ECD Link" en el ribbon de Revit, y el
// comando que activa/desactiva el vínculo con la plataforma web.
using System;
using System.IO;
using System.Reflection;
using System.Windows.Forms;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
// La API de Revit también define Form/TextBox — alias explícitos a WinForms:
using WinForm = System.Windows.Forms.Form;
using WinTextBox = System.Windows.Forms.TextBox;

namespace ECDLink
{
    public class ECDLinkApp : IExternalApplication
    {
        public Result OnStartup(UIControlledApplication app)
        {
            const string tabName = "ECD";
            try { app.CreateRibbonTab(tabName); } catch { /* la pestaña ya existe */ }

            var panel = app.CreateRibbonPanel(tabName, "Live Link");
            var asmPath = Assembly.GetExecutingAssembly().Location;

            var btn = new PushButtonData(
                "ECDLinkToggle",
                "Vincular\ncon ECD",
                asmPath,
                "ECDLink.ToggleLinkCommand")
            {
                ToolTip = "Vincula este Revit con la plataforma ECD: lo que se seleccione o aísle en la web se replica aquí en ~1 segundo.",
            };
            panel.AddItem(btn);
            return Result.Succeeded;
        }

        public Result OnShutdown(UIControlledApplication app)
        {
            LinkService.Stop();
            return Result.Succeeded;
        }
    }

    [Transaction(TransactionMode.Manual)]
    public class ToggleLinkCommand : IExternalCommand
    {
        public Result Execute(ExternalCommandData commandData, ref string message, ElementSet elements)
        {
            if (LinkService.Running)
            {
                LinkService.Stop();
                TaskDialog.Show("ECD Link", "Vínculo desactivado.");
                return Result.Succeeded;
            }

            var cfg = LinkConfig.LoadOrDefaults();
            using (var dlg = new LinkConfigForm(cfg))
            {
                if (dlg.ShowDialog() != DialogResult.OK) return Result.Cancelled;
                cfg = dlg.Config;
                cfg.Save();
            }

            LinkService.Start(cfg.BackendUrl, cfg.Project, cfg.Token);
            TaskDialog.Show("ECD Link",
                $"Vínculo ACTIVO con el frente \"{cfg.Project}\".\n\n" +
                "Deja este Revit abierto con el modelo del frente. Lo que se seleccione o aísle en la web aparecerá aquí.\n\n" +
                "Vuelve a pulsar el botón para desactivar.");
            return Result.Succeeded;
        }
    }

    // ── Configuración persistida en %AppData%\ECDLink\config.json ────────────
    public class LinkConfig
    {
        public string BackendUrl = "http://localhost:3000";
        public string Project = "";
        public string Token = "";

        private static string PathFile =>
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ECDLink", "config.json");

        public static LinkConfig LoadOrDefaults()
        {
            try
            {
                if (File.Exists(PathFile))
                {
                    var lines = File.ReadAllLines(PathFile);
                    var cfg = new LinkConfig();
                    foreach (var ln in lines)
                    {
                        var idx = ln.IndexOf('=');
                        if (idx <= 0) continue;
                        var key = ln.Substring(0, idx).Trim();
                        var val = ln.Substring(idx + 1).Trim();
                        if (key == "backendUrl") cfg.BackendUrl = val;
                        else if (key == "project") cfg.Project = val;
                        else if (key == "token") cfg.Token = val;
                    }
                    return cfg;
                }
            }
            catch { /* config corrupta → defaults */ }
            return new LinkConfig();
        }

        public void Save()
        {
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(PathFile));
                File.WriteAllLines(PathFile, new[]
                {
                    "backendUrl=" + BackendUrl,
                    "project=" + Project,
                    "token=" + Token,
                });
            }
            catch { /* no crítico */ }
        }
    }

    // ── Diálogo mínimo de configuración (WinForms) ───────────────────────────
    public class LinkConfigForm : WinForm
    {
        public LinkConfig Config { get; private set; }
        private readonly WinTextBox _url = new WinTextBox();
        private readonly WinTextBox _project = new WinTextBox();
        private readonly WinTextBox _token = new WinTextBox();

        public LinkConfigForm(LinkConfig cfg)
        {
            Config = cfg;
            Text = "ECD Link — conectar con la plataforma";
            Width = 480; Height = 250;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false; MinimizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;

            var y = 15;
            Controls.Add(MakeLabel("Servidor (backend):", y));
            _url.SetBounds(160, y, 290, 24); _url.Text = cfg.BackendUrl; Controls.Add(_url); y += 38;

            Controls.Add(MakeLabel("Frente (project id):", y));
            _project.SetBounds(160, y, 290, 24); _project.Text = cfg.Project; Controls.Add(_project); y += 38;

            Controls.Add(MakeLabel("Token (opcional):", y));
            _token.SetBounds(160, y, 290, 24); _token.Text = cfg.Token; _token.UseSystemPasswordChar = true; Controls.Add(_token); y += 48;

            var ok = new Button { Text = "Vincular", DialogResult = DialogResult.OK };
            ok.SetBounds(250, y, 95, 30);
            var cancel = new Button { Text = "Cancelar", DialogResult = DialogResult.Cancel };
            cancel.SetBounds(355, y, 95, 30);
            Controls.Add(ok); Controls.Add(cancel);
            AcceptButton = ok; CancelButton = cancel;

            FormClosing += (s, e) =>
            {
                if (DialogResult != DialogResult.OK) return;
                if (string.IsNullOrWhiteSpace(_project.Text))
                {
                    MessageBox.Show("Indica el frente (project id) — es el mismo código del frente en la web.", "ECD Link");
                    e.Cancel = true;
                    return;
                }
                Config = new LinkConfig
                {
                    BackendUrl = _url.Text.Trim(),
                    Project = _project.Text.Trim(),
                    Token = _token.Text.Trim(),
                };
            };
        }

        private Label MakeLabel(string text, int y)
        {
            var lb = new Label { Text = text };
            lb.SetBounds(15, y + 3, 140, 22);
            return lb;
        }
    }
}
