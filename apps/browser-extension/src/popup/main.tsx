import { StrictMode, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { Popup, type Transport } from "./Popup";
import "./popup.css";

const transport: Transport = (request) => chrome.runtime.sendMessage(request);

function registerFonts(): void {
  const url = (file: string): string => chrome.runtime.getURL(`fonts/${file}`);
  const style = document.createElement("style");
  style.textContent = [
    `@font-face{font-family:"CapKit Sans";src:url("${url("plus-jakarta-sans-latin-wght-normal.woff2")}") format("woff2");font-weight:200 800}`,
    `@font-face{font-family:"CapKit Mono";src:url("${url("jetbrains-mono-latin-wght-normal.woff2")}") format("woff2");font-weight:100 800}`,
  ].join("");
  document.head.append(style);
}

registerFonts();
const container = document.getElementById("root");
if (container !== null) {
  const app: ReactElement = (
    <StrictMode>
      <Popup send={transport} />
    </StrictMode>
  );
  createRoot(container).render(app);
}
