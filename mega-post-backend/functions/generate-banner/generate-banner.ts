import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import satori from "https://esm.sh/satori@0.10.11";
import { initWasm, Resvg } from "https://esm.sh/@resvg/resvg-wasm@2.4.1";
import { Buffer } from "node:buffer";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

globalThis.Buffer = Buffer;

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-device-id",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FONT_URL = "https://cdnjs.cloudflare.com/ajax/libs/vazir-font/30.1.0/Vazir-Bold.ttf";
const WASM_URL = "https://esm.sh/@resvg/resvg-wasm@2.4.1/index_bg.wasm";

let wasmReady = false;
let fontBuffer: ArrayBuffer | null = null;

serve(async (req) => {

    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const body = await req.json();
        const { asin, price = 0, image, discount, extraPaymentDiscount = 0, template = "default" } = body;

        console.log(`🚀 Starting generation for ASIN: ${asin || 'N/A'} using template: ${template}`);
        const extraDiscountAmount = extraPaymentDiscount > 0 ? (price * (extraPaymentDiscount / 100)) : 0;
        const finalPriceNum = Math.floor(Number(price) - extraDiscountAmount);
        const cleanPriceNum = Math.floor(Number(price));

        const finalPrice = finalPriceNum.toLocaleString('en-US');
        const cleanPrice = cleanPriceNum.toLocaleString('en-US');

        if (!image) throw new Error("IMAGE IS REQUIRED");

        const supabaseClient = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        if (!wasmReady) {
            console.log("📥 Loading WASM...");
            const wasmResponse = await fetch(WASM_URL);
            await initWasm(await wasmResponse.arrayBuffer());
            wasmReady = true;
        }
        if (!fontBuffer) {
            console.log("📥 Loading Font...");
            fontBuffer = await fetch(FONT_URL).then((r) => r.arrayBuffer());
        }

        console.log("📥 Fetching product image...");
        const imgRes = await fetch(image);
        const imgBuffer = await imgRes.arrayBuffer();
        const imgBase64 = `data:${imgRes.headers.get("content-type") || "image/jpeg"};base64,${Buffer.from(imgBuffer).toString("base64")}`;

        let satoriTree;

        switch (template) {
            case "blue":
                satoriTree = {
                    type: "div",
                    props: {
                        style: { width: "1200px", height: "630px", display: "flex", backgroundColor: "#BAE6FD", alignItems: "center", justifyContent: "center", fontFamily: "Vazir", padding: "12px" },
                        children: [{
                            type: "div",
                            props: {
                                style: { display: "flex", width: "100%", height: "100%", backgroundColor: "#ffffff", flexDirection: "row", alignItems: "center", padding: "0 40px", borderRadius: "32px" },
                                children: [
                                    {
                                        type: "div", props: {
                                            style: { width: "65%", height: "100%", display: "flex", justifyContent: "center", alignItems: "center", padding: "20px" }, children: [
                                                { type: "img", props: { src: imgBase64, style: { width: "90%", height: "90%", objectFit: "contain" } } }
                                            ]
                                        }
                                    },
                                    { type: "div", props: { style: { width: "1px", height: "40%", backgroundColor: "#F1F5F9" } } },
                                    {
                                        type: "div", props: {
                                            style: { width: "35%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }, children: [
                                                {
                                                    type: "div", props: {
                                                        style: { display: "flex", alignItems: "baseline" }, children: [
                                                            { type: "span", props: { style: { fontSize: "100px", color: "#0F172A", fontWeight: "900" }, children: `${finalPrice}` } },
                                                            { type: "span", props: { style: { fontSize: "30px", color: "#64748B", marginLeft: "8px", fontWeight: "bold" }, children: "EGP" } }
                                                        ]
                                                    }
                                                },
                                                discount ? { type: "div", props: { style: { backgroundColor: "#F43F5E", color: "#ffffff", padding: "8px 20px", borderRadius: "12px", marginTop: "15px", fontSize: "32px", fontWeight: "900" }, children: `${discount}% OFF` } } : null,
                                                extraPaymentDiscount > 0 ? { type: "div", props: { style: { backgroundColor: "#10B981", color: "#ffffff", padding: "6px 16px", borderRadius: "8px", marginTop: "10px", fontSize: "22px", fontWeight: "bold" }, children: `+${extraPaymentDiscount}% Extra Discount` } } : null
                                            ]
                                        }
                                    }
                                ]
                            }
                        }]
                    }
                };
                break;

            case "orange":
                satoriTree = {
                    type: "div",
                    props: {
                        style: { width: "1200px", height: "630px", display: "flex", background: "linear-gradient(135deg, #FFB347 0%, #F38C12 100%)", fontFamily: "Vazir", position: "relative", overflow: "hidden" },
                        children: [
                            {
                                type: "div", props: {
                                    style: { position: "absolute", left: "-12%", top: "0", width: "78%", height: "100%", backgroundColor: "#ffffff", transform: "skewX(-8deg)", display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: "20px", boxShadow: "25px 0 50px rgba(0,0,0,0.15)" },
                                    children: [
                                        { type: "img", props: { src: imgBase64, style: { width: "88%", height: "88%", objectFit: "contain", transform: "skewX(8deg)", marginRight: "-20px" } } }
                                    ]
                                }
                            },
                            {
                                type: "div", props: {
                                    style: { width: "30%", height: "100%", position: "absolute", right: "0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingRight: "20px" },
                                    children: [
                                        {
                                            type: "div", props: {
                                                style: { display: "flex", alignItems: "baseline", flexDirection: "row" }, children: [
                                                    { type: "span", props: { style: { fontSize: "110px", color: "#2d3436", fontWeight: "900" }, children: `${finalPrice}` } },
                                                    { type: "span", props: { style: { fontSize: "30px", color: "#2d3436", fontWeight: "bold", marginLeft: "10px" }, children: "EGP" } }
                                                ]
                                            }
                                        },
                                        discount ? { type: "div", props: { style: { backgroundColor: "#FF4E50", color: "#ffffff", padding: "8px 30px", borderRadius: "12px", fontSize: "50px", fontWeight: "900", transform: "rotate(-4deg)", boxShadow: "0 8px 15px rgba(0,0,0,0.2)" }, children: `${discount}% OFF` } } : null,
                                        extraPaymentDiscount > 0 ? { type: "div", props: { style: { backgroundColor: "#2d3436", color: "#FFB347", padding: "6px 20px", borderRadius: "50px", marginTop: "15px", fontSize: "24px", fontWeight: "900" }, children: `Extra ${extraPaymentDiscount}% OFF` } } : null
                                    ]
                                }
                            }
                        ]
                    }
                };
                break;

            default:
                satoriTree = {
                    type: "div",
                    props: {
                        style: { width: "1200px", height: "630px", display: "flex", backgroundColor: "#FFFFFF", fontFamily: "Vazir", position: "relative", overflow: "hidden" },
                        children: [
                            { type: "div", props: { style: { position: "absolute", width: "100%", height: "100%", background: "radial-gradient(circle, #ffffff 30%, #f5f5f5 100%)" } } },
                            {
                                type: "div", props: {
                                    style: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: "30px" },
                                    children: [
                                        { type: "img", props: { src: imgBase64, style: { width: "90%", height: "90%", objectFit: "contain" } } }
                                    ]
                                }
                            },
                            {
                                type: "div", props: {
                                    style: { position: "absolute", bottom: "40px", left: "60px", display: "flex", flexDirection: "column" },
                                    children: [
                                        {
                                            type: "div", props: {
                                                style: { display: "flex", alignItems: "baseline" },
                                                children: [
                                                    { type: "span", props: { style: { fontSize: "85px", fontWeight: "900", color: "#1A1A1A", letterSpacing: "-2px" }, children: `${finalPrice}` } },
                                                    { type: "span", props: { style: { fontSize: "30px", marginLeft: "8px", color: "#888", fontWeight: "bold" }, children: "EGP" } }
                                                ]
                                            }
                                        },
                                        extraPaymentDiscount > 0 ? { type: "span", props: { style: { fontSize: "24px", color: "#10B981", fontWeight: "bold", marginTop: "-10px" }, children: `Inc. ${extraPaymentDiscount}% Extra Discount` } } : null
                                    ]
                                }
                            },
                            discount ? {
                                type: "div", props: {
                                    style: { position: "absolute", bottom: "60px", right: "-5px", backgroundColor: "#D32F2F", color: "#FFFFFF", padding: "10px 45px", fontSize: "35px", fontWeight: "800", boxShadow: "-5px 5px 15px rgba(0,0,0,0.1)", borderRadius: "40px 0 0 40px", display: "flex", alignItems: "center" },
                                    children: [
                                        { type: "span", props: { style: { marginRight: "8px" }, children: "SALE" } },
                                        { type: "span", props: { children: `${discount}%` } }
                                    ]
                                }
                            } : null
                        ]
                    }
                };
                break;
        }

        console.log("🎨 Generating SVG with Satori...");
        const svg = await satori(satoriTree, { width: 1200, height: 630, fonts: [{ name: "Vazir", data: fontBuffer!, weight: 700 }] });

        console.log("🖼️ Rendering PNG with Resvg...");
        const resvg = new Resvg(svg);
        const pngData = resvg.render().asPng();

        const fileName = `banners/${asin || Date.now()}.png`;
        console.log(`📤 Uploading to Storage: ${fileName}`);

        const { data: uploadData, error: uploadError } = await supabaseClient
            .storage
            .from("banners")
            .upload(fileName, pngData, {
                contentType: "image/png",
                upsert: true,
            });

        if (uploadError) {
            console.error("❌ Upload Error:", uploadError);
            throw uploadError;
        }

        console.log("✅ Upload successful, retrieving Public URL...");
        const { data: { publicUrl } } = supabaseClient
            .storage
            .from("banners")
            .getPublicUrl(fileName);

        console.log(`🔗 Generated URL: ${publicUrl}`);

        return new Response(
            JSON.stringify({ banner_url: publicUrl }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (e: any) {
        console.error("❌ Global Error:", e.message);
        return new Response(JSON.stringify({ error: e.message }), {
            status: 500,
            headers: corsHeaders
        });
    }
});