import { buildAgentSystemText } from "./planner.js";

/**
 * Bounded Gemini Function Calling loop.
 * All tool execution stays inside the Worker and is restricted to an allowlist.
 */
function extractParts(result) {
  return result?.candidates?.[0]?.content?.parts || [];
}
function textFromParts(parts) {
  return parts.map(part => typeof part.text === "string" ? part.text : "").join("").trim();
}
function safeJson(value, max = 10000) {
  const encoded = JSON.stringify(value ?? null);
  if (encoded.length <= max) return value;
  return { truncated: true, preview: encoded.slice(0, max) };
}

async function callGemini(endpoint, apiKey, payload) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error?.message || "O provedor Gemini recusou a solicitação.");
    error.status = response.status === 429 ? 429 : 502;
    throw error;
  }
  return data;
}

export async function runAgentLoop({ endpoint, apiKey, contents, systemText, model, declarations, executeTool, disableTools = false }) {
  const workingContents = contents.map(item => ({ ...item, parts: [...(item.parts || [])] }));
  const steps = [];
  let totalToolCalls = 0;
  let rounds = 0;
  let finalReply = "";
  const maxRounds = disableTools ? 0 : 2;
  const maxToolCalls = 4;
  const agentSystemText = buildAgentSystemText(systemText);

  for (let round = 0; round < maxRounds; round++) {
    rounds++;
    const payload = {
      systemInstruction: { parts: [{ text: agentSystemText }] },
      contents: workingContents,
      generationConfig: { maxOutputTokens: 900 },
      tools: [{ functionDeclarations: declarations }]
    };
    const lastResult = await callGemini(endpoint, apiKey, payload);
    const candidate = lastResult?.candidates?.[0]?.content;
    const parts = extractParts(lastResult);
    const calls = parts.filter(part => part?.functionCall && typeof part.functionCall.name === "string");
    if (!calls.length) {
      finalReply = textFromParts(parts);
      break;
    }

    workingContents.push(candidate);
    const responses = [];
    for (const part of calls) {
      if (totalToolCalls >= maxToolCalls) {
        responses.push({ functionResponse: { name: part.functionCall.name, response: { error: "Limite de ferramentas desta mensagem atingido." }, ...(part.functionCall.id ? { id: part.functionCall.id } : {}) } });
        continue;
      }
      const name = part.functionCall.name;
      const args = part.functionCall.args || {};
      totalToolCalls++;
      const step = { sequence: totalToolCalls, tool: name, arguments: safeJson(args, 1500), status: "success", result: null };
      try {
        const value = await executeTool(name, args);
        step.result = safeJson(value, 7000);
        responses.push({ functionResponse: { name, response: { result: step.result }, ...(part.functionCall.id ? { id: part.functionCall.id } : {}) } });
      } catch (error) {
        step.status = "error";
        step.result = { error: String(error?.message || "Falha na ferramenta.").slice(0, 300) };
        responses.push({ functionResponse: { name, response: step.result, ...(part.functionCall.id ? { id: part.functionCall.id } : {}) } });
      }
      steps.push(step);
    }
    workingContents.push({ role: "user", parts: responses });
    if (totalToolCalls >= maxToolCalls) break;
  }

  if (!finalReply) {
    const finalPayload = {
      systemInstruction: { parts: [{ text: agentSystemText + "\n\nFinalize a resposta com os resultados das ferramentas. Não solicite novas ferramentas. Se algo falhou, informe claramente." }] },
      contents: workingContents,
      generationConfig: { maxOutputTokens: 900 }
    };
    const finalResult = await callGemini(endpoint, apiKey, finalPayload);
    finalReply = textFromParts(extractParts(finalResult));
  }
  if (!finalReply) throw new Error("A IA não retornou uma resposta final.");
  return { reply: finalReply, steps, rounds, toolCalls: totalToolCalls };
}
