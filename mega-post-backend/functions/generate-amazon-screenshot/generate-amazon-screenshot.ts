import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import puppeteer from "npm:puppeteer-core";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-device-id',
}


const BLOCKED_RESOURCES = ['font', 'media', 'other', 'manifest'];
const BLOCKED_DOMAINS = [
  'amazon-adsystem.com', 'google-analytics.com', 'facebook.net',
  'doubleclick.net', 'advertising-api-eu.amazon.com'
];

async function generateProductCardImage(productUrl: string, browserlessKey: string) {
  let browser;
  try {
    console.time("⏱️ Total Browser Logic");

    const endpoint = `wss://chrome.browserless.io?token=${browserlessKey}&--lang=ar-EG&--disable-notifications&--disable-extensions`;

    console.time("⏱️ Browser Connect");
    browser = await puppeteer.connect({
      browserWSEndpoint: endpoint,
      defaultViewport: { width: 1280, height: 1600, deviceScaleFactor: 2 }
    });
    console.timeEnd("⏱️ Browser Connect");

    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'ar-EG,ar;q=0.9' });

    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const url = req.url();
      if (BLOCKED_RESOURCES.includes(req.resourceType()) || BLOCKED_DOMAINS.some(d => url.includes(d))) {
        req.abort();
      } else {
        req.continue();
      }
    });

    console.time("⏱️ Page Goto");
    await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.timeEnd("⏱️ Page Goto");

    console.time("⏱️ DOM Evaluation");
    const clipRegion = await page.evaluate(() => {
      const toHide = [
        '#nav-belt', '#nav-main', '#navFooter', '.nav-footer',
        '#wayfinding-breadcrumbs_feature_div', '.s-breadcrumb',
        '[id*="CardInstance"]', '#abbWrapper', '#newerVersion_feature_div',
        '#addToWishlist_feature_div', '#wishlistButtonStack', '#adLink',
        '#inline-twister-row-size_name', '#variation_size_name', '#nav-extra-special-messaging'
      ];

      toHide.forEach(s => {
        document.querySelectorAll(s).forEach(el => {
          if (el instanceof HTMLElement) el.style.setProperty('display', 'none', 'important');
        });
      });

      const ppd = document.getElementById('ppd');
      if (!ppd) return null;

      const leftCol = document.getElementById('leftCol');
      const imageCanvas = document.getElementById('imgTagWrapperId') || document.getElementById('main-image-container');
      const sellerInfo = document.querySelector('.offer-display-features-container') || document.getElementById('merchantInfoFeature_feature_div');
      const colorSection = document.getElementById('inline-twister-row-color_name') || document.querySelector('.inline-twister-row');

      const ppdRect = ppd.getBoundingClientRect();
      const endpoints = [];

      if (leftCol) endpoints.push(leftCol.getBoundingClientRect().bottom);
      if (imageCanvas) endpoints.push(imageCanvas.getBoundingClientRect().bottom);
      if (sellerInfo) endpoints.push(sellerInfo.getBoundingClientRect().bottom);
      if (colorSection) endpoints.push(colorSection.getBoundingClientRect().bottom);

      if (endpoints.length === 0) {
        const price = document.getElementById('corePrice_desktop');
        if (price) endpoints.push(price.getBoundingClientRect().bottom);
      }

      const maxBottom = Math.max(...endpoints, ppdRect.top + 550);

      return {
        x: Math.max(0, ppdRect.x - 5),
        y: Math.max(0, ppdRect.y - 5),
        width: ppdRect.width + 10,
        height: (maxBottom - ppdRect.top) + 25
      };
    });
    console.timeEnd("⏱️ DOM Evaluation");

    if (!clipRegion) throw new Error("Could not find product details container (#ppd)");
    await new Promise(r => setTimeout(r, 500));

    console.time("⏱️ Screenshot Taking");
    const imageBuffer = await page.screenshot({
      type: 'jpeg',
      quality: 90,
      clip: clipRegion
    });

    console.timeEnd("⏱️ Screenshot Taking");

    console.timeEnd("⏱️ Total Browser Logic");
    return imageBuffer;

  } finally {
    if (browser) await browser.close();
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  console.time("🚀 Full Request Execution");
  try {
    const { asin, url } = await req.json();
    const deviceId = req.headers.get('x-device-id');
    const productUrl = url || `https://www.amazon.eg/dp/${asin}`;

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    console.time("⏱️ Parallel Tasks (DB + Browser)");
    const userPromise = supabase.from('user_settings').select('browserless_key').eq('device_id', deviceId).single();

    const { data: user } = await userPromise;
    const browserlessKey = user?.browserless_key || "";

    const buffer = await generateProductCardImage(productUrl, browserlessKey);
    console.timeEnd("⏱️ Parallel Tasks (DB + Browser)");

    if (!buffer) throw new Error("Image generation failed");

    console.time("⏱️ Supabase Upload");
    const fileName = `smart_clip_${asin}_${Date.now()}.jpg`;
    const { error: uploadError } = await supabase.storage.from('banners').upload(fileName, buffer, { contentType: 'image/jpeg' });
    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage.from('banners').getPublicUrl(fileName);
    console.timeEnd("⏱️ Supabase Upload");

    console.timeEnd("🚀 Full Request Execution");
    return new Response(JSON.stringify({ screenshot_url: publicUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (e) {
    console.error("❌ Serve Error:", e.message);
    return new Response(JSON.stringify({ error: e.message }), {
      headers: corsHeaders,
      status: 400
    });
  }
});