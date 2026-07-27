const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  shell,
  nativeImage,
  net,
  dialog,
} = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path");

const CONFIG_URL =
  "https://kouran0711.github.io/nith-app-config/app-config.json";
const FALLBACK_URL = "https://nith.discloud.app/login.php";
const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

let splash;
let mainWindow;
let tray;
let isQuiting = false;
let updateCheckRunning = false;
let manualUpdateCheck = false;
const startedHidden = process.argv.includes("--hidden");

function enableAutoLaunch() {
  if (process.platform !== "win32" && process.platform !== "darwin") return;

  app.setLoginItemSettings({
    openAtLogin: true,
    openAsHidden: true,
    path: process.execPath,
    args: ["--hidden"],
  });
}

async function getTargetUrl() {
  try {
    const response = await net.fetch(`${CONFIG_URL}?v=${Date.now()}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Cache-Control": "no-cache",
      },
    });

    if (!response.ok) {
      throw new Error(`Falha HTTP ${response.status}`);
    }

    const config = await response.json();
    const parsedUrl = new URL(config.url);

    if (parsedUrl.protocol !== "https:") {
      throw new Error("A configuração remota precisa usar HTTPS.");
    }

    return parsedUrl.href;
  } catch (error) {
    console.error("Falha ao consultar a configuração remota:", error);
    return FALLBACK_URL;
  }
}

function createSplash() {
  splash = new BrowserWindow({
    width: 720,
    height: 480,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    center: true,
    backgroundColor: "#00000000",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  splash.loadFile(path.join(__dirname, "splash.html"));
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.show();
  mainWindow.focus();
}

async function checkForUpdates(manual = false) {
  if (!app.isPackaged) {
    if (manual) {
      manualUpdateCheck = false;
      await dialog.showMessageBox({
        type: "info",
        title: "Atualizações",
        message: "A verificação funciona somente no aplicativo instalado.",
      });
    }
    return;
  }

  if (updateCheckRunning) return;
  updateCheckRunning = true;
  manualUpdateCheck = manual;

  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    console.error("Erro ao verificar atualização:", error);

    if (manual) {
      manualUpdateCheck = false;
      await dialog.showMessageBox({
        type: "error",
        title: "Falha ao verificar atualização",
        message: "Não foi possível consultar as atualizações agora.",
        detail: error?.message || String(error),
      });
    }
  } finally {
    updateCheckRunning = false;
  }
}

function createTray() {
  const iconPath = path.join(__dirname, "icon.png");
  const trayIcon = nativeImage
    .createFromPath(iconPath)
    .resize({ width: 16, height: 16 });

  tray = new Tray(trayIcon);
  tray.setToolTip(`Nith ERP ${app.getVersion()}`);

  const menu = Menu.buildFromTemplate([
    {
      label: "Abrir Nith ERP",
      click: showMainWindow,
    },
    {
      label: "Verificar atualizações",
      click: () => checkForUpdates(true),
    },
    { type: "separator" },
    {
      label: `Versão ${app.getVersion()}`,
      enabled: false,
    },
    { type: "separator" },
    {
      label: "Sair",
      click: () => {
        isQuiting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(menu);
  tray.on("click", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;

    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      showMainWindow();
    }
  });
}

async function createMain() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 620,
    show: false,
    backgroundColor: "#0b1220",
    title: "Nith ERP",
    icon: path.join(__dirname, "icon.png"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.setMenuBarVisibility(false);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url).catch(console.error);
    return { action: "deny" };
  });

  const targetUrl = await getTargetUrl();
  await mainWindow.loadURL(targetUrl);

  mainWindow.webContents.once("did-finish-load", () => {
    setTimeout(() => {
      if (splash && !splash.isDestroyed()) splash.close();

      if (startedHidden) return;

      mainWindow.maximize();
      showMainWindow();
    }, 800);
  });

  mainWindow.on("close", (event) => {
    if (isQuiting) return;

    event.preventDefault();
    mainWindow.hide();

    tray?.displayBalloon({
      title: "Nith ERP",
      content: "O aplicativo continua rodando na bandeja do sistema.",
    });
  });

  mainWindow.webContents.on("did-fail-load", (_event, code, description) => {
    if (code === -3) return;

    const safeDescription = String(description)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll("'", "&#39;")
      .replaceAll('"', "&quot;");

    mainWindow.webContents
      .executeJavaScript(`
        document.body.innerHTML = ` + "`" + `
          <div style="font-family:Segoe UI,sans-serif;padding:40px;color:#fff;background:#0b1220;min-height:100vh;text-align:center;box-sizing:border-box">
            <h1>Sem conexão</h1>
            <p>${safeDescription}</p>
            <button onclick="location.reload()" style="margin-top:20px;padding:10px 20px;background:#2bb7f6;border:0;color:#fff;border-radius:6px;cursor:pointer">
              Tentar novamente
            </button>
          </div>
        ` + "`" + `;
      `)
      .catch(console.error);
  });
}

function configureAutoUpdater() {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.logger = console;

  autoUpdater.on("checking-for-update", () => {
    console.log("Verificando atualizações...");
  });

  autoUpdater.on("update-available", (info) => {
    manualUpdateCheck = false;
    console.log("Atualização disponível:", info.version);
    tray?.displayBalloon({
      title: "Atualização da Nith ERP",
      content: `A versão ${info.version} está sendo baixada.`,
    });
  });

  autoUpdater.on("update-not-available", async (info) => {
    console.log("Aplicativo atualizado:", info.version);

    if (manualUpdateCheck) {
      manualUpdateCheck = false;
      await dialog.showMessageBox({
        type: "info",
        title: "Nith ERP atualizada",
        message: `Você já está usando a versão mais recente (${app.getVersion()}).`,
      });
    }
  });

  autoUpdater.on("download-progress", (progress) => {
    const ratio = Math.max(0, Math.min(1, progress.percent / 100));
    mainWindow?.setProgressBar(ratio);
  });

  autoUpdater.on("update-downloaded", async (info) => {
    mainWindow?.setProgressBar(-1);
    showMainWindow();

    const result = await dialog.showMessageBox(mainWindow, {
      type: "info",
      title: "Atualização pronta",
      message: `A versão ${info.version} da Nith ERP foi baixada.`,
      detail:
        "Reinicie agora para instalar. Você também pode escolher Depois e a atualização será aplicada quando o aplicativo for encerrado normalmente.",
      buttons: ["Reiniciar e atualizar", "Depois"],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });

    if (result.response === 0) {
      isQuiting = true;
      autoUpdater.quitAndInstall(false, true);
    }
  });

  autoUpdater.on("error", (error) => {
    manualUpdateCheck = false;
    mainWindow?.setProgressBar(-1);
    console.error("Erro no atualizador:", error);
  });

  setTimeout(() => checkForUpdates(false), 8000);
  setInterval(() => checkForUpdates(false), UPDATE_CHECK_INTERVAL_MS);
}

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", showMainWindow);

  app.whenReady().then(async () => {
    enableAutoLaunch();

    if (!startedHidden) createSplash();

    createTray();
    await createMain();
    configureAutoUpdater();
  });
}

app.on("before-quit", () => {
  isQuiting = true;
});

app.on("window-all-closed", () => {
  // O aplicativo permanece ativo na bandeja.
});
