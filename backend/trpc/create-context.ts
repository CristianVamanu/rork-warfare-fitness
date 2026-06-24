import { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { verifyIdToken, isAdminUid } from "../firebase-admin";

export interface AuthUser {
  uid: string;
  id: string;
  email: string;
  isAdmin: boolean;
}

interface Context {
  req: Request;
  user: AuthUser | null;
  [key: string]: unknown;
}

async function resolveUser(req: Request): Promise<AuthUser | null> {
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;
  try {
    const decoded = await verifyIdToken(token);
    const email = (decoded.email ?? '').toLowerCase();
    // Admin = uid matches system/config.adminUid — single source of truth.
    const isAdmin = await isAdminUid(decoded.uid);
    return { uid: decoded.uid, id: decoded.uid, email, isAdmin };
  } catch {
    return null;
  }
}

export const createContext = async (opts: FetchCreateContextFnOptions): Promise<Context> => {
  const user = await resolveUser(opts.req);
  return { req: opts.req, user };
};

export type { Context };

const t = initTRPC.context<Context>().create({ transformer: superjson });

export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;

export const authedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Authentication required' });
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Authentication required' });
  if (!ctx.user.isAdmin) throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
  return next({ ctx: { ...ctx, user: ctx.user } });
});
