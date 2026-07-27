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

// Arquivo remoto que informa qual endereço o aplicativo deve abrir.
const CONFIG_URL =
  "https://raw.githubusercontent.com/Kouran0711/nith-erp-desktop/main/app-config.json";

// Endereço usado caso o GitHub esteja indisponível.
const FALLBACK_URL = "https://nith.discloud.app/login.php";

// Verifica atualizações a cada quatro horas.
const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

let splash = null;
let mainWindow = null;
let tray = null;

let isQuiting = false;
let updateCheckRunning = false;
let manualUpdateCheck = false;
let updateDownloadedDialogShown = false;

const startedHidden = process.argv.includes("--hidden");

/**
 * Configura o aplicativo para iniciar junto com o Windows.
 */
function enableAutoLaunch() {
  if (process.platform !== "win32" && process.platform !== "darwin") {
    return;
  }

  try {
    app.setLoginItemSettings({
      openAtLogin: true,
      openAsHidden: true,
      path: process.execPath,
      args: ["--hidden"],
    });
  } catch (error) {
    console.error("Não foi possível configurar a inicialização automática:", error);
  }
}

/**
 * Verifica se o endereço recebido é HTTPS.
 */
function validateHttpsUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("A URL da configuração está vazia.");
  }

  const parsedUrl = new URL(value.trim());

  if (parsedUrl.protocol !== "https:") {
    throw new Error("A configuração remota precisa utilizar HTTPS.");
  }

  return parsedUrl.href;
}

/**
 * Consulta o app-config.json remoto.
 */
async function getTargetUrl() {
  try {
    const response = await net.fetch(`${CONFIG_URL}?v=${Date.now()}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });

    if (!response.ok) {
      throw new Error(`Falha HTTP ${response.status}`);
    }

    const config = await response.json();

    return validateHttpsUrl(config.url);
  } catch (error) {
    console.error("Falha ao consultar a configuração remota:", error);
    console.log("Utilizando endereço reserva:", FALLBACK_URL);

    return FALLBACK_URL;
  }
}

/**
 * Cria a tela de carregamento.
 */
function createSplash() {
  splash = new BrowserWindow({
    width: 720,
    height: 480,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    center: true,
    show: false,
    backgroundColor: "#00000000",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  splash.once("ready-to-show", () => {
    if (!splash || splash.isDestroyed()) {
      return;
    }

    splash.show();
  });

  splash
    .loadFile(path.join(__dirname, "splash.html"))
    .catch((error) => {
      console.error("Erro ao abrir a tela de carregamento:", error);
    });
}

/**
 * Fecha a tela de carregamento.
 */
function closeSplash() {
  if (splash && !splash.isDestroyed()) {
    splash.close();
  }

  splash = null;
}

/**
 * Exibe a janela principal.
 */
function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();
}

/**
 * Exibe uma notificação na bandeja quando possível.
 */
function showTrayBalloon(title, content) {
  if (!tray || tray.isDestroyed()) {
    return;
  }

  try {
    tray.displayBalloon({
      title,
      content,
      iconType: "info",
    });
  } catch (error) {
    console.error("Não foi possível exibir a notificação:", error);
  }
}

/**
 * Abre links externos com segurança.
 */
async function openExternalSafely(url) {
  try {
    const parsedUrl = new URL(url);

    if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
      throw new Error(`Protocolo externo não permitido: ${parsedUrl.protocol}`);
    }

    await shell.openExternal(parsedUrl.href);
  } catch (error) {
    console.error("Não foi possível abrir o link externo:", error);
  }
}

/**
 * Escapa texto para ser exibido no HTML.
 */
function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Exibe uma página local quando o sistema não puder ser carregado.
 */
async function showOfflinePage(error, retryUrl = FALLBACK_URL) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  const errorMessage = escapeHtml(
    error?.message || error || "Não foi possível acessar o sistema."
  );

  const safeRetryUrl = JSON.stringify(retryUrl);

  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0"
        >

        <title>Nith ERP — Sem conexão</title>

        <style>
          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 30px;
            background: #0b1220;
            color: #ffffff;
            font-family: "Segoe UI", Arial, sans-serif;
          }

          .card {
            width: 100%;
            max-width: 520px;
            padding: 38px;
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 18px;
            background: rgba(17, 29, 49, 0.96);
            text-align: center;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
          }

          h1 {
            margin: 0 0 14px;
            font-size: 28px;
          }

          p {
            margin: 8px 0;
            color: #c7d2e3;
            line-height: 1.55;
          }

          .error {
            margin-top: 20px;
            padding: 14px;
            border-radius: 10px;
            background: rgba(0, 0, 0, 0.22);
            color: #9fb2cc;
            font-size: 13px;
            overflow-wrap: anywhere;
          }

          button {
            margin-top: 24px;
            padding: 12px 24px;
            border: 0;
            border-radius: 8px;
            background: #2bb7f6;
            color: #ffffff;
            font-size: 15px;
            font-weight: 600;
            cursor: pointer;
          }

          button:hover {
            filter: brightness(1.08);
          }
        </style>
      </head>

      <body>
        <main class="card">
          <h1>Não foi possível conectar</h1>

          <p>
            Verifique sua conexão com a internet e tente novamente.
          </p>

          <div class="error">${errorMessage}</div>

          <button
            type="button"
            onclick="window.location.href = ${safeRetryUrl}"
          >
            Tentar novamente
          </button>
        </main>
      </body>
    </html>
  `;

  const dataUrl = `data:text/html;charset=UTF-8,${encodeURIComponent(html)}`;

  try {
    await mainWindow.loadURL(dataUrl);
  } catch (offlinePageError) {
    console.error(
      "Não foi possível exibir a página de erro:",
      offlinePageError
    );
  }
}

/**
 * Carrega o endereço obtido no GitHub.
 * Caso ele falhe, tenta o endereço reserva da Discloud.
 */
async function loadApplication() {
  const configuredUrl = await getTargetUrl();

  const urlsToTry = [configuredUrl];

  if (configuredUrl !== FALLBACK_URL) {
    urlsToTry.push(FALLBACK_URL);
  }

  let lastError = null;

  for (const url of urlsToTry) {
    try {
      console.log("Tentando carregar:", url);

      await mainWindow.loadURL(url);

      console.log("Sistema carregado com sucesso:", url);

      return {
        success: true,
        loadedUrl: url,
      };
    } catch (error) {
      lastError = error;

      console.error(`Falha ao carregar ${url}:`, error);
    }
  }

  await showOfflinePage(lastError, configuredUrl);

  return {
    success: false,
    loadedUrl: null,
  };
}

/**
 * Verifica se existe uma versão mais recente.
 */
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

  if (updateCheckRunning) {
    if (manual) {
      await dialog.showMessageBox({
        type: "info",
        title: "Atualizações",
        message: "Uma verificação de atualização já está em andamento.",
      });
    }

    return;
  }

  updateCheckRunning = true;
  manualUpdateCheck = manual;

  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    console.error("Erro ao verificar atualização:", error);

    if (manualUpdateCheck) {
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

/**
 * Cria o ícone e o menu da bandeja.
 */
function createTray() {
  const iconPath = path.join(__dirname, "icon.png");

  let trayIcon = nativeImage.createFromPath(iconPath);

  if (trayIcon.isEmpty()) {
    console.error("O ícone da bandeja não foi encontrado:", iconPath);
  } else {
    trayIcon = trayIcon.resize({
      width: 16,
      height: 16,
    });
  }

  tray = new Tray(trayIcon);

  tray.setToolTip(`Nith ERP ${app.getVersion()}`);

  const menu = Menu.buildFromTemplate([
    {
      label: "Abrir Nith ERP",
      click: showMainWindow,
    },
    {
      label: "Verificar atualizações",
      click: () => {
        checkForUpdates(true).catch(console.error);
      },
    },
    {
      type: "separator",
    },
    {
      label: `Versão ${app.getVersion()}`,
      enabled: false,
    },
    {
      type: "separator",
    },
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
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }

    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      showMainWindow();
    }
  });

  tray.on("double-click", showMainWindow);
}

/**
 * Cria a janela principal.
 */
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
      webSecurity: true,
    },
  });

  mainWindow.setMenuBarVisibility(false);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafely(url).catch(console.error);

    return {
      action: "deny",
    };
  });

  mainWindow.webContents.on(
    "will-navigate",
    (event, navigationUrl) => {
      try {
        const parsedUrl = new URL(navigationUrl);

        if (
          parsedUrl.protocol !== "https:" &&
          parsedUrl.protocol !== "data:"
        ) {
          event.preventDefault();

          console.error(
            "Navegação bloqueada por protocolo não permitido:",
            parsedUrl.protocol
          );
        }
      } catch (error) {
        event.preventDefault();
        console.error("Navegação inválida bloqueada:", error);
      }
    }
  );

  mainWindow.on("close", (event) => {
    if (isQuiting) {
      return;
    }

    event.preventDefault();
    mainWindow.hide();

    showTrayBalloon(
      "Nith ERP",
      "O aplicativo continua rodando na bandeja do sistema."
    );
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  const loadResult = await loadApplication();

  /*
   * Registra o tratamento de falhas futuras somente depois da
   * tentativa inicial. Assim, ele não interfere no fallback inicial.
   */
  mainWindow.webContents.on(
    "did-fail-load",
    async (
      _event,
      errorCode,
      errorDescription,
      validatedUrl,
      isMainFrame
    ) => {
      if (!isMainFrame || errorCode === -3) {
        return;
      }

      console.error("Falha de navegação:", {
        errorCode,
        errorDescription,
        validatedUrl,
      });

      await showOfflinePage(
        new Error(errorDescription),
        validatedUrl && validatedUrl.startsWith("https://")
          ? validatedUrl
          : FALLBACK_URL
      );
    }
  );

  closeSplash();

  /*
   * Pequeno atraso apenas para a transição visual.
   * O carregamento da página já terminou neste ponto.
   */
  await new Promise((resolve) => setTimeout(resolve, 300));

  if (!startedHidden) {
    mainWindow.maximize();
    showMainWindow();
  }

  if (!loadResult.success) {
    console.warn("O aplicativo foi aberto em modo sem conexão.");
  }
}

/**
 * Configura a atualização automática via GitHub Releases.
 */
function configureAutoUpdater() {
  if (!app.isPackaged) {
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.logger = console;

  autoUpdater.on("checking-for-update", () => {
    console.log("Verificando atualizações...");
  });

  autoUpdater.on("update-available", (info) => {
    console.log("Atualização disponível:", info.version);

    manualUpdateCheck = false;
    updateDownloadedDialogShown = false;

    showTrayBalloon(
      "Atualização da Nith ERP",
      `A versão ${info.version} está sendo baixada.`
    );
  });

  autoUpdater.on("update-not-available", async (info) => {
    console.log("Aplicativo atualizado:", info.version);

    if (!manualUpdateCheck) {
      return;
    }

    manualUpdateCheck = false;

    await dialog.showMessageBox({
      type: "info",
      title: "Nith ERP atualizada",
      message: `Você já está usando a versão mais recente (${app.getVersion()}).`,
    });
  });

  autoUpdater.on("download-progress", (progress) => {
    const percent = Number(progress.percent) || 0;
    const ratio = Math.max(0, Math.min(1, percent / 100));

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setProgressBar(ratio);
    }

    console.log(`Download da atualização: ${percent.toFixed(1)}%`);
  });

  autoUpdater.on("update-downloaded", async (info) => {
    if (updateDownloadedDialogShown) {
      return;
    }

    updateDownloadedDialogShown = true;
    manualUpdateCheck = false;

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setProgressBar(-1);
      showMainWindow();
    }

    const options = {
      type: "info",
      title: "Atualização pronta",
      message: `A versão ${info.version} da Nith ERP foi baixada.`,
      detail:
        "Reinicie agora para instalar. Ao escolher Depois, a atualização será aplicada quando o aplicativo for encerrado.",
      buttons: ["Reiniciar e atualizar", "Depois"],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    };

    const result =
      mainWindow && !mainWindow.isDestroyed()
        ? await dialog.showMessageBox(mainWindow, options)
        : await dialog.showMessageBox(options);

    if (result.response === 0) {
      isQuiting = true;

      setImmediate(() => {
        autoUpdater.quitAndInstall(false, true);
      });
    }
  });

  autoUpdater.on("error", async (error) => {
    const wasManualCheck = manualUpdateCheck;

    manualUpdateCheck = false;
    updateCheckRunning = false;

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setProgressBar(-1);
    }

    console.error("Erro no atualizador:", error);

    if (wasManualCheck) {
      await dialog.showMessageBox({
        type: "error",
        title: "Erro na atualização",
        message: "Não foi possível verificar ou baixar a atualização.",
        detail: error?.message || String(error),
      });
    }
  });

  setTimeout(() => {
    checkForUpdates(false).catch(console.error);
  }, 8000);

  setInterval(() => {
    checkForUpdates(false).catch(console.error);
  }, UPDATE_CHECK_INTERVAL_MS);
}

/**
 * Impede que duas instâncias sejam abertas ao mesmo tempo.
 */
const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    showMainWindow();
  });

  app.whenReady().then(async () => {
    try {
      enableAutoLaunch();

      if (!startedHidden) {
        createSplash();
      }

      createTray();

      await createMain();

      configureAutoUpdater();
    } catch (error) {
      console.error("Erro fatal ao iniciar o Nith ERP:", error);

      closeSplash();

      await dialog.showMessageBox({
        type: "error",
        title: "Erro ao iniciar o Nith ERP",
        message: "Não foi possível iniciar o aplicativo.",
        detail: error?.message || String(error),
      });

      isQuiting = true;
      app.quit();
    }
  });
}

app.on("activate", () => {
  showMainWindow();
});

app.on("before-quit", () => {
  isQuiting = true;
});

app.on("window-all-closed", () => {
  // O aplicativo permanece ativo na bandeja.
});