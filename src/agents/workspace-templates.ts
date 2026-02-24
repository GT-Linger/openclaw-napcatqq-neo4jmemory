import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveOpenClawPackageRoot } from "../infra/openclaw-root.js";
import { getLocale } from "../i18n/index.js";
import { pathExists } from "../utils.js";

const FALLBACK_TEMPLATE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../docs/reference/templates",
);

const ZH_CN_TEMPLATE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../docs/zh-CN/reference/templates",
);

function getLanguageTemplateDirs(baseDir: string): string[] {
  const locale = getLocale();
  const isZhCN = locale === "zh-CN" || locale === "zh-TW";

  const dirs: string[] = [];

  if (isZhCN) {
    dirs.push(path.join(baseDir, locale, "templates"));
  }

  dirs.push(path.join(baseDir, "templates"));

  return dirs;
}

let cachedTemplateDir: string | undefined;
let resolvingTemplateDir: Promise<string> | undefined;

export async function resolveWorkspaceTemplateDir(opts?: {
  cwd?: string;
  argv1?: string;
  moduleUrl?: string;
}): Promise<string> {
  if (cachedTemplateDir) {
    return cachedTemplateDir;
  }
  if (resolvingTemplateDir) {
    return resolvingTemplateDir;
  }

  resolvingTemplateDir = (async () => {
    const moduleUrl = opts?.moduleUrl ?? import.meta.url;
    const argv1 = opts?.argv1 ?? process.argv[1];
    const cwd = opts?.cwd ?? process.cwd();

    const packageRoot = await resolveOpenClawPackageRoot({ moduleUrl, argv1, cwd });

    const baseDirs: (string | null)[] = [];
    if (packageRoot) {
      baseDirs.push(packageRoot);
    }
    if (cwd) {
      baseDirs.push(cwd);
    }
    baseDirs.push(
      path.dirname(fileURLToPath(import.meta.url)),
    );

    const candidates: string[] = [];

    for (const baseDir of baseDirs.filter(Boolean) as string[]) {
      if (!baseDir) continue;

      const langDirs = getLanguageTemplateDirs(baseDir);
      candidates.push(...langDirs);
    }

    candidates.push(FALLBACK_TEMPLATE_DIR);
    candidates.push(ZH_CN_TEMPLATE_DIR);

    for (const candidate of candidates) {
      if (await pathExists(candidate)) {
        cachedTemplateDir = candidate;
        return candidate;
      }
    }

    cachedTemplateDir = FALLBACK_TEMPLATE_DIR;
    return cachedTemplateDir;
  })();

  try {
    return await resolvingTemplateDir;
  } finally {
    resolvingTemplateDir = undefined;
  }
}

export function resetWorkspaceTemplateDirCache() {
  cachedTemplateDir = undefined;
  resolvingTemplateDir = undefined;
}
