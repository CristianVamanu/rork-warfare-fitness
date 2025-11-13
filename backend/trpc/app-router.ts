import { createTRPCRouter } from "./create-context";
import hiRoute from "./routes/example/hi/route";
import generateProgramWithAiRoute from "./routes/programs/generate-with-ai/route";
import createSubscriptionRoute from "./routes/payments/create-subscription/route";
import createPaymentIntentRoute from "./routes/payments/create-payment-intent/route";
import stripeWebhookRoute from "./routes/webhooks/stripe/route";
import { createChallengeRoute } from "./routes/challenges/create/route";
import { listChallengesRoute } from "./routes/challenges/list/route";
import { getChallengeRoute } from "./routes/challenges/get/route";
import { updateChallengeRoute } from "./routes/challenges/update/route";
import { deleteChallengeRoute } from "./routes/challenges/delete/route";
import { submitChallengeRoute } from "./routes/challenges/submit/route";
import { getUserSubmissionsRoute } from "./routes/challenges/submissions/route";

export const appRouter = createTRPCRouter({
  example: createTRPCRouter({
    hi: hiRoute,
  }),
  programs: createTRPCRouter({
    generateWithAi: generateProgramWithAiRoute,
  }),
  payments: createTRPCRouter({
    createSubscription: createSubscriptionRoute,
    createPaymentIntent: createPaymentIntentRoute,
  }),
  webhooks: createTRPCRouter({
    stripe: stripeWebhookRoute,
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
});

export type AppRouter = typeof appRouter;
