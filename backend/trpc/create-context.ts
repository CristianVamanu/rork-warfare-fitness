import { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { initTRPC } from "@trpc/server";
import superjson from "superjson";

export const createContext = async (opts: FetchCreateContextFnOptions) => {
  return {
    req: opts.req,
  };
};

export type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  const authHeader = ctx.req.headers.get('x-user-data');
  if (!authHeader) {
    throw new Error('Unauthorized: No user data provided');
  }
  
  try {
    const userData = JSON.parse(authHeader);
    if (!userData.isAdmin) {
      throw new Error('Forbidden: Admin access required');
    }
    return next({
      ctx: {
        ...ctx,
        user: userData,
      },
    });
  } catch (e) {
    throw new Error('Unauthorized: Invalid user data');
  }
});
