/**
 * Domma UGC Creator — Versão para PC (Windows).
 * Abre o mesmo painel da nuvem (mesma conta, mesmos projetos) e, enquanto o app
 * está aberto, faz a montagem dos vídeos (FFmpeg) neste computador.
 */
const { app, BrowserWindow, Menu, Tray, nativeImage, net, shell, dialog } = require("electron");
const os = require("node:os");
const path = require("node:path");

const BASE = process.env.UGC_URL || "https://ugccreator.dommasistemas.com.br";

// FFmpeg e fontes empacotados (precisam estar definidos antes de carregar o núcleo da montagem).
const ffmpegPath = require("ffmpeg-static");
process.env.FFMPEG_PATH = ffmpegPath.replace("app.asar", "app.asar.unpacked");
process.env.PASTA_FONTES = app.isPackaged ? path.join(process.resourcesPath, "fonts") : path.join(__dirname, "..", "assets", "fonts");

const { criarAgente } = require("./agente");

if (!app.requestSingleInstanceLock()) app.quit();

let janela = null;
let bandeja = null;
let agente = null;
let saindo = false;

function titulo(e) {
  if (!e.conectado) return "Domma UGC Creator — faça login para ativar a montagem no PC";
  if (e.trabalhando) return `Domma UGC Creator — montando: ${e.trabalhando}`;
  return `Domma UGC Creator — montagem no PC ativa (${e.feitos} vídeo${e.feitos === 1 ? "" : "s"} nesta sessão)`;
}

function atualizarStatus(e) {
  if (janela && !janela.isDestroyed()) janela.setTitle(titulo(e));
  if (bandeja) {
    bandeja.setToolTip(titulo(e));
    bandeja.setContextMenu(
      Menu.buildFromTemplate([
        { label: e.conectado ? `Conectado: ${e.usuario ?? ""} (${e.workspace ?? ""})` : "Não conectado (faça login)", enabled: false },
        { label: e.trabalhando ? `Montando: ${e.trabalhando}` : "Montagem no PC: aguardando", enabled: false },
        ...(e.erro ? [{ label: `Último erro: ${String(e.erro).slice(0, 60)}`, enabled: false }] : []),
        { type: "separator" },
        { label: "Abrir painel", click: mostrarJanela },
        { label: "Sair", click: () => { saindo = true; app.quit(); } },
      ]),
    );
  }
}

function mostrarJanela() {
  if (!janela) return criarJanela();
  janela.show();
  janela.focus();
}

function criarJanela() {
  janela = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: "Domma UGC Creator",
    icon: path.join(__dirname, "build", "icon.png"),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  janela.loadURL(BASE);
  // Links externos (ex.: GitHub, provedores) abrem no navegador padrão.
  janela.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(BASE)) { shell.openExternal(url); return { action: "deny" }; }
    return { action: "allow" };
  });
  janela.webContents.on("did-fail-load", (_e, _c, desc) => {
    janela.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<body style="font-family:system-ui;padding:40px"><h2>Sem conexão com o UGC Creator</h2><p>${desc}</p><p>Verifique a internet. Tentando de novo em 10 s…</p></body>`)}`);
    setTimeout(() => janela && janela.loadURL(BASE), 10_000);
  });
  // Fechar a janela minimiza para a bandeja: a montagem continua.
  janela.on("close", (e) => {
    if (!saindo) { e.preventDefault(); janela.hide(); }
  });
  if (agente) atualizarStatus(agente.estado);
}

function iniciarAtualizacao() {
  if (!app.isPackaged) return;
  try {
    const { autoUpdater } = require("electron-updater");
    autoUpdater.autoDownload = true;
    autoUpdater.on("update-downloaded", async (info) => {
      const r = await dialog.showMessageBox({
        type: "info",
        buttons: ["Reiniciar agora", "Depois"],
        message: `Nova versão ${info.version} do Domma UGC Creator baixada.`,
        detail: "Reinicie para atualizar. Se houver uma montagem em andamento, ela volta para a nuvem.",
      });
      if (r.response === 0) { saindo = true; autoUpdater.quitAndInstall(); }
    });
    autoUpdater.checkForUpdates().catch(() => {});
    setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 6 * 3600 * 1000);
  } catch (e) {
    console.error("atualização automática indisponível", e);
  }
}

app.on("second-instance", mostrarJanela);

app.whenReady().then(() => {
  const icone = nativeImage.createFromPath(path.join(__dirname, "build", "icon.png")).resize({ width: 16, height: 16 });
  bandeja = new Tray(icone);
  bandeja.on("click", mostrarJanela);
  criarJanela();

  // O agente usa a sessão do painel (cookies do login) para falar com a API da nuvem.
  agente = criarAgente({
    base: BASE,
    fetch: (url, opcoes) => net.fetch(url, opcoes),
    maquina: os.hostname(),
    versao: app.getVersion(),
    pasta: path.join(app.getPath("temp"), "domma-ugc-montagem"),
    aoMudar: atualizarStatus,
  });
  agente.iniciar(5000);
  iniciarAtualizacao();
});

app.on("before-quit", () => { saindo = true; agente && agente.parar(); });
app.on("window-all-closed", (e) => e.preventDefault());
