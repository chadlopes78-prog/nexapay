import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

const PUBLIC_PRODUCT_COLUMNS =
  "id, user_id, name, description, price, image_url, checkout_banner_url, category, status, custom_url, warranty_days, delivery_type, facebook_pixel_id, support_number";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// C5: reuse Supabase client across requests (module scope)
let _supabase: ReturnType<typeof createClient<Database>> | null = null;
function getSupabase() {
  if (_supabase) return _supabase;
  _supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
  return _supabase;
}

export const getPublicProduct = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ productId: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const supabase = getSupabase();
    const { productId } = data;
    const isUuid = UUID_RE.test(productId);

    // C4: single query using OR — matches id OR custom_url in one round-trip
    const filter = isUuid
      ? `id.eq.${productId},custom_url.eq.${productId}`
      : `custom_url.eq.${productId}`;

    const { data: product, error } = await supabase
      .from("products")
      .select(PUBLIC_PRODUCT_COLUMNS)
      .or(filter)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Public checkout product lookup failed:", error.message);
    }

    if (!product) {
      return { product: null, checkout: null, defaultPixel: null };
    }

    const [checkoutRes, pixelRes] = await Promise.all([
      supabase.from("checkouts").select("*").eq("product_id", product.id).maybeSingle(),
      product.facebook_pixel_id
        ? Promise.resolve({ data: null })
        : supabase
            .from("pixel_configs")
            .select("fb_pixel_id")
            .eq("user_id", product.user_id)
            .maybeSingle(),
    ]);

    return {
      product,
      checkout: checkoutRes.data ?? null,
      defaultPixel: pixelRes.data ?? null,
    };
  });
