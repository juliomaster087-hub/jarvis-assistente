/**
 * Jarvis Intelligence Engine — allowlisted tools.
 * Gemini can request only these named functions; this module validates every argument.
 */
const stringArg = (value, max = 120) => typeof value === "string" && value.trim().length > 0 && value.trim().length <= max;

export const TOOL_DECLARATIONS = [
  { name: "search_web", description: "Pesquisa um assunto em fontes abertas usando as integrações gratuitas já existentes (GDELT e Wikipédia). Use para perguntas que exigem pesquisa ou comparação baseada em fontes.", parameters: { type: "OBJECT", properties: { query: { type: "STRING", description: "Assunto da pesquisa, sem instruções extras." } }, required: ["query"] } },
  { name: "search_news", description: "Busca notícias recentes sobre um assunto usando a API pública GDELT.", parameters: { type: "OBJECT", properties: { query: { type: "STRING", description: "Tema das notícias." } }, required: ["query"] } },
  { name: "search_wikipedia", description: "Pesquisa verbetes na Wikipédia em português.", parameters: { type: "OBJECT", properties: { query: { type: "STRING", description: "Tema ou verbete." } }, required: ["query"] } },
  { name: "get_weather", description: "Consulta clima atual e previsão de três dias para uma cidade.", parameters: { type: "OBJECT", properties: { city: { type: "STRING", description: "Cidade e estado ou país." } }, required: ["city"] } },
  { name: "search_places", description: "Encontra estabelecimentos no OpenStreetMap para uma categoria e cidade.", parameters: { type: "OBJECT", properties: { category: { type: "STRING", description: "Categoria, como restaurantes, farmácias ou supermercados." }, city: { type: "STRING", description: "Cidade e estado ou país." } }, required: ["category", "city"] } },
  { name: "convert_currency", description: "Converte moedas usando taxas de referência diárias da Frankfurter.", parameters: { type: "OBJECT", properties: { amount: { type: "NUMBER", description: "Valor positivo a converter." }, from: { type: "STRING", description: "Código ISO 4217 da moeda de origem, por exemplo BRL." }, to: { type: "STRING", description: "Código ISO 4217 da moeda de destino, por exemplo USD." } }, required: ["amount", "from", "to"] } },
  { name: "find_images", description: "Busca até duas imagens relevantes no Wikimedia Commons. Use quando imagens ajudarem a explicar o assunto ou quando o usuário pedir imagens.", parameters: { type: "OBJECT", properties: { query: { type: "STRING", description: "Assunto visual curto." } }, required: ["query"] } }
];

function validateArgs(name, args) {
  if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("Parâmetros inválidos.");
  switch (name) {
    case "search_web":
    case "search_news":
    case "search_wikipedia":
    case "find_images":
      if (!stringArg(args.query, 140)) throw new Error("Informe uma consulta de até 140 caracteres.");
      return { query: args.query.trim() };
    case "get_weather":
      if (!stringArg(args.city, 100)) throw new Error("Informe uma cidade válida.");
      return { city: args.city.trim() };
    case "search_places":
      if (!stringArg(args.category, 60) || !stringArg(args.city, 100)) throw new Error("Informe categoria e cidade.");
      return { category: args.category.trim(), city: args.city.trim() };
    case "convert_currency": {
      const amount = Number(args.amount);
      const from = String(args.from || "").toUpperCase();
      const to = String(args.to || "").toUpperCase();
      if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000000 || !/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) throw new Error("Valor ou códigos de moeda inválidos.");
      return { amount, from, to };
    }
    default: throw new Error("Ferramenta não autorizada.");
  }
}

function compactResult(value, maxChars = 9000) {
  const json = JSON.stringify(value ?? null);
  if (json.length <= maxChars) return value;
  return { truncated: true, preview: json.slice(0, maxChars), note: "Resultado reduzido para respeitar o limite de contexto." };
}

export async function executeAgentTool(name, rawArgs, deps) {
  const args = validateArgs(name, rawArgs);
  let result;
  switch (name) {
    case "search_web":
      result = await deps.runManualResearch("pesquise na internet sobre " + args.query);
      if (!result) throw new Error("A pesquisa não retornou resultados.");
      break;
    case "search_news": result = await deps.newsTool(args.query); break;
    case "search_wikipedia": result = await deps.wikipediaTool(args.query); break;
    case "get_weather": result = await deps.weatherTool(args.city); break;
    case "search_places": result = await deps.placesTool(args.category, args.city); break;
    case "convert_currency": result = await deps.currencyTool(args.amount, args.from, args.to); break;
    case "find_images":
      result = { tool: "Wikimedia Commons", query: args.query, images: (await deps.searchCommonsImages(args.query)).slice(0, 2) };
      break;
    default: throw new Error("Ferramenta não autorizada.");
  }
  return compactResult(result);
}
