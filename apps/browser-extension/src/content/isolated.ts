import { PROTOCOL_VERSION } from "@snaphub/devtools-protocol/protocol";
import { pageRequestSchema, type PageResponse } from "../messages";
import { handlePageRequest } from "./handlers";
import { InspectorController } from "./inspector/controller";
import { resolveComponentData } from "./mainClient";
import { PickerController } from "./picker/controller";
import { ProbeController } from "./probe/controller";
import { runTool } from "./tools";

declare global {
  var __capkitInspector: number | undefined;
}

/** A second injection of the same protocol version is a no-op. */
if (globalThis.__capkitInspector !== PROTOCOL_VERSION) {
  globalThis.__capkitInspector = PROTOCOL_VERSION;
  const controllers = {
    inspect: new InspectorController(document),
    pick: new PickerController(document),
    font: new ProbeController("font", document),
    color: new ProbeController("color", document),
  };

  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse: (response: PageResponse) => void) => {
    const parsed = pageRequestSchema.safeParse(message);
    if (!parsed.success) return false;
    const request = parsed.data;
    if (request.kind === "tool") {
      runTool(controllers, request.tool, request.action);
      sendResponse({ kind: "ok" });
      return false;
    }
    void handlePageRequest({ window, document, resolve: resolveComponentData }, request)
      .then(sendResponse)
      .catch(() => {
        sendResponse({ kind: "ok" });
      });
    return true;
  });
}
