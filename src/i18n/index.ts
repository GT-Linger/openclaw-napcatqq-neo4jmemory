import type { Locale, TranslationMap } from "./types.js";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

type Subscriber = (locale: Locale) => void;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LOCALE_DIR = "locales/cli";

function getBundledTranslations(locale: Locale): TranslationMap {
  try {
    const localeFile = resolve(__dirname, "..", LOCALE_DIR, `${locale}.json`);
    if (existsSync(localeFile)) {
      const content = readFileSync(localeFile, "utf-8");
      return JSON.parse(content);
    }
  } catch {
    // Ignore errors
  }
  return {};
}

function detectSystemLocale(): Locale {
  const envLocale =
    process.env.LC_ALL ||
    process.env.LC_MESSAGES ||
    process.env.LANG ||
    process.env.LANGUAGE;

  if (!envLocale) {
    return "en";
  }

  const normalized = envLocale.split(".")[0].replace("_", "-");

  if (normalized.startsWith("zh-CN") || normalized === "zh" || normalized.startsWith("zh_Hans")) {
    return "zh-CN";
  }
  if (normalized.startsWith("zh-TW") || normalized.startsWith("zh_Hant") || normalized === "zh-HK") {
    return "zh-TW";
  }
  if (normalized.startsWith("pt") || normalized === "pt_BR") {
    return "pt-BR";
  }

  return "en";
}

function loadUserLocalePreference(): Locale | null {
  try {
    const configPath = resolve(homedir(), ".config", "openclaw", "locale.json");
    if (existsSync(configPath)) {
      const content = readFileSync(configPath, "utf-8");
      const parsed = JSON.parse(content);
      if (parsed.locale && isSupportedLocale(parsed.locale)) {
        return parsed.locale;
      }
    }
  } catch {
    // Ignore errors
  }
  return null;
}

export const SUPPORTED_LOCALES: ReadonlyArray<Locale> = ["en", "zh-CN", "zh-TW", "pt-BR"];

export function isSupportedLocale(value: string | null | undefined): value is Locale {
  return value !== null && value !== undefined && SUPPORTED_LOCALES.includes(value as Locale);
}

class CliI18nManager {
  private locale: Locale;
  private translations: Record<Locale, TranslationMap> = {} as Record<Locale, TranslationMap>;
  private subscribers: Set<Subscriber> = new Set();
  private initialized = false;

  constructor() {
    const userPref = loadUserLocalePreference();
    this.locale = userPref ?? detectSystemLocale();
  }

  private ensureInitialized(): void {
    if (this.initialized) {
      return;
    }
    this.translations["en"] = getBundledTranslations("en");
    if (this.locale !== "en") {
      this.translations[this.locale] = getBundledTranslations(this.locale);
    }
    this.initialized = true;
  }

  public getLocale(): Locale {
    return this.locale;
  }

  public setLocale(locale: Locale): void {
    if (this.locale === locale) {
      return;
    }
    this.locale = locale;
    if (!this.translations[locale]) {
      this.translations[locale] = getBundledTranslations(locale);
    }
    this.notify();
  }

  public subscribe(sub: Subscriber): () => void {
    this.subscribers.add(sub);
    return () => this.subscribers.delete(sub);
  }

  private notify(): void {
    this.subscribers.forEach((sub) => sub(this.locale));
  }

  public t(key: string, params?: Record<string, string>): string {
    this.ensureInitialized();

    const keys = key.split(".");
    let value: unknown = this.translations[this.locale] || this.translations["en"];

    for (const k of keys) {
      if (value && typeof value === "object") {
        value = (value as Record<string, unknown>)[k];
      } else {
        value = undefined;
        break;
      }
    }

    if (value === undefined && this.locale !== "en") {
      value = this.translations["en"];
      for (const k of keys) {
        if (value && typeof value === "object") {
          value = (value as Record<string, unknown>)[k];
        } else {
          value = undefined;
          break;
        }
      }
    }

    if (typeof value !== "string") {
      return key;
    }

    if (params) {
      return value.replace(/\{(\w+)\}/g, (_, k) => params[k] || `{${k}}`);
    }

    return value;
  }

  public has(key: string): boolean {
    this.ensureInitialized();
    const keys = key.split(".");
    let value: unknown = this.translations[this.locale];
    for (const k of keys) {
      if (value && typeof value === "object") {
        value = (value as Record<string, unknown>)[k];
      } else {
        return false;
      }
    }
    return typeof value === "string";
  }
}

export const i18n = new CliI18nManager();
export const t = (key: string, params?: Record<string, string>) => i18n.t(key, params);
export const getLocale = () => i18n.getLocale();
export const setLocale = (locale: Locale) => i18n.setLocale(locale);
