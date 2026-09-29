import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/env";
import { buildPrompt, MINUTES_TOOL, normalizeOutput, SYSTEM_PROMPT, type Person, type ProjectRef } from "./extract";

/** Chiama Claude con uno strumento obbligatorio: la risposta è sempre JSON strutturato. */
export async function writeMinutes(input: {
  title: string;
  heldAt: Date;
  transcript: string;
  people: Person[];
  projects: ProjectRef[];
  defaultProjectId: string | null;
}) {
  const e = env();
  if (!e.ANTHROPIC_API_KEY) throw new Error("AI non configurata (ANTHROPIC_API_KEY).");
  const client = new Anthropic({ apiKey: e.ANTHROPIC_API_KEY, timeout: 180_000, maxRetries: 2 });
  const res = await client.messages.create({
    model: e.ANTHROPIC_MODEL,
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    tools: [MINUTES_TOOL],
    tool_choice: { type: "tool", name: MINUTES_TOOL.name },
    messages: [{ role: "user", content: buildPrompt(input) }],
  });
  const call = res.content.find((b) => b.type === "tool_use");
  if (!call || call.type !== "tool_use") throw new Error("L'AI non ha restituito il verbale. Riprova.");
  return normalizeOutput(call.input, input);
}
