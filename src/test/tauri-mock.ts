import { vi } from "vitest";

// Mock @tauri-apps/api/core
const invokeHandlers = new Map<string, (...args: unknown[]) => unknown>();

export const mockInvoke = vi.fn(
  (command: string, args?: Record<string, unknown>) => {
    const handler = invokeHandlers.get(command);
    if (handler) {
      try {
        return Promise.resolve(handler(args));
      } catch (err) {
        return Promise.reject(err);
      }
    }
    return Promise.reject(`No mock for command: ${command}`);
  }
);

export function onInvoke(
  command: string,
  handler: (...args: unknown[]) => unknown
) {
  invokeHandlers.set(command, handler);
}

export function clearInvokeHandlers() {
  invokeHandlers.clear();
  mockInvoke.mockClear();
}

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mockInvoke,
}));

vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: vi.fn(() => ({
    onDragDropEvent: vi.fn().mockResolvedValue(vi.fn()),
  })),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(() => ({
    listen: vi.fn().mockResolvedValue(vi.fn()),
  })),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: vi.fn(),
  open: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  writeTextFile: vi.fn(),
  readTextFile: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-notification", () => ({
  isPermissionGranted: vi.fn().mockResolvedValue(true),
  requestPermission: vi.fn().mockResolvedValue("granted"),
  sendNotification: vi.fn(),
}));
