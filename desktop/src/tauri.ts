type EventEnvelope<T> = { event: string; payload: T };
type TauriApi = {
  core: { invoke: <T>(command: string, args?: Record<string, unknown>) => Promise<T> };
  event: { listen: <T>(event: string, handler: (message: EventEnvelope<T>) => void) => Promise<() => void> };
};

declare global {
  interface Window { __TAURI__?: TauriApi }
}

function tauri(): TauriApi {
  if (!window.__TAURI__) throw new Error("The desktop runtime is unavailable.");
  return window.__TAURI__;
}

export function invoke<T>(command: string, args?: Record<string, unknown>) {
  return tauri().core.invoke<T>(command, args);
}

export function listen<T>(event: string, handler: (payload: T) => void) {
  return tauri().event.listen<T>(event, (message) => handler(message.payload));
}
