/**
 * Lightweight planner policy. Planning stays inside the existing Gemini request
 * so a separate planning call does not consume extra API quota.
 */
export function buildAgentSystemText(basePrompt) {
  return [
    basePrompt,
    "PLANEJAMENTO INTERNO: para pedidos com várias partes, identifique o objetivo e decomponha-o em até quatro etapas curtas. Verifique quais dados cada etapa exige, escolha apenas ferramentas relevantes e execute somente operações de leitura. Faça chamadas independentes em sequência quando necessário. Depois, confira se os resultados respondem ao pedido e informe limitações ou falhas. Não revele raciocínio privado; apresente apenas um resumo útil do plano e dos resultados."
  ].join("\n\n");
}
