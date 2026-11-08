/**
 * Account-scoped audit trail for autonomous tool runs.
 */
export async function saveAgentRun(db, userId, goal, execution) {
  if (!userId || !execution?.steps?.length) return null;
  const taskId = crypto.randomUUID();
  const runId = crypto.randomUUID();
  const now = new Date().toISOString();
  const summary = String(execution.reply || "").slice(0, 4000);
  const statements = [
    db.prepare("INSERT INTO agent_tasks (id,user_id,goal,status,created_at,updated_at) VALUES (?,?,?,'completed',?,?)").bind(taskId, userId, String(goal).slice(0, 4000), now, now),
    db.prepare("INSERT INTO agent_runs (id,task_id,user_id,status,tool_calls,rounds,summary,started_at,finished_at) VALUES (?,?,?,'completed',?,?,?,?,?)").bind(runId, taskId, userId, execution.toolCalls || 0, execution.rounds || 0, summary, now, now)
  ];
  for (const step of execution.steps.slice(0, 4)) {
    statements.push(db.prepare("INSERT INTO agent_steps (id,run_id,sequence,tool_name,status,arguments_json,result_json,created_at) VALUES (?,?,?,?,?,?,?,?)")
      .bind(crypto.randomUUID(), runId, step.sequence, String(step.tool).slice(0, 80), step.status === "success" ? "success" : "error", JSON.stringify(step.arguments || {}).slice(0, 2000), JSON.stringify(step.result || {}).slice(0, 8000), now));
  }
  await db.batch(statements);
  return { taskId, runId };
}

export async function listAgentTasks(db, userId) {
  const result = await db.prepare("SELECT t.id,t.goal,t.status,t.created_at,t.updated_at,r.id AS run_id,r.tool_calls,r.rounds,r.summary FROM agent_tasks t LEFT JOIN agent_runs r ON r.task_id=t.id WHERE t.user_id=? ORDER BY t.created_at DESC LIMIT 30").bind(userId).all();
  return result.results || [];
}

export async function getAgentTask(db, userId, taskId) {
  const task = await db.prepare("SELECT id,goal,status,created_at,updated_at FROM agent_tasks WHERE id=? AND user_id=?").bind(taskId, userId).first();
  if (!task) return null;
  const run = await db.prepare("SELECT id,status,tool_calls,rounds,summary,started_at,finished_at FROM agent_runs WHERE task_id=? AND user_id=?").bind(taskId, userId).first();
  const steps = run ? await db.prepare("SELECT sequence,tool_name,status,arguments_json,result_json,created_at FROM agent_steps WHERE run_id=? ORDER BY sequence ASC").bind(run.id).all() : { results: [] };
  return { ...task, run: run || null, steps: (steps.results || []).map(step => ({ ...step, arguments: JSON.parse(step.arguments_json || "{}"), result: JSON.parse(step.result_json || "{}"), arguments_json: undefined, result_json: undefined })) };
}
