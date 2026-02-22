import { createContext } from "@lit/context";

export type PrivacyState = {
  streamMode: boolean;
};

export const privacyContext = createContext<PrivacyState>("dashboard-privacy");

const STORAGE_KEY = "claw-dash:stream-mode";

export class PrivacyService extends EventTarget {
  private _streamMode = false;

  get streamMode(): boolean {
    return this._streamMode;
  }

  constructor() {
    super();
    try {
      this._streamMode = localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      /* SSR / restricted storage */
    }
  }

  toggle(): void {
    this._streamMode = !this._streamMode;
    this._persist();
    this.dispatchEvent(new Event("change"));
  }

  set(on: boolean): void {
    if (this._streamMode === on) {
      return;
    }
    this._streamMode = on;
    this._persist();
    this.dispatchEvent(new Event("change"));
  }

  private _persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, String(this._streamMode));
    } catch {
      /* SSR / restricted storage */
    }
  }
}

export const privacyService = new PrivacyService();
