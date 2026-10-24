import { getIdToken, type User } from 'firebase/auth';
import toast from 'react-hot-toast';
import { ACHIEVEMENT_DEFS } from './achievements';

/**
 * Fire-and-forget call to /api/community/notify after a like, reply or
 * post. Never throws and never blocks the action it follows: a failed
 * notification is a missed ping, not a failed post. When the server says a
 * badge was unlocked, says so.
 */
export function notifyCommunity(user: User, body: { kind: 'like' | 'reply' | 'post'; channelId: string; postId: string; replyId?: string }) {
  void (async () => {
    try {
      const token = await getIdToken(user);
      const res = await fetch('/api/community/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
        keepalive: true,
      });
      if (!res.ok) return;
      const json = (await res.json()) as { newAchievements?: string[] };
      for (const id of json.newAchievements ?? []) {
        const def = ACHIEVEMENT_DEFS.find((d) => d.id === id);
        if (def) toast.success(`${def.icon} Badge unlocked: ${def.title}`, { duration: 5000 });
      }
    } catch { /* silent by design */ }
  })();
}
