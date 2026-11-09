// Minimal stand-in for the "obsidian" package, which ships only type declarations.
export function sanitizeHTMLToDom(html: string): DocumentFragment {
  const template = document.createElement("template");
  template.innerHTML = html;
  return template.content;
}