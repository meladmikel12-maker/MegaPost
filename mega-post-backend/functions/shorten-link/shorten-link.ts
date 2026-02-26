import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-device-id',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { url } = await req.json()
    const deviceId = req.headers.get('x-device-id')

    if (!deviceId) throw new Error("x-device-id is required in headers")

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: settings, error: dbError } = await supabase
      .from('user_settings')
      .select('amazon_partner_tag, tinyurl_key, short_link_alias')
      .eq('device_id', deviceId)
      .single()

    if (dbError || !settings) throw new Error("Settings not found for this device")

    const tinyUrlApiKey = settings.tinyurl_key;
    if (!tinyUrlApiKey) throw new Error("TinyURL API Key is missing in your settings ⚠️");

    const channelAlias = settings.short_link_alias?.replace(/\s+/g, '-') || 'Deals';
    const tag = settings.amazon_partner_tag || 'default-21';

    const asinMatch = url.match(/(?:dp|gp\/product|exec\/obidos\/asin)\/([a-zA-Z0-9]{10})/i);
    const asin = asinMatch ? asinMatch[1].toUpperCase() : null;

    if (!asin) throw new Error("Invalid Amazon URL: ASIN not found");

    const affiliateUrl = `https://www.amazon.eg/dp/${asin}?tag=${tag}`;

    const { data: existingProduct } = await supabase
      .from('products')
      .select('affiliate_link')
      .eq('asin', asin)
      .eq('user_id', deviceId)
      .not('affiliate_link', 'is', null)
      .maybeSingle();

    if (existingProduct?.affiliate_link?.includes('tinyurl.com')) {
      return new Response(
        JSON.stringify({ short_url: existingProduct.affiliate_link, asin: asin }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    const response = await fetch(`https://api.tinyurl.com/create`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tinyUrlApiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        url: affiliateUrl,
        domain: "tinyurl.com",
        alias: `${asin}-${channelAlias}`,
        description: `Shortened for device: ${deviceId}`
      }),
    });

    const result = await response.json();

    if (result.code === 0 && result.data) {
      return new Response(
        JSON.stringify({ short_url: result.data.tiny_url, asin: asin }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    } else {
      const fallbackResponse = await fetch(`https://api.tinyurl.com/create`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tinyUrlApiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          url: affiliateUrl,
          domain: "tinyurl.com"
        }),
      });

      const fallbackResult = await fallbackResponse.json();

      return new Response(
        JSON.stringify({
          short_url: fallbackResult.data?.tiny_url || affiliateUrl,
          asin: asin,
          warning: result.errors?.[0] || "Custom alias taken, generated random link."
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})