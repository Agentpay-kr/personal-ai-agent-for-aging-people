import { defineAgent } from 'eve';
export default defineAgent({
  defaultTools: false,
  model: process.env.MOLLA_MODEL || 'anthropic/claude-sonnet-4.5',
  limits: {
    sessionUsage: ({ window }) => window.inputTokens - window.cacheReadTokens >= 30000 || window.outputTokens >= 6000 || (window.costUsd ?? 0) >= 0.5,
    sessionTimeoutMs: 60 * 60 * 1000,
  },
});
