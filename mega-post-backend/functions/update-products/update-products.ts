import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7?bundle";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json; charset=utf-8"
};

function getArabicTime() {
  const now = new Date();
  const options = { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit', hour12: true };
  return now.toLocaleTimeString('en-US', options as any).replace('AM', 'ص').replace('PM', 'م');
}

async function notifyAdmin(config: any, payload: any) {
  if (!config.tg_admin_id || !config.tg_bot_token) return;
  const baseUrl = `https://api.telegram.org/bot${config.tg_bot_token}`;

  const text = `
🔔 <b>تحديث تلقائي للمنتج</b>

📌 <b>الاسم:</b> ${payload.title || 'بدون عنوان'}
🆔 <b>ASIN:</b> <code>${payload.asin}</code>

💰 <b>السعر:</b> ${Math.floor(payload.oldPrice || 0)} ← <b>${Math.floor(payload.newPrice || 0)} ج.م</b>
✅ <b>الحالة:</b> ${payload.status}

🔗 <b>رابط المنتج:</b>
${payload.link}

🕒 ${getArabicTime()}
`.trim();

  try {
    await fetch(`${baseUrl}/sendPhoto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: config.tg_admin_id,
        photo: payload.image,
        caption: text.substring(0, 1024),
        parse_mode: "HTML"
      })
    });
  } catch (e) {
    console.error("Admin Notify Error:", e);
  }
}

async function getAccessToken(credentialId: string, credentialSecret: string) {
  const authUrl = "https://creatorsapi.auth.eu-west-1.amazoncognito.com/oauth2/token";
  const authHeader = btoa(`${credentialId}:${credentialSecret}`);
  const response = await fetch(authUrl, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${authHeader}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      "grant_type": "client_credentials",
      "scope": "creatorsapi/default",
    }),
  });
  const data = await response.json();
  return data.access_token;
}

async function getAmazonItemsBatch(asins: string[], config: any) {
  const HOST = "creatorsapi.amazon";
  const PATH = "/catalog/v1/getItems";

  const token = await getAccessToken(config.amazon_credential_id.trim(), config.amazon_credential_secret.trim());

  const payload = JSON.stringify({
    "itemIds": asins,
    "partnerTag": config.amazon_partner_tag.trim(),
    "marketplace": "www.amazon.eg",
    "resources": ["images.primary.large", "itemInfo.title", "offersV2.listings.price"]
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    "x-marketplace": "www.amazon.eg",
    "Authorization": `Bearer ${token}, Version 2.2`,
  };

  const res = await fetch(`https://${HOST}${PATH}`, { method: "POST", headers, body: payload });
  return await res.json();
}

async function startAutoUpdate() {
  const { data: allConfigs } = await supabase.from("user_settings").select("*");
  if (!allConfigs) return { status: "no_configs" };

  for (const config of allConfigs) {
    const { data: products } = await supabase.from("products")
      .select("*")
      .eq("user_id", config.device_id)
      .order("last_update", { ascending: true })
      .limit(20);

    if (!products || products.length === 0) continue;

    const currentBatchPrices = new Map();
    const amzData = await getAmazonItemsBatch(products.map(p => p.asin), config);

    const amzItems = amzData?.itemsResult?.items || [];

    amzItems.forEach((item: any) => {
      const price = item?.offersV2?.listings?.[0]?.price?.money?.amount;
      if (price !== undefined && price !== null) currentBatchPrices.set(item.asin, price);
    });

    for (const p of products) {
      const newPrice = currentBatchPrices.get(p.asin);

      if (newPrice !== undefined && Math.floor(newPrice) !== Math.floor(p.price)) {
        await notifyAdmin(config, {
          title: p.title,
          asin: p.asin,
          image: p.image,
          link: p.affiliate_link,
          oldPrice: p.price,
          newPrice: newPrice,
          status: newPrice <= 0 ? "❌ نفد من المخزون" : "✅ تم تحديث السعر"
        });

        await supabase.from("products").update({
          price: newPrice,
          last_update: new Date().toISOString()
        }).eq("asin", p.asin).eq("user_id", config.device_id);
      } else {
        await supabase.from("products").update({
          last_update: new Date().toISOString()
        }).eq("asin", p.asin).eq("user_id", config.device_id);
      }
    }
  }
  return { ok: true };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const res = await startAutoUpdate();
    return new Response(JSON.stringify(res), { headers: corsHeaders });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});