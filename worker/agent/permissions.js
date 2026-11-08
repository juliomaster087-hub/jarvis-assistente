/**
 * Explicit permission boundary for the current agent.
 * Only read-only tools are enabled. No external write or destructive actions exist.
 */
const TOOL_POLICY = Object.freeze({
  search_web: "read",
  search_news: "read",
  search_wikipedia: "read",
  get_weather: "read",
  search_places: "read",
  convert_currency: "read",
  find_images: "read"
});

export function isToolAllowed(name, requiredPermission = "read") {
  return TOOL_POLICY[name] === requiredPermission && requiredPermission === "read";
}

export function getToolPermission(name) {
  return TOOL_POLICY[name] || null;
}
