import type { Command } from "commander";
import {
  createSubagentWizard,
  listSubagentsWizard,
  editSubagentWizard,
  deleteSubagentWizard,
  duplicateSubagentWizard,
} from "../../commands/configure.subagent.js";
import {
  subagentVllmList,
  subagentVllmAdd,
  subagentVllmRemove,
  subagentVllmBind,
  subagentVllmUnbind,
} from "./subagent-vllm-cli.js";
import {
  exportSubagentToFile,
  importSubagentFromFileAndSave,
  getSubagentById,
} from "../../agents/subagent-manager.js";
import { logSuccess, logError } from "../../logger.js";

export function registerSubagentCli(program: Command): void {
  const subagent = program.command("subagent").description("子智能体管理");

  subagent
    .command("create")
    .description("创建新的子智能体")
    .action(async () => {
      await createSubagentWizard();
    });

  subagent
    .command("list")
    .description("列出所有子智能体")
    .action(async () => {
      await listSubagentsWizard();
    });

  subagent
    .command("edit")
    .description("编辑子智能体配置")
    .argument("<id>", "子智能体 ID")
    .action(async (id: string) => {
      await editSubagentWizard(id);
    });

  subagent
    .command("delete")
    .description("删除子智能体")
    .argument("<id>", "子智能体 ID")
    .action(async (id: string) => {
      await deleteSubagentWizard(id);
    });

  subagent
    .command("duplicate")
    .description("复制子智能体")
    .action(async () => {
      await duplicateSubagentWizard();
    });

  subagent
    .command("export")
    .description("导出子智能体配置到文件")
    .argument("<id>", "子智能体 ID")
    .argument("[file]", "输出文件路径", "./subagent-export.json")
    .action(async (id: string, file: string) => {
      const success = exportSubagentToFile(id, file);
      if (success) {
        logSuccess(`子智能体已导出到 ${file}`);
      } else {
        logError(`导出失败，子智能体 "${id}" 不存在`);
      }
    });

  subagent
    .command("import")
    .description("从文件导入子智能体配置")
    .argument("<file>", "导入文件路径")
    .option("-o, --overwrite", "覆盖已存在的子智能体")
    .action(async (file: string, options: { overwrite?: boolean }) => {
      const success = importSubagentFromFileAndSave(file, undefined, options.overwrite ?? false);
      if (success) {
        logSuccess(`子智能体已从 ${file} 导入`);
      } else {
        logError(`导入失败，请检查文件格式`);
      }
    });

  const vllm = subagent.command("vllm").description("管理 vLLM 模型配置");

  vllm
    .command("list")
    .description("列出可用 vLLM 模型")
    .action(async () => {
      await subagentVllmList();
    });

  vllm
    .command("add")
    .description("添加 vLLM 模型")
    .action(async () => {
      await subagentVllmAdd();
    });

  vllm
    .command("remove")
    .description("移除 vLLM 模型")
    .action(async () => {
      await subagentVllmRemove();
    });

  vllm
    .command("bind")
    .description("绑定子智能体到 vLLM 模型")
    .action(async () => {
      await subagentVllmBind();
    });

  vllm
    .command("unbind")
    .description("解绑子智能体与 vLLM 模型")
    .action(async () => {
      await subagentVllmUnbind();
    });
}
