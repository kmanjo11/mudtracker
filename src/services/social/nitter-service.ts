import axios from 'axios';
import * as cheerio from 'cheerio';
import { CircuitBreaker } from '../circuit-breaker/circuit-breaker';

interface TweetAnalysis {
  engagement: number;
  sentiment: number;
  isBot: boolean;
  followers: number;
  accountAge: number;
}

interface Tweet {
  text: string;
  username: string;
  time: string | undefined;
  likes: number;
  retweets: number;
  replies: number;
  engagement: number;
}

interface TokenSocialMetrics {
  mentions: number;
  uniqueUsers: Set<string>;
  engagement: number;
  sentiment: number;
  influencerCount: number;
  botRatio: number;
}

export class NitterService {
  private readonly NITTER_INSTANCES = [
    'https://nitter.net',
    'https://nitter.1d4.us',
    'https://nitter.kavin.rocks',
  ];

  private readonly circuitBreaker: CircuitBreaker;
  private currentInstanceIndex = 0;
  private readonly redis: any;

  constructor(redis?: any) {
    this.circuitBreaker = new CircuitBreaker('nitter', {
      failureThreshold: 3,     // Open after 3 failures
      resetTimeout: 300000,    // Try again after 5 minutes
      monitorInterval: 60000   // Check every minute
    });
    
    this.redis = redis;
  }

  async getTokenMentions(symbol: string, address: string): Promise<{
    mentions: number;
    uniqueUsers: number;
    engagement: number;
  }> {
    try {
      // Check cache first if redis is available
      if (this.redis) {
        const cacheKey = `nitter:mentions:${symbol}:${address.slice(0, 8)}`;
        const cached = await this.redis.get(cacheKey);
        if (cached) {
          return JSON.parse(cached);
        }
      }
      
      // Search for both symbol and address mentions
      const [symbolTweets, addressTweets] = await Promise.all([
        this.searchTweets(symbol),
        this.searchTweets(address.slice(0, 8)) // First 8 chars of address
      ]);

      // Combine and deduplicate tweets
      const uniqueTweets = new Map<string, Tweet>();
      [...symbolTweets, ...addressTweets].forEach(tweet => {
        uniqueTweets.set(tweet.text + tweet.username, tweet);
      });

      // Analyze each tweet
      const analyses = await Promise.all(
        Array.from(uniqueTweets.values()).map(tweet => this.analyzeTweet(tweet))
      );

      // Calculate metrics
      const metrics = this.calculateTokenMetrics(
        Array.from(uniqueTweets.values()),
        analyses
      );

      const result = {
        mentions: uniqueTweets.size,
        uniqueUsers: metrics.uniqueUsers.size,
        engagement: metrics.engagement
      };
      
      // Cache result if redis is available
      if (this.redis) {
        const cacheKey = `nitter:mentions:${symbol}:${address.slice(0, 8)}`;
        await this.redis.set(cacheKey, JSON.stringify(result), 'EX', 300); // Cache for 5 minutes
      }
      
      return result;
    } catch (error) {
      console.error('Error getting token mentions:', error);
      return {
        mentions: 0,
        uniqueUsers: 0,
        engagement: 0
      };
    }
  }

  async analyze(symbol: string): Promise<{
    score: number;
    trending: boolean;
    influencerMentions: number;
    realEngagement: number;
    analysis: string[];
    sentiment: number;
    recentTweets: {
      text: string;
      username: string;
      time: string;
      engagement: number;
    }[];
  }> {
    return this.circuitBreaker.execute(async () => {
      try {
        // Check cache first if redis is available
        if (this.redis) {
          const cacheKey = `nitter:analysis:${symbol}`;
          const cached = await this.redis.get(cacheKey);
          if (cached) {
            return JSON.parse(cached);
          }
        }
        
        // Get tweets mentioning the symbol
        const tweets = await this.searchTweets(symbol);
        
        // Analyze each tweet
        const analyses = await Promise.all(
          tweets.map(tweet => this.analyzeTweet(tweet))
        );
        
        // Calculate metrics
        const score = this.calculateSocialScore(analyses);
        const trending = this.isTrending(analyses);
        const influencerMentions = this.countInfluencerMentions(analyses);
        const realEngagement = this.calculateRealEngagement(analyses);
        
        // Calculate average sentiment
        const sentiment = analyses.reduce((sum, a) => sum + a.sentiment, 0) / 
          (analyses.length || 1);
        
        // Generate analysis points
        const analysis = this.generateAnalysis(
          score,
          trending,
          influencerMentions,
          realEngagement
        );
        
        // Format recent tweets for display
        const recentTweets = tweets.slice(0, 5).map(tweet => ({
          text: tweet.text,
          username: tweet.username,
          time: tweet.time || 'Unknown',
          engagement: tweet.engagement
        }));

        const result = {
          score,
          trending,
          influencerMentions,
          realEngagement,
          analysis,
          sentiment,
          recentTweets
        };
        
        // Cache result if redis is available
        if (this.redis) {
          const cacheKey = `nitter:analysis:${symbol}`;
          await this.redis.set(cacheKey, JSON.stringify(result), 'EX', 300); // Cache for 5 minutes
        }
        
        return result;
      } catch (error) {
        console.error('Nitter analysis error:', error);
        return {
          score: 0,
          trending: false,
          influencerMentions: 0,
          realEngagement: 0,
          analysis: ['Error analyzing social data'],
          sentiment: 0.5,
          recentTweets: []
        };
      }
    });
  }

  async getSentimentTrend(symbol: string, days: number = 7): Promise<{
    trend: number[];
    dates: string[];
    overall: number;
  }> {
    try {
      // Check cache first if redis is available
      if (this.redis) {
        const cacheKey = `nitter:sentiment:trend:${symbol}:${days}`;
        const cached = await this.redis.get(cacheKey);
        if (cached) {
          return JSON.parse(cached);
        }
      }
      
      // In a real implementation, we would query historical data
      // For this example, we'll generate synthetic data
      const trend: number[] = [];
      const dates: string[] = [];
      
      const now = new Date();
      let overall = 0;
      
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        
        // Generate a sentiment value between 0.3 and 0.8
        // with some correlation to previous day
        const prevSentiment = trend.length > 0 ? trend[trend.length - 1] : 0.5;
        const randomChange = (Math.random() - 0.5) * 0.2;
        const sentiment = Math.max(0.3, Math.min(0.8, prevSentiment + randomChange));
        
        trend.push(sentiment);
        dates.push(date.toISOString().split('T')[0]);
        overall += sentiment;
      }
      
      const result = {
        trend,
        dates,
        overall: overall / days
      };
      
      // Cache result if redis is available
      if (this.redis) {
        const cacheKey = `nitter:sentiment:trend:${symbol}:${days}`;
        await this.redis.set(cacheKey, JSON.stringify(result), 'EX', 3600); // Cache for 1 hour
      }
      
      return result;
    } catch (error) {
      console.error('Error getting sentiment trend:', error);
      return {
        trend: Array(days).fill(0.5),
        dates: Array(days).fill(''),
        overall: 0.5
      };
    }
  }

  async getInfluencerMentions(symbol: string): Promise<{
    influencers: {
      username: string;
      followers: number;
      sentiment: number;
      recentTweet: string;
    }[];
    totalMentions: number;
  }> {
    try {
      // Check cache first if redis is available
      if (this.redis) {
        const cacheKey = `nitter:influencers:${symbol}`;
        const cached = await this.redis.get(cacheKey);
        if (cached) {
          return JSON.parse(cached);
        }
      }
      
      // Get tweets mentioning the symbol
      const tweets = await this.searchTweets(symbol);
      
      // Get account metrics for each tweet
      const tweetData = await Promise.all(
        tweets.map(async tweet => {
          const metrics = await this.getAccountMetrics(tweet.username);
          const sentiment = await this.analyzeSentiment(tweet.text);
          
          return {
            username: tweet.username,
            followers: metrics.followers,
            sentiment,
            text: tweet.text
          };
        })
      );
      
      // Filter for influencers (accounts with >10k followers)
      const influencers = tweetData
        .filter(data => data.followers > 10000)
        .map(data => ({
          username: data.username,
          followers: data.followers,
          sentiment: data.sentiment,
          recentTweet: data.text
        }))
        .slice(0, 10); // Limit to top 10
      
      const result = {
        influencers,
        totalMentions: tweets.length
      };
      
      // Cache result if redis is available
      if (this.redis) {
        const cacheKey = `nitter:influencers:${symbol}`;
        await this.redis.set(cacheKey, JSON.stringify(result), 'EX', 1800); // Cache for 30 minutes
      }
      
      return result;
    } catch (error) {
      console.error('Error getting influencer mentions:', error);
      return {
        influencers: [],
        totalMentions: 0
      };
    }
  }

  private async searchTweets(query: string): Promise<Tweet[]> {
    return this.circuitBreaker.execute(async () => {
      const instance = this.NITTER_INSTANCES[this.currentInstanceIndex];
      try {
        const response = await axios.get(`${instance}/search?f=tweets&q=${encodeURIComponent(query)}`);
        const $ = cheerio.load(response.data);
        
        const tweets: Tweet[] = [];
        $('.timeline-item').each((_, element) => {
          const $tweet = $(element);
          const tweet: Tweet = {
            text: $tweet.find('.tweet-content').text().trim(),
            username: $tweet.find('.username').text().trim(),
            time: $tweet.find('.tweet-date a').attr('title'),
            likes: this.parseCount($tweet.find('.icon-heart').parent().text().trim()),
            retweets: this.parseCount($tweet.find('.icon-retweet').parent().text().trim()),
            replies: this.parseCount($tweet.find('.icon-reply').parent().text().trim()),
            engagement: 0 // Will be calculated
          };
          
          // Calculate engagement
          tweet.engagement = (tweet.likes + tweet.retweets * 2 + tweet.replies * 3) / 100;
          
          tweets.push(tweet);
        });
        
        return tweets;
      } catch (error) {
        // Rotate to next instance on failure
        this.currentInstanceIndex = (this.currentInstanceIndex + 1) % this.NITTER_INSTANCES.length;
        throw error;
      }
    });
  }

  private async analyzeTweet(tweet: Tweet): Promise<TweetAnalysis> {
    const [sentiment, accountMetrics] = await Promise.all([
      this.analyzeSentiment(tweet.text),
      this.getAccountMetrics(tweet.username)
    ]);

    return {
      engagement: tweet.engagement,
      sentiment,
      isBot: this.detectBot(tweet),
      ...accountMetrics
    };
  }

  private calculateTokenMetrics(tweets: Tweet[], analyses: TweetAnalysis[]): TokenSocialMetrics {
    const metrics: TokenSocialMetrics = {
      mentions: tweets.length,
      uniqueUsers: new Set(tweets.map(t => t.username)),
      engagement: 0,
      sentiment: 0,
      influencerCount: 0,
      botRatio: 0
    };

    let totalEngagement = 0;
    let totalSentiment = 0;
    let botCount = 0;

    analyses.forEach((analysis, i) => {
      totalEngagement += analysis.engagement;
      totalSentiment += analysis.sentiment;
      
      if (analysis.isBot) botCount++;
      if (analysis.followers > 10000) metrics.influencerCount++;
    });

    metrics.engagement = totalEngagement / (analyses.length || 1);
    metrics.sentiment = totalSentiment / (analyses.length || 1);
    metrics.botRatio = botCount / (analyses.length || 1);

    return metrics;
  }

  private parseCount(text: string): number {
    const num = text.replace(/[^0-9]/g, '');
    return num ? parseInt(num) : 0;
  }

  private detectBot(tweet: Tweet): boolean {
    // Simple bot detection heuristics
    const text = tweet.text.toLowerCase();
    const suspiciousPatterns = [
      'buy now',
      'next moon',
      'guaranteed',
      '100x',
      'dm for signals',
      'join now'
    ];
    
    const containsSuspiciousPattern = suspiciousPatterns.some(pattern => 
      text.includes(pattern)
    );
    
    const hasExcessiveTags = (text.match(/#/g) || []).length > 5;
    const hasExcessiveEmojis = (text.match(/[\u{1F300}-\u{1F9FF}]/gu) || []).length > 5;
    
    return containsSuspiciousPattern || hasExcessiveTags || hasExcessiveEmojis;
  }

  private async analyzeSentiment(text: string): Promise<number> {
    // Simple sentiment analysis
    const positiveWords = ['moon', 'pump', 'buy', 'bullish', 'launch', 'gem', 'gain', 'up', 'rising', 'growth', 'potential', 'opportunity', 'profit', 'winner', 'success'];
    const negativeWords = ['dump', 'scam', 'rug', 'sell', 'bearish', 'dead', 'down', 'falling', 'loss', 'crash', 'avoid', 'risk', 'danger', 'warning', 'fake'];
    
    text = text.toLowerCase();
    
    let score = 0.5; // Neutral starting point
    
    positiveWords.forEach(word => {
      if (text.includes(word)) score += 0.05;
    });
    
    negativeWords.forEach(word => {
      if (text.includes(word)) score -= 0.05;
    });
    
    return Math.max(0, Math.min(1, score));
  }

  private async getAccountMetrics(username: string): Promise<{
    followers: number;
    accountAge: number;
  }> {
    return this.circuitBreaker.execute(async () => {
      // Check cache first if redis is available
      if (this.redis) {
        const cacheKey = `nitter:account:${username}`;
        const cached = await this.redis.get(cacheKey);
        if (cached) {
          return JSON.parse(cached);
        }
      }
      
      const instance = this.NITTER_INSTANCES[this.currentInstanceIndex];
      try {
        const response = await axios.get(`${instance}/${username}`);
        const $ = cheerio.load(response.data);
        
        const followers = this.parseCount($('.followers').first().text());
        const joinDate = $('.profile-joindate').text().trim();
        
        const result = {
          followers,
          accountAge: this.calculateAccountAge(joinDate)
        };
        
        // Cache result if redis is available
        if (this.redis) {
          const cacheKey = `nitter:account:${username}`;
          await this.redis.set(cacheKey, JSON.stringify(result), 'EX', 86400); // Cache for 1 day
        }
        
        return result;
      } catch (error) {
        this.currentInstanceIndex = (this.currentInstanceIndex + 1) % this.NITTER_INSTANCES.length;
        return {
          followers: 0,
          accountAge: 0
        };
      }
    });
  }

  private calculateAccountAge(joinDate: string): number {
    try {
      const date = new Date(joinDate);
      const ageInDays = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
      return Math.max(0, ageInDays);
    } catch {
      return 0;
    }
  }

  private calculateSocialScore(analyses: TweetAnalysis[]): number {
    if (analyses.length === 0) return 0;
    
    let score = 0;
    
    // Real engagement from non-bot accounts
    const realEngagement = analyses
      .filter(a => !a.isBot)
      .reduce((sum, a) => sum + a.engagement, 0);
    
    // Influencer impact
    const influencerCount = analyses
      .filter(a => a.followers > 10000)
      .length;
    
    // Average sentiment
    const avgSentiment = analyses
      .reduce((sum, a) => sum + a.sentiment, 0) / analyses.length;
    
    /
(Content truncated due to size limit. Use line ranges to read in chunks)