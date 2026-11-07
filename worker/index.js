/**
 * Jarvis API — Cloudflare Worker
 * Multi-user authentication + Gemini chat. D1 stores users and hashed sessions.
 */
const MODEL = "gemini-3.5-flash-lite";
const MAX_MESSAGES = 10;
const MAX_MESSAGE_CHARS = 4000;
const SESSION_TTL = 60 * 60 * 12;
const PBKDF2_ITERATIONS = 310000;

function corsHeaders(origin, allowedOrigin) {
  return {
    "Access-Control-Allow-Origin": origin === allowedOrigin ? origin : allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin"
  };
}
function json(data, status, cors) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...cors } });
}
function randomHex(bytes = 32) {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(data, b => b.toString(16).padStart(2, "0")).join("");
}
async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}
async function passwordHash(password, salt = randomHex(16)) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: new TextEncoder().encode(salt), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" }, material, 256);
  const hash = btoa(String.fromCharCode(...new Uint8Array(bits)));
  return { salt, hash: "pbkdf2$" + PBKDF2_ITERATIONS + "$" + salt + "$" + hash };
}
function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function verifyPassword(password, stored) {
  const parts = String(stored).split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2" || Number(parts[1]) !== PBKDF2_ITERATIONS) return false;
  const computed = await passwordHash(password, parts[2]);
  return constantTimeEqual(computed.hash, stored);
}
function cleanUser(row) { return { id: row.id, name: row.display_name, email: row.email }; }
async function rateLimit(db, request, scope, identity = "", max = 8) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const key = await sha256(scope + "|" + ip + "|" + identity);
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - 900;
  const row = await db.prepare("INSERT INTO rate_limits (bucket_key,window_start,count) VALUES (?,?,1) ON CONFLICT(bucket_key) DO UPDATE SET count=CASE WHEN rate_limits.window_start<? THEN 1 ELSE rate_limits.count+1 END, window_start=CASE WHEN rate_limits.window_start<? THEN excluded.window_start ELSE rate_limits.window_start END RETURNING count")
    .bind(key, now, windowStart, windowStart).first();
  return Number(row?.count || 0) <= max;
}
async function createSession(db, userId) {
  const token = randomHex(32);
  const now = Math.floor(Date.now() / 1000);
  await db.prepare("INSERT INTO sessions (token_hash,user_id,expires_at,created_at) VALUES (?,?,?,?)")
    .bind(await sha256(token), userId, now + SESSION_TTL, new Date().toISOString()).run();
  return token;
}
async function getUser(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token || token.length > 200) return null;
  const hash = await sha256(token);
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare("SELECT users.id, users.email, users.display_name FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.token_hash=? AND sessions.expires_at>?")
    .bind(hash, now).first();
  return row ? { ...cleanUser(row), tokenHash: hash } : null;
}

async function getMemories(db, userId) {
  return await db.prepare("SELECT id,content,created_at FROM user_memories WHERE user_id=? ORDER BY created_at DESC LIMIT 50").bind(userId).all();
}
async function saveMemory(db, userId, content) {
  const clean = String(content || "").trim().slice(0, 500);
  if (!clean) return null;
  const id = crypto.randomUUID();
  await db.prepare("INSERT OR IGNORE INTO user_memories (id,user_id,content,created_at) VALUES (?,?,?,?)")
    .bind(id, userId, clean, new Date().toISOString()).run();
  return await db.prepare("SELECT id,content,created_at FROM user_memories WHERE user_id=? AND content=?").bind(userId, clean).first();
}

async function readBody(request, max = 30000) {
  const raw = await request.text();
  if (raw.length > max) throw new Error("PAYLOAD_TOO_LARGE");
  return JSON.parse(raw);
}
export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowedOrigin = env.ALLOWED_ORIGIN || "";
    const cors = corsHeaders(origin, allowedOrigin);
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") return json({ ok: true, service: "Jarvis API", auth: "enabled" }, 200, cors);
    if (!allowedOrigin || origin !== allowedOrigin) return json({ error: "Origem não autorizada." }, 403, cors);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method === "GET" && url.pathname === "/api/me") {
      const user = await getUser(request, env);
      if (!user) return json({ error: "Sessão inválida ou expirada. Entre novamente." }, 401, cors);
      return json({ user: { id: user.id, name: user.name, email: user.email } }, 200, cors);
    }
    if (request.method === "GET" && url.pathname === "/api/history") {
      const user = await getUser(request, env);
      if (!user) return json({ error: "Entre na sua conta." }, 401, cors);
      const result = await env.DB.prepare("SELECT id,role,content,created_at FROM chat_messages WHERE user_id=? ORDER BY id DESC LIMIT 100").bind(user.id).all();
      return json({ messages: (result.results || []).reverse() }, 200, cors);
    }
    if (request.method === "GET" && url.pathname === "/api/memories") {
      const user = await getUser(request, env);
      if (!user) return json({ error: "Entre na sua conta." }, 401, cors);
      const result = await getMemories(env.DB, user.id);
      return json({ memories: result.results || [] }, 200, cors);
    }
    if (request.method !== "POST") return json({ error: "Método não permitido." }, 405, cors);
    let body;
    try { body = await readBody(request); }
    catch (error) { return json({ error: error.message === "PAYLOAD_TOO_LARGE" ? "Requisição muito grande." : "Corpo da requisição inválido." }, error.message === "PAYLOAD_TOO_LARGE" ? 413 : 400, cors); }

    if (url.pathname === "/api/register") {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      const password = typeof body.password === "string" ? body.password : "";
      if (!(await rateLimit(env.DB, request, "register", email))) return json({ error: "Muitas tentativas. Aguarde 15 minutos e tente novamente." }, 429, cors);
      if (name.length < 2 || name.length > 60) return json({ error: "O nome deve ter entre 2 e 60 caracteres." }, 400, cors);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return json({ error: "Informe um e-mail válido." }, 400, cors);
      if (password.length < 10 || password.length > 128) return json({ error: "A senha deve ter entre 10 e 128 caracteres." }, 400, cors);
      const existing = await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(email).first();
      if (existing) return json({ error: "Não foi possível criar a conta com esses dados. Verifique se o e-mail já está cadastrado." }, 409, cors);
      const id = crypto.randomUUID();
      const hashed = await passwordHash(password);
      try {
        await env.DB.prepare("INSERT INTO users (id,email,display_name,password_hash,created_at) VALUES (?,?,?,?,?)")
          .bind(id, email, name, hashed.hash, new Date().toISOString()).run();
      } catch { return json({ error: "Não foi possível criar a conta. Tente novamente." }, 409, cors); }
      const token = await createSession(env.DB, id);
      return json({ token, user: { id, name, email }, expiresIn: SESSION_TTL }, 201, cors);
    }
    if (url.pathname === "/api/login") {
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      const password = typeof body.password === "string" ? body.password : "";
      if (!(await rateLimit(env.DB, request, "login", email))) return json({ error: "Muitas tentativas. Aguarde 15 minutos e tente novamente." }, 429, cors);
      if (!email || !password || email.length > 254 || password.length > 128) return json({ error: "E-mail ou senha inválidos." }, 400, cors);
      const row = await env.DB.prepare("SELECT id,email,display_name,password_hash FROM users WHERE email=?").bind(email).first();
      if (!row || !(await verifyPassword(password, row.password_hash))) return json({ error: "E-mail ou senha inválidos." }, 401, cors);
      const token = await createSession(env.DB, row.id);
      return json({ token, user: cleanUser(row), expiresIn: SESSION_TTL }, 200, cors);
    }
    if (url.pathname === "/api/logout") {
      const user = await getUser(request, env);
      if (user) await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(user.tokenHash).run();
      return json({ ok: true }, 200, cors);
    }

    if (url.pathname === "/api/memories" && request.method === "POST") {
      const user = await getUser(request, env);
      if (!user) return json({ error: "Entre na sua conta." }, 401, cors);
      const content = typeof body.content === "string" ? body.content.trim() : "";
      if (!content || content.length > 500) return json({ error: "A memória deve ter entre 1 e 500 caracteres." }, 400, cors);
      const memory = await saveMemory(env.DB, user.id, content);
      return json({ memory }, 201, cors);
    }
    if (url.pathname === "/api/memories/delete" && request.method === "POST") {
      const user = await getUser(request, env);
      if (!user) return json({ error: "Entre na sua conta." }, 401, cors);
      const id = typeof body.id === "string" ? body.id : "";
      await env.DB.prepare("DELETE FROM user_memories WHERE id=? AND user_id=?").bind(id, user.id).run();
      return json({ ok: true }, 200, cors);
    }

    if (url.pathname === "/api/chat") {
      const user = await getUser(request, env);
      if (!env.GEMINI_API_KEY) return json({ error: "O administrador ainda não configurou a chave da IA." }, 503, cors);
      const message = typeof body.message === "string" ? body.message.trim() : (Array.isArray(body.messages) ? String(body.messages[body.messages.length - 1]?.content || "").trim() : "");
      if (!message || message.length > MAX_MESSAGE_CHARS) return json({ error: "A mensagem deve ter entre 1 e 4.000 caracteres." }, 400, cors);
      if (!(await rateLimit(env.DB, request, "chat", user?.id || "guest", user ? 40 : 15))) return json({ error: "Muitas mensagens. Aguarde alguns minutos." }, 429, cors);
      const rememberMatch = message.match(/^(?:jarvis[, ]*)?(?:lembre(?:-se)?(?: de)? que|remember that)[: ]+(.+)$/i);
      if (user && rememberMatch) await saveMemory(env.DB, user.id, rememberMatch[1]);
      let contents = [];
      if (user) {
        const historyResult = await env.DB.prepare("SELECT role,content FROM chat_messages WHERE user_id=? ORDER BY id DESC LIMIT 8").bind(user.id).all();
        contents = (historyResult.results || []).reverse().map(item => ({ role: item.role, parts: [{ text: item.content }] }));
      } else if (Array.isArray(body.messages)) {
        contents = body.messages.slice(-12).filter(item => item && ["user","model"].includes(item.role) && typeof item.content === "string" && item.content.length <= MAX_MESSAGE_CHARS).map(item => ({ role:item.role, parts:[{text:item.content}] }));
      }
      if (!contents.length || contents[contents.length - 1]?.parts?.[0]?.text !== message) contents.push({ role: "user", parts: [{ text: message }] });
      const storedMemories = user ? ((await getMemories(env.DB, user.id)).results || []).map(item => item.content) : [];
      const browserMemories = Array.isArray(body.memories) ? body.memories.filter(item => typeof item === "string" && item.trim().length > 0 && item.length <= 300) : [];
      const memories = [...new Set([...storedMemories, ...browserMemories].map(item => String(item).trim()))].slice(0, 30).map(item => "- " + item).join("\n");
      const systemText = "Você é Jarvis, assistente pessoal prestativo, claro e cordial. Responda em português brasileiro por padrão. Seja honesto sobre suas capacidades e não afirme executar ações externas sem fazê-lo.\n\nMEMÓRIAS CONFIRMADAS DO USUÁRIO (use apenas quando relevante; não invente):\n" + (memories || "Nenhuma memória salva ainda.") + "\n\nSe o usuário disser 'lembre que ...', confirme que a informação foi guardada. Se pedir para esquecer uma memória, explique que ela pode ser removida na área Memórias.";
      try {
        const endpoint = "https://generativelanguage.googleapis.com/v1beta/models/" + MODEL + ":generateContent?key=" + encodeURIComponent(env.GEMINI_API_KEY);
        const upstream = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemText }] },
          contents, generationConfig: { maxOutputTokens: 800 }
        }) });
        const result = await upstream.json().catch(() => ({}));
        if (!upstream.ok) return json({ error: result?.error?.message || "O provedor de IA recusou a solicitação." }, upstream.status === 429 ? 429 : 502, cors);
        const parts = result?.candidates?.[0]?.content?.parts || [];
        const reply = parts.map(part => part.text || "").join("").trim();
        if (!reply) return json({ error: "A IA não retornou texto. Tente novamente." }, 502, cors);
        if (user) {
          const now = new Date().toISOString();
          await env.DB.batch([
            env.DB.prepare("INSERT INTO chat_messages (user_id,role,content,created_at) VALUES (?,?,?,?)").bind(user.id, "user", message, now),
            env.DB.prepare("INSERT INTO chat_messages (user_id,role,content,created_at) VALUES (?,?,?,?)").bind(user.id, "model", reply, now)
          ]);
        }
        return json({ reply, remembered: !!(user && rememberMatch) }, 200, cors);
      } catch { return json({ error: "Falha ao conectar ao provedor de IA." }, 502, cors); }
    }
    return json({ error: "Rota não encontrada." }, 404, cors);
  }
};
