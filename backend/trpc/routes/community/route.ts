import { z } from 'zod';
import { publicProcedure } from '../../create-context';

// In-memory store — shared across requests on same instance.
// Without a DB this is the best we can do on Vercel serverless.
// Posts survive as long as the instance is warm.
type Post = {
  id: string;
  channelId: string;
  userId: string;
  userName: string;
  userAvatar: string;
  content: string;
  timestamp: string;
  reactions: Record<string, string[]>;
  isEdited: boolean;
  isDeleted: boolean;
  replyToId?: string;
  replyToUserName?: string;
  replyToContent?: string;
  media?: { type: 'image' | 'video'; uri: string };
};

const posts: Post[] = [];
const MAX_POSTS_PER_CHANNEL = 200;

export const listPostsRoute = publicProcedure
  .input(z.object({ channelId: z.string(), since: z.string().optional() }))
  .query(({ input }) => {
    const channel = posts.filter(p => p.channelId === input.channelId && !p.isDeleted);
    if (input.since) {
      return channel.filter(p => p.timestamp > input.since!).slice(-100);
    }
    return channel.slice(-100);
  });

export const sendPostRoute = publicProcedure
  .input(z.object({
    channelId: z.string(),
    userId: z.string(),
    userName: z.string(),
    userAvatar: z.string(),
    content: z.string().max(2000),
    replyToId: z.string().optional(),
    replyToUserName: z.string().optional(),
    replyToContent: z.string().optional(),
    media: z.object({ type: z.enum(['image', 'video']), uri: z.string() }).optional(),
  }))
  .mutation(({ input }) => {
    const post: Post = {
      id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      channelId: input.channelId,
      userId: input.userId,
      userName: input.userName,
      userAvatar: input.userAvatar,
      content: input.content,
      timestamp: new Date().toISOString(),
      reactions: {},
      isEdited: false,
      isDeleted: false,
      replyToId: input.replyToId,
      replyToUserName: input.replyToUserName,
      replyToContent: input.replyToContent,
      media: input.media,
    };
    posts.push(post);
    // Keep memory bounded
    const channelPosts = posts.filter(p => p.channelId === input.channelId);
    if (channelPosts.length > MAX_POSTS_PER_CHANNEL) {
      const oldest = channelPosts[0];
      const idx = posts.findIndex(p => p.id === oldest.id);
      if (idx >= 0) posts.splice(idx, 1);
    }
    return post;
  });

export const reactPostRoute = publicProcedure
  .input(z.object({ postId: z.string(), emoji: z.string(), userId: z.string() }))
  .mutation(({ input }) => {
    const post = posts.find(p => p.id === input.postId);
    if (!post) throw new Error('Post not found');
    if (!post.reactions[input.emoji]) post.reactions[input.emoji] = [];
    const idx = post.reactions[input.emoji].indexOf(input.userId);
    if (idx >= 0) {
      post.reactions[input.emoji].splice(idx, 1);
    } else {
      post.reactions[input.emoji].push(input.userId);
    }
    return post;
  });

export const deletePostRoute = publicProcedure
  .input(z.object({ postId: z.string(), userId: z.string() }))
  .mutation(({ input }) => {
    const post = posts.find(p => p.id === input.postId);
    if (!post) throw new Error('Post not found');
    if (post.userId !== input.userId) throw new Error('Not authorized');
    post.isDeleted = true;
    return { success: true };
  });
