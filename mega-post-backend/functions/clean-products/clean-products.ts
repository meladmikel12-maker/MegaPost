import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const supabase = createClient(supabaseUrl, supabaseKey);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json; charset=utf-8",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { data: allConfigs } = await supabase.from("user_settings").select("*");
    if (!allConfigs || allConfigs.length === 0) {
      return new Response(JSON.stringify({ ok: true, message: "No users to clean" }), { headers: corsHeaders });
    }

    const now = new Date();
    let totalCleaned = 0;

    for (const config of allConfigs) {
      const deviceId = config.device_id;

      const { data: userProducts } = await supabase.from("products")
        .select("*, image")
        .eq("user_id", deviceId);

      if (!userProducts || userProducts.length === 0) continue;

      const expiredProducts = userProducts.filter(p => {
        const pubDate = new Date(p.published_at || p.last_update);
        return (now.getTime() - pubDate.getTime()) / (1000 * 60 * 60) >= 36;
      });

      if (expiredProducts.length === 0) continue;

      const filesToRemove: string[] = [];

      for (const p of expiredProducts) {
        if (p.image && p.image.includes("/banners/")) {
          const pathParts = p.image.split('/banners/');
          if (pathParts.length > 1) {
            const fullPath = pathParts[pathParts.length - 1].split('?')[0];
            if (fullPath) filesToRemove.push(fullPath);
          }
        }
      }

      if (filesToRemove.length > 0) {
        try {
          await supabase.storage
            .from('banners')
            .remove(filesToRemove);
        } catch (e) {
          console.error(`Storage Removal Error (User ${deviceId}):`, e.message);
        }
      }

      const expiredAsins = expiredProducts.map(p => p.asin);
      try {
        const { error: deleteError } = await supabase.from("products")
          .delete()
          .in("asin", expiredAsins)
          .eq("user_id", deviceId);

        if (!deleteError) {
          totalCleaned += expiredAsins.length;
        } else {
          console.error(`DB Delete Error (User ${deviceId}):`, deleteError.message);
        }
      } catch (e) {
        console.error(`DB Global Error (User ${deviceId}):`, e.message);
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      total_cleaned: totalCleaned
    }), { headers: corsHeaders });

  } catch (e) {
    console.error("Global Cleanup Error:", e.message);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});