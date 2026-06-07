// Centralized agent runtime constants. Keep model-id changes to a single edit.
import { env } from "../config/env";

export const AGENT_MODEL = env.ANTHROPIC_MODEL; // CON-stack-agent-runtime
export const AGENT_MAX_TOKENS_DEFAULT = 4096;
export const AGENT_MAX_ITERATIONS_DEFAULT = 8;
