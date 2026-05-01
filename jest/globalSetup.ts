import { jest } from "@jest/globals";
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