import { publicProcedure } from "../../../create-context";

export const getAdminConfigRoute = publicProcedure.query(() => {
  return {
    hasServerApiKey: !!(process.env.OPENAI_API_KEY?.trim()),
  };
});
