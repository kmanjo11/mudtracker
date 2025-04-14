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

  constructor() {
    this.circuitBreaker = new CircuitBreaker('nitter', {
      failureThreshold: 3,     // Open after 3 failures
      resetTimeout: 300000,    // Try again after 5 minutes
      monitorInterval: 60000   // Check every minute
    });
  }

  async getTokenMentions(symbol: string, address: string): Promise<{
    mentions: number;
    uniqueUsers: number;
    engagement: number;
  }> {
    try {
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

      return {
        mentions: uniqueTweets.size,
        uniqueUsers: metrics.uniqueUsers.size,
        engagement: metrics.engagement
      };
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
  }> {
    return this.circuitBreaker.execute(async () => {
      try {
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
        
        // Generate analysis points
        const analysis = this.generateAnalysis(
          score,
          trending,
          influencerMentions,
          realEngagement
        );

        return {
          score,
          trending,
          influencerMentions,
          realEngagement,
          analysis
        };
      } catch (error) {
        console.error('Nitter analysis error:', error);
        return {
          score: 0,
          trending: false,
          influencerMentions: 0,
          realEngagement: 0,
          analysis: ['Error analyzing social data']
        };
      }
    });
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

    metrics.engagement = totalEngagement / analyses.length;
    metrics.sentiment = totalSentiment / analyses.length;
    metrics.botRatio = botCount / analyses.length;

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
    const positiveWords = ['moon', 'pump', 'buy', 'bullish', 'launch', 'gem', 'gain'];
    const negativeWords = ['dump', 'scam', 'rug', 'sell', 'bearish', 'dead'];
    
    text = text.toLowerCase();
    
    let score = 0.5; // Neutral starting point
    
    positiveWords.forEach(word => {
      if (text.includes(word)) score += 0.1;
    });
    
    negativeWords.forEach(word => {
      if (text.includes(word)) score -= 0.1;
    });
    
    return Math.max(0, Math.min(1, score));
  }

  private async getAccountMetrics(username: string): Promise<{
    followers: number;
    accountAge: number;
  }> {
    return this.circuitBreaker.execute(async () => {
      const instance = this.NITTER_INSTANCES[this.currentInstanceIndex];
      try {
        const response = await axios.get(`${instance}/${username}`);
        const $ = cheerio.load(response.data);
        
        const followers = this.parseCount($('.followers').first().text());
        const joinDate = $('.profile-joindate').text().trim();
        
        return {
          followers,
          accountAge: this.calculateAccountAge(joinDate)
        };
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
    
    // Calculate final score
    score += (realEngagement / 1000) * 30; // Up to 30 points
    score += (influencerCount * 10); // 10 points per influencer
    score += (avgSentiment / 100) * 40; // Up to 40 points
    
    return Math.min(score, 100);
  }

  private isTrending(analyses: TweetAnalysis[]): boolean {
    const totalEngagement = analyses
      .reduce((sum, a) => sum + a.engagement, 0);
    
    return totalEngagement > 1000;
  }

  private countInfluencerMentions(analyses: TweetAnalysis[]): number {
    return analyses
      .filter(a => a.followers > 10000 && !a.isBot)
      .length;
  }

  private calculateRealEngagement(analyses: TweetAnalysis[]): number {
    return analyses
      .filter(a => !a.isBot)
      .reduce((sum, a) => sum + a.engagement, 0);
  }

  private generateAnalysis(
    score: number,
    trending: boolean,
    influencerMentions: number,
    realEngagement: number
  ): string[] {
    const analysis = [];
    
    if (trending) {
      analysis.push('• Currently trending on Twitter');
    }
    
    if (influencerMentions > 0) {
      analysis.push(`• ${influencerMentions} verified influencer mentions`);
    }
    
    if (realEngagement > 1000) {
      analysis.push('• Strong organic engagement');
    }
    
    if (score > 80) {
      analysis.push('• Very positive social sentiment');
    } else if (score > 60) {
      analysis.push('• Positive social sentiment');
    }
    
    return analysis;
  }
}
