import {
  aiConfigured,
  analyzeGroceries,
  AnalysisError,
  monthlyLimit,
  validateAnalysis,
  type AIConfig,
  type Analysis,
} from './ai.ts';
import type { Database } from './worker.ts';

export async function analyzeRequest(
  db: Database,
  env: AIConfig,
  user: string,
  operationId: string,
  text: string,
): Promise<Analysis> {
  if (!aiConfigured(env))
    throw new AnalysisError('הניתוח החכם עדיין לא הופעל. אפשר להשתמש בפענוח הרגיל.');
  if (!text.trim() || text.length > 2000)
    throw new AnalysisError('אפשר להזין עד 2,000 תווים בכל פעם.', 400);
  const id = user + ':' + operationId;
  const time = Date.now();
  const textHash = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))),
  )
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
  const existing = (
    await db
      .prepare('SELECT text_hash,status,result,updated_at FROM ai_requests WHERE id=?')
      .bind(id)
      .all()
  ).results[0];
  if (existing && existing.text_hash !== textHash)
    throw new AnalysisError('הטקסט השתנה. שלחו אותו מחדש כהודעה חדשה.', 409);
  if (existing?.status === 'complete' && existing.result)
    return validateAnalysis(JSON.parse(existing.result));
  const lease = crypto.randomUUID();
  const claim = await db
    .prepare(
      `INSERT INTO ai_requests(id,text_hash,status,result,lease,updated_at) VALUES(?,?,'processing',NULL,?,?)
  ON CONFLICT(id) DO UPDATE SET status='processing',lease=excluded.lease,updated_at=excluded.updated_at
  WHERE ai_requests.text_hash=excluded.text_hash AND ((ai_requests.status='failed' AND ai_requests.updated_at<?) OR (ai_requests.status='processing' AND ai_requests.updated_at<?)) RETURNING id`,
    )
    .bind(id, textHash, lease, time, time - 2000, time - 30000)
    .all();
  if (!claim.results.length)
    throw new AnalysisError('ההודעה כבר בפענוח, או שעדיין צריך להמתין רגע לפני ניסיון נוסף.', 409);
  try {
    const period = new Date(time).toISOString().slice(0, 7);
    const limit = monthlyLimit(env);
    const quota = await db
      .prepare(
        `INSERT INTO ai_usage(period,used) SELECT ?,1 WHERE ?>0 ON CONFLICT(period) DO UPDATE SET used=ai_usage.used+1 WHERE ai_usage.used<? RETURNING used`,
      )
      .bind(period, limit, limit)
      .all();
    if (!quota.results.length)
      throw new AnalysisError(
        'מכסת הניתוח החכם לחודש הזה נוצלה. הרשימה נשמרת כרגיל; אפשר לבחור פענוח רגיל.',
        429,
      );
    const result = await analyzeGroceries(text, env);
    await db
      .prepare(
        "UPDATE ai_requests SET status='complete',result=?,updated_at=? WHERE id=? AND lease=?",
      )
      .bind(JSON.stringify(result), Date.now(), id, lease)
      .run();
    return result;
  } catch (error) {
    await db
      .prepare("UPDATE ai_requests SET status='failed',updated_at=? WHERE id=? AND lease=?")
      .bind(Date.now(), id, lease)
      .run();
    throw error;
  }
}
