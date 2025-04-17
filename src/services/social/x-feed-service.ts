import { NitterService } from './nitter-service';
import { CircuitBreaker } from '../circuit-breaker/circuit-breaker';

interface XProfile {
  username: string;
  displayName?: string;
  category?: string;
  addedAt: Date;
}

interface XPost {
  id: string;
  username: string;
  displayName: string;
  profileImageUrl: string;
  text: string;
  mediaUrls: string[];
  timestamp: string;
  likes: number;
  retweets: number;
  replies: number;
  sourceUrl: string;
}

export class XFeedService {
  private readonly nitterService: NitterService;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly redis: any;
  private profiles: XProfile[] = [];
  private lastRefresh: Date = new Date(0);
  private cachedFeed: XPost[] = [];
  
  // Default profiles to follow
  private readonly DEFAULT_PROFILES: XProfile[] = [
    { username: 'solana', displayName: 'Solana', category: 'blockchain', addedAt: new Date() },
    { username: 'raydium_io', displayName: 'Raydium', category: 'dex', addedAt: new Date() },
    { username: 'SolanaFloor', displayName: 'Solana Floor', category: 'analytics', addedAt: new Date() },
    { username: 'PumpFunToken', displayName: 'PumpFun', category: 'memecoin', addedAt: new Date() },
    { username: 'SBF_FTX', displayName: 'SBF', category: 'person', addedAt: new Date() },
  ];

  constructor(redis?: any) {
    this.nitterService = new NitterService(redis);
    this.circuitBreaker = new CircuitBreaker('x-feed', {
      failureThreshold: 3,
      resetTimeout: 300000,
      monitorInterval: 60000
    });
    this.redis = redis;
    
    // Initialize with default profiles
    this.profiles = [...this.DEFAULT_PROFILES];
    
    // Load profiles from storage if available
    this.loadProfiles();
  }

  /**
   * Get the latest posts from all followed profiles
   * @param forceRefresh Force a refresh even if cache is recent
   * @returns Array of posts from followed profiles
   */
  async getFeed(forceRefresh: boolean = false): Promise<XPost[]> {
    // Check if we need to refresh (2 minutes cache or force refresh)
    const now = new Date();
    const cacheExpired = (now.getTime() - this.lastRefresh.getTime()) > 120000; // 2 minutes
    
    if (cacheExpired || forceRefresh || this.cachedFeed.length === 0) {
      try {
        await this.refreshFeed();
      } catch (error) {
        console.error('Error refreshing feed:', error);
        // If refresh fails but we have cached data, return it
        if (this.cachedFeed.length > 0) {
          return this.cachedFeed;
        }
        throw error;
      }
    }
    
    return this.cachedFeed;
  }

  /**
   * Refresh the feed by fetching latest posts from all profiles
   */
  private async refreshFeed(): Promise<void> {
    return this.circuitBreaker.execute(async () => {
      // Check cache first if redis is available
      if (this.redis) {
        const cacheKey = 'x-feed:posts';
        const cached = await this.redis.get(cacheKey);
        if (cached) {
          this.cachedFeed = JSON.parse(cached);
          this.lastRefresh = new Date();
          return;
        }
      }
      
      // Fetch posts for each profile
      const allPosts: XPost[] = [];
      
      await Promise.all(
        this.profiles.map(async (profile) => {
          try {
            const profilePosts = await this.getProfilePosts(profile.username);
            allPosts.push(...profilePosts);
          } catch (error) {
            console.error(`Error fetching posts for ${profile.username}:`, error);
          }
        })
      );
      
      // Sort by timestamp (newest first)
      allPosts.sort((a, b) => {
        const dateA = new Date(a.timestamp);
        const dateB = new Date(b.timestamp);
        return dateB.getTime() - dateA.getTime();
      });
      
      // Update cache
      this.cachedFeed = allPosts;
      this.lastRefresh = new Date();
      
      // Store in redis if available
      if (this.redis) {
        const cacheKey = 'x-feed:posts';
        await this.redis.set(cacheKey, JSON.stringify(allPosts), 'EX', 120); // Cache for 2 minutes
      }
    });
  }

  /**
   * Get posts from a specific profile
   * @param username Twitter/X username
   * @returns Array of posts from the profile
   */
  private async getProfilePosts(username: string): Promise<XPost[]> {
    try {
      // Use the Nitter service to search for tweets from this user
      const searchResults = await this.nitterService.searchTweets(`from:${username}`);
      
      // Transform to XPost format
      return searchResults.map(tweet => {
        // Extract media URLs from tweet text (simplified)
        const mediaUrls: string[] = [];
        const mediaRegex = /(https?:\/\/[^\s]+\.(jpg|jpeg|png|gif))/gi;
        let match;
        while ((match = mediaRegex.exec(tweet.text)) !== null) {
          mediaUrls.push(match[0]);
        }
        
        // Create a unique ID based on username and content
        const id = `${username}-${Buffer.from(tweet.text).toString('base64').substring(0, 10)}`;
        
        // Get display name from profiles or use username
        const profile = this.profiles.find(p => p.username.toLowerCase() === username.toLowerCase());
        const displayName = profile?.displayName || username;
        
        return {
          id,
          username,
          displayName,
          profileImageUrl: `https://unavatar.io/twitter/${username}`,
          text: tweet.text,
          mediaUrls,
          timestamp: tweet.time || new Date().toISOString(),
          likes: tweet.likes,
          retweets: tweet.retweets,
          replies: tweet.replies,
          sourceUrl: `https://x.com/${username}/status/${id}`
        };
      });
    } catch (error) {
      console.error(`Error fetching posts for ${username}:`, error);
      return [];
    }
  }

  /**
   * Get all followed profiles
   * @returns Array of followed profiles
   */
  getProfiles(): XProfile[] {
    return [...this.profiles];
  }

  /**
   * Add a new profile to follow
   * @param username Twitter/X username
   * @param displayName Optional display name
   * @param category Optional category
   * @returns True if added successfully
   */
  async addProfile(username: string, displayName?: string, category?: string): Promise<boolean> {
    // Check if profile already exists
    const exists = this.profiles.some(p => p.username.toLowerCase() === username.toLowerCase());
    if (exists) {
      return false;
    }
    
    // Add new profile
    this.profiles.push({
      username,
      displayName,
      category,
      addedAt: new Date()
    });
    
    // Save profiles
    await this.saveProfiles();
    
    // Refresh feed
    this.refreshFeed().catch(console.error);
    
    return true;
  }

  /**
   * Remove a profile from the feed
   * @param username Twitter/X username
   * @returns True if removed successfully
   */
  async removeProfile(username: string): Promise<boolean> {
    const initialLength = this.profiles.length;
    
    // Remove profile
    this.profiles = this.profiles.filter(p => p.username.toLowerCase() !== username.toLowerCase());
    
    // Check if anything was removed
    if (this.profiles.length === initialLength) {
      return false;
    }
    
    // Save profiles
    await this.saveProfiles();
    
    // Refresh feed
    this.refreshFeed().catch(console.error);
    
    return true;
  }

  /**
   * Save profiles to storage
   */
  private async saveProfiles(): Promise<void> {
    if (this.redis) {
      const cacheKey = 'x-feed:profiles';
      await this.redis.set(cacheKey, JSON.stringify(this.profiles));
    }
  }

  /**
   * Load profiles from storage
   */
  private async loadProfiles(): Promise<void> {
    if (this.redis) {
      const cacheKey = 'x-feed:profiles';
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        const loadedProfiles = JSON.parse(cached);
        // Merge with default profiles, avoiding duplicates
        const existingUsernames = new Set(loadedProfiles.map((p: XProfile) => p.username.toLowerCase()));
        const defaultsToAdd = this.DEFAULT_PROFILES.filter(p => !existingUsernames.has(p.username.toLowerCase()));
        this.profiles = [...loadedProfiles, ...defaultsToAdd];
      }
    }
  }

  /**
   * Format a post for display in Telegram
   * @param post The post to format
   * @returns Formatted post text
   */
  formatPostForTelegram(post: XPost): string {
    const header = `<b>@${post.username}</b> (${post.displayName})`;
    const timestamp = `<i>${this.formatTimestamp(post.timestamp)}</i>`;
    const text = post.text.replace(/https?:\/\/[^\s]+/g, '<a href="$&">$&</a>');
    const stats = `❤️ ${post.likes} | 🔄 ${post.retweets} | 💬 ${post.replies}`;
    const source = `<a href="${post.sourceUrl}">View on X.com</a>`;
    
    return `${header}\n${timestamp}\n\n${text}\n\n${stats}\n${source}`;
  }

  /**
   * Format a timestamp for display
   * @param timestamp ISO timestamp
   * @returns Formatted timestamp
   */
  private formatTimestamp(timestamp: string): string {
    try {
      const date = new Date(timestamp);
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      return timestamp;
    }
  }
}
