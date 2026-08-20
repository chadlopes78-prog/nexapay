import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function findPublicProduct(productId: string) {
  const supabase = createClient<Database>(
    process.env.SUPABASE_URL ?? "",
    process.env.SUPABASE_PUBLISHABLE_KEY ?? "",
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
  const filter = UUID_RE.test(productId)
    ? `id.eq.${productId},custom_url.eq.${productId}`
    : `custom_url.eq.${productId}`;

  const { data: product, error } = await supabase
    .from("products")
    .select("*, checkouts(*)")
    .or(filter)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[public-product] database lookup failed", {
      code: error.code,
      message: error.message,
      productId,
    });
    return { product: null, checkout: null, defaultPixel: null, lookupError: true };
  }

  if (!product) {
    return { product: null, checkout: null, defaultPixel: null, lookupError: false };
  }

  const checkout = Array.isArray(product.checkouts) ? product.checkouts[0] ?? null : null;
  const { data: defaultPixel, error: pixelError } = product.facebook_pixel_id
    ? { data: null, error: null }
    : await supabase
        .from("pixel_configs")
        .select("fb_pixel_id")
        .eq("user_id", product.user_id)
        .maybeSingle();

  if (pixelError) {
    console.warn("[public-product] default pixel lookup unavailable", {
      code: pixelError.code,
      productId,
    });
  }

  return { product, checkout, defaultPixel: defaultPixel ?? null, lookupError: false };
}