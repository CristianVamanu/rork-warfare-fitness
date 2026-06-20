import { publicProcedure } from "../../../create-context";

export const listShopProductsProcedure = publicProcedure.query(async () => {
  console.log("[Shop] Listing all products");
  return {
    success: true,
    products: [],
  };
});
