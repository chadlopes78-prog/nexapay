import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { findPublicProduct } from "@/lib/api/product-public.server";

export const getPublicProduct = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ productId: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    return findPublicProduct(data.productId);
  });
