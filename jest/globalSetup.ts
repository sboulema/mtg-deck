import { jest } from "@jest/globals";
import { TextEncoder, TextDecoder } from "util";
import { RequestOptions } from "../src/http";

// Mock http library to avoid using "obsidian" import
jest.mock('../src/http', () => {
  return {
    promiseWrappedRequest: (_options: RequestOptions): Promise<Record<string, never>> => Promise.resolve({})
  }
});

// ref: https://jestjs.io/docs/manual-mocks#mocking-methods-which-are-not-implemented-in-jsdom
// ref: https://github.com/jsdom/jsdom/issues/2524
Object.defineProperty(window, 'TextEncoder', {
  writable: true,
  value: TextEncoder
});

Object.defineProperty(window, 'TextDecoder', {
  writable: true,
  value: TextDecoder
});

// Obsidian globals for the main window (popout windows don't exist in tests).
Object.defineProperty(window, "activeDocument", {
  configurable: true,
  get: () => document,
});

Object.defineProperty(window, "activeWindow", {
  configurable: true,
  get: () => window,
});

// Minimal stand-ins for the helpers Obsidian adds to the DOM at runtime.
type ElInfo =
  | string
  | {
      cls?: string | string[];
      text?: string | DocumentFragment;
      attr?: Record<string, string | number | boolean | null>;
      title?: string;
      href?: string;
      type?: string;
      value?: string;
      placeholder?: string;
      prepend?: boolean;
    };

function buildEl(tag: string, info?: ElInfo): HTMLElement {
  const o = typeof info === "string" ? { cls: info } : info ?? {};
  const el = document.createElement(tag);

  if (o.cls) {
    el.className = Array.isArray(o.cls) ? o.cls.join(" ") : o.cls;
  }
  if (o.text !== undefined) {
    el.append(o.text);
  }
  if (o.attr) {
    Object.entries(o.attr).forEach(([key, value]) => {
      if (value !== null) {
        el.setAttribute(key, String(value));
      }
    });
  }
  if (o.title) {
    el.title = o.title;
  }
  if (o.href) {
    el.setAttribute("href", o.href);
  }
  if (o.type) {
    el.setAttribute("type", o.type);
  }
  if (o.value) {
    el.setAttribute("value", o.value);
  }
  if (o.placeholder) {
    el.setAttribute("placeholder", o.placeholder);
  }

  return el;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const nodeProto = Node.prototype as any;
const elementProto = HTMLElement.prototype as any;

nodeProto.createEl = function (
  tag: string,
  info?: ElInfo,
  callback?: (el: HTMLElement) => void
) {
  const el = buildEl(tag, info);
  const prepend = typeof info === "object" && info.prepend;

  if (prepend) {
    this.prepend(el);
  } else {
    this.appendChild(el);
  }

  callback?.(el);
  return el;
};

nodeProto.createDiv = function (info?: ElInfo, callback?: (el: HTMLElement) => void) {
  return this.createEl("div", info, callback);
};

nodeProto.createSpan = function (info?: ElInfo, callback?: (el: HTMLElement) => void) {
  return this.createEl("span", info, callback);
};

nodeProto.empty = function () {
  this.replaceChildren();
};

nodeProto.setText = function (text: string | DocumentFragment) {
  this.replaceChildren(text);
};

elementProto.addClass = function (...classes: string[]) {
  this.classList.add(...classes);
};

elementProto.removeClass = function (...classes: string[]) {
  this.classList.remove(...classes);
};

elementProto.toggleClass = function (cls: string | string[], value: boolean) {
  [cls].flat().forEach((c) => this.classList.toggle(c, value));
};

elementProto.hasClass = function (cls: string) {
  return this.classList.contains(cls);
};

elementProto.setCssProps = function (props: Record<string, string>) {
  Object.entries(props).forEach(([key, value]) => this.style.setProperty(key, value));
};
/* eslint-enable @typescript-eslint/no-explicit-any */