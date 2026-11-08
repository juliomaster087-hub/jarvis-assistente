import test from "node:test";
import assert from "node:assert/strict";
import { TOOL_DECLARATIONS, executeAgentTool } from "./tools.js";
import { runAgentLoop } from "./engine.js";

test("registry exposes only the expected read-only tools", () => {
  const names = TOOL_DECLARATIONS.map(tool => tool.name);
  assert.deepEqual(names, ["search_web", "search_news", "search_wikipedia", "get_weather", "search_places", "convert_currency", "find_images"]);
  assert.equal(new Set(names).size, names.length);
});

test("tool arguments are validated before execution", async () => {
  let called = false;
  await assert.rejects(
    executeAgentTool("get_weather", { city: "" }, { weatherTool: async () => { called = true; } }),
    /cidade válida/
  );
  await assert.rejects(
    executeAgentTool("unknown_tool", {}, {}),
    /não autorizada/
  );
  assert.equal(called, false);
});

test("tool registry invokes the selected existing integration", async () => {
  const result = await executeAgentTool("get_weather", { city: "São Paulo, SP" }, {
    weatherTool: async city => ({ place: city, current: { temperature_2m: 23 } })
  });
  assert.equal(result.place, "São Paulo, SP");
});

test("agent loop calls an allowlisted tool and returns a final Gemini answer", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  let invoked = 0;
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    requests.push(body);
    if (requests.length === 1) {
      return new Response(JSON.stringify({
        candidates: [{ content: { role: "model", parts: [{ functionCall: { name: "get_weather", args: { city: "São Paulo" }, id: "call-1" } }] } }]
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({
      candidates: [{ content: { role: "model", parts: [{ text: "Em São Paulo, a temperatura é de 23 °C." }] } }]
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    const result = await runAgentLoop({
      endpoint: "https://example.invalid/generateContent",
      apiKey: "test-key",
      model: "test-model",
      contents: [{ role: "user", parts: [{ text: "Como está o clima?" }] }],
      systemText: "Você é Jarvis.",
      declarations: [{ name: "get_weather", parameters: { type: "OBJECT" } }],
      executeTool: async (name, args) => {
        assert.equal(name, "get_weather");
        assert.equal(args.city, "São Paulo");
        invoked++;
        return { current: { temperature_2m: 23 } };
      }
    });
    assert.equal(result.toolCalls, 1);
    assert.equal(result.steps[0].status, "success");
    assert.match(result.reply, /23 °C/);
    assert.equal(invoked, 1);
    assert.equal(requests.length, 2);
    assert.ok(requests[0].tools);
    assert.equal(requests[1].contents.at(-1).parts[0].functionResponse.name, "get_weather");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("agent loop disables tools when requested", async () => {
  const originalFetch = globalThis.fetch;
  let body;
  globalThis.fetch = async (_url, options) => {
    body = JSON.parse(options.body);
    return new Response(JSON.stringify({
      candidates: [{ content: { role: "model", parts: [{ text: "Olá!" }] } }]
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    const result = await runAgentLoop({
      endpoint: "https://example.invalid/generateContent",
      apiKey: "test-key",
      contents: [{ role: "user", parts: [{ text: "Oi" }] }],
      systemText: "Você é Jarvis.",
      declarations: [{ name: "never_called" }],
      disableTools: true,
      executeTool: async () => { throw new Error("não deveria executar"); }
    });
    assert.equal(result.reply, "Olá!");
    assert.equal(result.toolCalls, 0);
    assert.equal(body.tools, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
