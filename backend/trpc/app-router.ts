import { createTRPCRouter } from "./create-context";
import hiRoute from "./routes/example/hi/route";
import generateProgramWithAiRoute from "./routes/programs/generate-with-ai/route";
import scanFoodRoute from "./routes/food/scan/route";
import aiTrainerChatRoute from "./routes/ai-trainer/chat/route";
import { getAdminConfigRoute, saveAdminSettingsRoute, getAdminSecretsRoute } from "./routes/admin/config/route";

import { createChallengeRoute } from "./routes/challenges/create/route";
import { listChallengesRoute } from "./routes/challenges/list/route";
import { getChallengeRoute } from "./routes/challenges/get/route";
import { updateChallengeRoute } from "./routes/challenges/update/route";
import { deleteChallengeRoute } from "./routes/challenges/delete/route";
import { submitChallengeRoute } from "./routes/challenges/submit/route";
import { getUserSubmissionsRoute } from "./routes/challenges/submissions/route";

import { createShopProductProcedure } from "./routes/shop/create/route";
import { listShopProductsProcedure } from "./routes/shop/list/route";
import { getShopProductProcedure } from "./routes/shop/get/route";
import { updateShopProductProcedure } from "./routes/shop/update/route";
import { deleteShopProductProcedure } from "./routes/shop/delete/route";

export const appRouter = createTRPCRouter({
  example: createTRPCRouter({
    hi: hiRoute,
  }),
  programs: createTRPCRouter({
    generateWithAi: generateProgramWithAiRoute,
  }),

  challenges: createTRPCRouter({
    create: createChallengeRoute,
    list: listChallengesRoute,
    get: getChallengeRoute,
    update: updateChallengeRoute,
    delete: deleteChallengeRoute,
    submit: submitChallengeRoute,
    submissions: getUserSubmissionsRoute,
  }),

  food: createTRPCRouter({
    scan: scanFoodRoute,
  }),

  shop: createTRPCRouter({
    create: createShopProductProcedure,
    list: listShopProductsProcedure,
    get: getShopProductProcedure,
    update: updateShopProductProcedure,
    delete: deleteShopProductProcedure,
  }),

  aiTrainer: createTRPCRouter({
    chat: aiTrainerChatRoute,
  }),

  admin: createTRPCRouter({
    config: getAdminConfigRoute,
    saveSettings: saveAdminSettingsRoute,
    getSecrets: getAdminSecretsRoute,
  }),
});

export type AppRouter = typeof appRouter;
