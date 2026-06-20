import app from '../backend/hono';

export const config = { runtime: 'edge' };

export default async function handler(request: Request): Promise<Response> {
  return app.fetch(request);
}
