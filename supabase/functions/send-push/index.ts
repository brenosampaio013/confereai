// Supabase Edge Function: send-push
//
// Envia como notificação push os avisos já gravados na tabela `notifications`
// (gerados pelo banco a partir de eventos reais) para quem ativou o push nas preferências.
// Deve ser chamada periodicamente (Cron do Supabase / pg_cron + pg_net), com o cabeçalho
//   Authorization: Bearer <PUSH_CRON_SECRET>
//
// Segredos: PUSH_CRON_SECRET (obrigatório). SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são
// fornecidos automaticamente pelo Supabase às funções.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

Deno.serve(async (req) => {
  const secret = Deno.env.get('PUSH_CRON_SECRET');
  if (!secret || req.headers.get('Authorization') !== `Bearer ${secret}`) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  }
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  const since = new Date(Date.now() - 24 * 3600e3).toISOString();
  const { data: pending, error } = await db
    .from('notifications')
    .select('id, user_id, title, body, promotion_id')
    .is('push_sent_at', null)
    .gte('created_at', since)
    .order('created_at')
    .limit(500);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  if (!pending?.length) return new Response(JSON.stringify({ sent: 0 }));

  const users = [...new Set(pending.map((n) => n.user_id))];
  const [{ data: prefs }, { data: tokens }] = await Promise.all([
    db.from('notification_preferences').select('user_id').in('user_id', users).eq('push_enabled', true),
    db.from('push_tokens').select('user_id, token').in('user_id', users),
  ]);
  const enabled = new Set((prefs ?? []).map((p) => p.user_id));
  const byUser = new Map<string, string[]>();
  for (const t of tokens ?? []) if (enabled.has(t.user_id)) byUser.set(t.user_id, [...(byUser.get(t.user_id) ?? []), t.token]);

  const messages = pending.flatMap((n) =>
    (byUser.get(n.user_id) ?? []).map((to) => ({ to, title: n.title, body: n.body, sound: 'default', channelId: 'ofertas', data: { promotionId: n.promotion_id } })),
  );
  let sent = 0;
  const invalid: string[] = [];
  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100);
    const res = await fetch(EXPO_PUSH_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(batch) });
    if (!res.ok) continue;
    const json = (await res.json()) as { data?: { status: string; details?: { error?: string } }[] };
    (json.data ?? []).forEach((r, k) => {
      if (r.status === 'ok') sent++;
      else if (r.details?.error === 'DeviceNotRegistered') invalid.push(batch[k].to);
    });
  }
  if (invalid.length) await db.from('push_tokens').delete().in('token', invalid);
  // Marca como processados (inclusive de quem não ativou push): não há reenvio.
  await db.from('notifications').update({ push_sent_at: new Date().toISOString() }).in('id', pending.map((n) => n.id));
  return new Response(JSON.stringify({ processed: pending.length, sent, removed_tokens: invalid.length }));
});
