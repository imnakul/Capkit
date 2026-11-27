import type { ElementDetails, HitElement } from "@snaphub/devtools-protocol/protocol";
import { computeScale, rectsIntersect, toCssPoint, toCssRect, toViewportRect, type CssRect, type Scale } from "../geometry";
import type { PageRequest, PageResponse } from "../messages";
import { describeElement, rectOf, type ComponentData } from "./dom";
import { hitElements } from "./hitTest";
import type { ComponentResolver } from "./mainClient";
import { findSensitiveInArea } from "./findSensitive";

const MAX_AREA_ELEMENTS = 20;
const MIN_AREA_ELEMENT_CSS_PX = 6;
const CONTAINMENT_SLOP_CSS_PX = 4;

type Env = { window: Window; document: Document; resolve: ComponentResolver };

const NO_DATA: ComponentData = { component: null, source: null };

function guard(env: Env, viewport: { x: number; y: number; width: number; height: number }): Scale | null {
  return computeScale(viewport, env.window.innerWidth, env.window.innerHeight);
}

/** Elements fully inside the area, largest first, without same-rect duplicates. */
export function elementsInArea(doc: Document, area: CssRect): Element[] {
  const picked: { element: Element; rect: CssRect }[] = [];
  for (const element of doc.body.querySelectorAll("*")) {
    const rect = rectOf(element);
    if (rect.width < MIN_AREA_ELEMENT_CSS_PX || rect.height < MIN_AREA_ELEMENT_CSS_PX) continue;
    if (!rectsIntersect(rect, area)) continue;
    const inside =
      rect.x >= area.x - CONTAINMENT_SLOP_CSS_PX &&
      rect.y >= area.y - CONTAINMENT_SLOP_CSS_PX &&
      rect.x + rect.width <= area.x + area.width + CONTAINMENT_SLOP_CSS_PX &&
      rect.y + rect.height <= area.y + area.height + CONTAINMENT_SLOP_CSS_PX;
    if (!inside) continue;
    const parent = picked[picked.length - 1];
    if (
      parent !== undefined &&
      Math.abs(parent.rect.width - rect.width) <= 1 &&
      Math.abs(parent.rect.height - rect.height) <= 1 &&
      parent.element.contains(element)
    ) {
      picked.pop();
    }
    picked.push({ element, rect });
  }
  return picked
    .sort((a, b) => b.rect.width * b.rect.height - a.rect.width * a.rect.height)
    .slice(0, MAX_AREA_ELEMENTS)
    .map((entry) => entry.element);
}

async function details(env: Env, element: Element, scale: Scale): Promise<ElementDetails> {
  const data = await env.resolve(element).catch(() => NO_DATA);
  return describeElement(element, toViewportRect(rectOf(element), scale), data);
}

export function handlePageRequest(env: Env, request: PageRequest): Promise<PageResponse> {
  switch (request.kind) {
    case "hitTest": {
      const scale = guard(env, request.viewport);
      if (scale === null) return Promise.resolve({ kind: "hitTest", status: "mismatch", elements: [] });
      const css = toCssPoint(request.point, scale);
      const elements: HitElement[] = hitElements(env.document, css, scale, () => null);
      return Promise.resolve({ kind: "hitTest", status: "ok", elements });
    }
    case "inspect": {
      const scale = guard(env, request.viewport);
      if (scale === null) return Promise.resolve({ kind: "inspect", status: "mismatch", elements: [] });
      return (async (): Promise<PageResponse> => {
        const targets: Element[] = [];
        if (request.point !== undefined) {
          const css = toCssPoint(request.point, scale);
          const first = env.document.elementFromPoint(css.x, css.y);
          if (first !== null) targets.push(first);
        } else if (request.area !== undefined) {
          targets.push(...elementsInArea(env.document, toCssRect(request.area, scale)));
        }
        const elements = await Promise.all(targets.map((element) => details(env, element, scale)));
        return {
          kind: "inspect",
          status: "ok",
          cssViewport: {
            width: env.window.innerWidth,
            height: env.window.innerHeight,
            devicePixelRatio: env.window.devicePixelRatio,
          },
          elements,
        };
      })();
    }
    case "findSensitive": {
      const scale = guard(env, request.viewport);
      if (scale === null) return Promise.resolve({ kind: "findSensitive", status: "mismatch", matches: [] });
      const matches = findSensitiveInArea(env.document, toCssRect(request.area, scale), scale);
      return Promise.resolve({ kind: "findSensitive", status: "ok", matches });
    }
    case "tool":
    case "ping":
      return Promise.resolve({ kind: "ok" });
  }
}
