// Manual API smoke test: JARVIS_API_URL=https://... node worker/test-api.mjs
import assert from "node:assert/strict";
const base = (process.env.JARVIS_API_URL || "").replace(/\/$/, "");
if (!base.startsWith("https://")) throw new Error("Defina JARVIS_API_URL com a URL HTTPS do Worker.");
const email = `jarvis-smoke-${Date.now()}@example.com`;
const password = "Jarvis-Test-Password-2026!";
const post = async (path, body, token) => {
  const response = await fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
    body: JSON.stringify(body)
  });
  return { response, data: await response.json() };
};
const health = await fetch(base + "/health");
assert.equal(health.status, 200, "health endpoint");
const denied = await fetch(base + "/api/me");
assert.equal(denied.status, 405, "GET /api/me without token should not disclose profile");
const registered = await post("/api/register", { name: "Smoke Test", email, password });
assert.equal(registered.response.status, 201, JSON.stringify(registered.data));
const token = registered.data.token;
assert.ok(token, "registration returns session token");
const me = await fetch(base + "/api/me", { headers: { Authorization: "Bearer " + token } });
assert.equal(me.status, 200, "authenticated profile");
assert.equal((await me.json()).user.email, email);
const chatWithoutAuth = await post("/api/chat", { messages: [{ role: "user", content: "oi" }] });
assert.equal(chatWithoutAuth.response.status, 401, "chat requires authentication");
const login = await post("/api/login", { email, password });
assert.equal(login.response.status, 200, "login");
const logout = await post("/api/logout", {}, login.data.token);
assert.equal(logout.response.status, 200, "logout");
console.log("Jarvis auth smoke test passed. Remove the synthetic user from D1 after the test if desired:", email);
