import type { AiPlan } from "@/lib/ai/access";

export interface AiToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface AiToolAccessPolicy {
  plan: AiPlan;
}

export interface AiToolExecutionSuccess {
  ok: true;
  data: Record<string, unknown>;
}

export interface AiToolExecutionFailure {
  ok: false;
  error: string;
  suggestions?: string[];
}

export type AiToolExecutionResult = AiToolExecutionSuccess | AiToolExecutionFailure;

export interface AiTool extends AiToolDefinition {
  execute: (input: unknown, access: AiToolAccessPolicy) => Promise<AiToolExecutionResult>;
}
