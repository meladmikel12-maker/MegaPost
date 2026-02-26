import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const headersBase = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey, x-device-id",
};

const VERSION = "3.2";
const MARKETPLACE = "www.amazon.eg";

async function getAccessToken(clientId: string, clientSecret: string) {
  const authUrl = "https://creatorsapi.auth.us-west-2.amazoncognito.com/oauth2/token";

  const id = clientId.trim();
  const secret = clientSecret.trim();
  const credentials = btoa(`${id}:${secret}`);

  console.log(`--- [STRICT AUTH ATTEMPT - US-WEST-2] ---`);

  const response = await fetch(authUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${credentials}`,
    },
    body: "grant_type=client_credentials&scope=creatorsapi/default",
  });

  const responseText = await response.text();

  if (!response.ok) {
    console.error(`❌ Auth Failed at US-WEST-2: ${responseText}`);
    return await getAccessTokenSecondary(id, secret);
  }

  const data = JSON.parse(responseText);
  console.log(`✅ Auth Success via US-WEST-2`);
  return data.access_token;
}

async function getAccessTokenSecondary(id: string, secret: string) {
  const authUrl = "https://creatorsapi.auth.eu-south-2.amazoncognito.com/oauth2/token";
  const credentials = btoa(`${id}:${secret}`);
  const response = await fetch(authUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${credentials}`,
    },
    body: "grant_type=client_credentials&scope=creatorsapi/default",
  });
  if (!response.ok) throw new Error(await response.text());
  const data = await response.json();
  return data.access_token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: headersBase });

  try {
    const body = await req.json();
    const { asin, amazonCredentials } = body;

    const clientId = amazonCredentials?.credentialId;
    const clientSecret = amazonCredentials?.credentialSecret;
    const partnerTag = amazonCredentials?.partnerTag;

    if (!asin || !clientId || !clientSecret || !partnerTag) {
      throw new Error("Missing parameters");
    }

    const token = await getAccessToken(clientId, clientSecret);

    const response = await fetch("https://creatorsapi.amazon/catalog/v1/getItems", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}, Version ${VERSION}`,
        "x-marketplace": MARKETPLACE,
      },
      body: JSON.stringify({
        itemIds: [asin.trim().toUpperCase()],
        itemIdType: "ASIN",
        marketplace: MARKETPLACE,
        partnerTag: partnerTag.trim(),
        resources: ["itemInfo.title", "images.primary.large", "offersV2.listings.price"]
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Amazon API Error");

    if (data.itemResults?.items?.length > 0) {
      return new Response(JSON.stringify(data.itemResults.items[0]), {
        status: 200,
        headers: headersBase,
      });
    }

    throw new Error("Product Not Found");

  } catch (e) {
    console.error(`🔥 Final Error: ${e.message}`);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: headersBase
    });
  }
});