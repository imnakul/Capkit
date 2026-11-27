import { StrictMode, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { Popup, type LoadShortcuts, type RequestPermission, type Transport } from "./Popup";
import "./popup.css";
import { readAccent } from "../accent";
import { fontFaceCss } from "../fonts";

const transport: Transport = (request) => chrome.runtime.sendMessage(request);
// Must run inside the click handler: Chrome only shows the prompt during a user gesture.
const requestPermission: RequestPermission = (origins) => chrome.permissions.request({ origins });
const loadShortcuts: LoadShortcuts = async () => {
  const commands = await chrome.commands.getAll();
  return new Map(commands.flatMap((command) => (command.name === undefined || command.shortcut === undefined ? [] : [[command.name, command.shortcut] as const])));
};

const fonts = document.createElement("style");
fonts.textContent = fontFaceCss((path) => chrome.runtime.getURL(path));
document.head.append(fonts);
void readAccent().then((accent) => {
  document.documentElement.style.setProperty("--capkit-accent", accent);
});
const container = document.getElementById("root");
if (container !== null) {
  const app: ReactElement = (
    <StrictMode>
      <Popup send={transport} requestPermission={requestPermission} loadShortcuts={loadShortcuts} />
    </StrictMode>
  );
  createRoot(container).render(app);
}
