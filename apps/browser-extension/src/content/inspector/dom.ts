type Child = Node | string | null | undefined | false;

/** Builds an element with text children only; page data is never parsed as HTML. */
export function h<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  attributes: Record<string, string> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = doc.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    element.append(typeof child === "string" ? doc.createTextNode(child) : child);
  }
  return element;
}

export function place(element: HTMLElement, x: number, y: number, width?: number, height?: number): void {
  element.style.left = `${String(x)}px`;
  element.style.top = `${String(y)}px`;
  if (width !== undefined) element.style.width = `${String(width)}px`;
  if (height !== undefined) element.style.height = `${String(height)}px`;
}
