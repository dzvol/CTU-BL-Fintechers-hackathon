import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
Object.defineProperty(window, 'scrollTo', { value: () => {}, writable: true });
window.HTMLElement.prototype.scrollIntoView = () => {};
