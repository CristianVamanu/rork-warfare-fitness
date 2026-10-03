import { describe, it, expect } from 'vitest';
import { communityBadgesEarned } from './achievements';

describe('community badges', () => {
  it('awards by posts and likes received, never twice', () => {
    expect(communityBadgesEarned([], { communityPosts: 1, likesReceived: 0 })).toEqual(['community_1']);
    expect(communityBadgesEarned(['community_1'], { communityPosts: 10, likesReceived: 10 }).sort()).toEqual(['community_10', 'liked_10']);
    expect(communityBadgesEarned(['community_1', 'community_10', 'liked_10'], { communityPosts: 12, likesReceived: 12 })).toEqual([]);
    expect(communityBadgesEarned([], { communityPosts: 0, likesReceived: 0 })).toEqual([]);
  });
  it('never awards workout or nutrition badges', () => {
    expect(communityBadgesEarned([], { communityPosts: 1000, likesReceived: 1000 }).every((id) => id.startsWith('community_') || id.startsWith('liked_'))).toBe(true);
  });
});
