import type { SupabaseClient } from '@supabase/supabase-js';
import type { RemoteAdapter } from '@/data/sync';

export function supabaseRemote(client: SupabaseClient): RemoteAdapter {
  return {
    async upsert(table, rows) {
      const { error } = await client.from(table).upsert(rows, { onConflict: 'id' });
      if (error) throw new Error(`${table}: ${error.message}`);
    },
    async pullSince(table, since) {
      const out: Record<string, unknown>[] = [];
      let cursor = since;
      // Pagina por updated_at para não carregar tudo de uma vez.
      for (let page = 0; page < 50; page++) {
        let q = client.from(table).select('*').order('updated_at', { ascending: true }).limit(500);
        if (cursor) q = q.gt('updated_at', cursor);
        const { data, error } = await q;
        if (error) throw new Error(`${table}: ${error.message}`);
        out.push(...(data ?? []));
        if (!data || data.length < 500) break;
        cursor = String(data[data.length - 1].updated_at);
      }
      return out;
    },
  };
}
