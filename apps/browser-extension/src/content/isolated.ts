import { pageRequestSchema, type PageResponse } from "../messages";
import { handlePageRequest } from "./handlers";
import { replaceInstance, type Dispose } from "./instance";
import { InspectorController } from "./inspector/controller";
import { resolveComponentData } from "./mainClient";
import { PickerController } from "./picker/controller";
import { ProbeController } from "./probe/controller";
import { runTool } from "./tools";

function install(): Dispose {
  const controllers = {
    inspect: new InspectorController(document),
    pick: new PickerController(document),
    font: new ProbeController("font", document),
    color: new ProbeController("color", document),
  };

  const listener = (message: unknown, _sender: chrome.runtime.MessageSender, sendResponse: (response: PageResponse) => void): boolean => {
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
  };
  chrome.runtime.onMessage.addListener(listener);

  return (): void => {
    for (const controller of Object.values(controllers)) controller.stop();
    chrome.runtime.onMessage.removeListener(listener);
  };
}

replaceInstance(install);
