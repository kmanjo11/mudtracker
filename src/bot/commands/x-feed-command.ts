import { Context, Telegraf } from 'telegraf';
import { Update } from 'telegraf/typings/core/types/typegram';
import { BaseCommand } from './base-command';
import { XFeedService } from '../../services/social/x-feed-service';
import { Command } from '../types';
import { X_FEED_MENU } from '../../config/bot-menus';
import { InlineKeyboardMarkup } from 'telegraf/typings/core/types/typegram';

export class XFeedCommand extends BaseCommand implements Command {
  readonly name = 'xfeed';
  readonly description = 'X/Twitter feed interface';
  
  // Default Twitter profiles to follow
  private readonly DEFAULT_PROFILES = [
    { username: 'elonmusk', displayName: 'Elon Musk', category: 'person' },
    { username: 'SolMaxi', displayName: 'SolMaxi', category: 'crypto' },
    { username: 'minchoi', displayName: 'Min Choi', category: 'crypto' },
    { username: '0xsweep', displayName: '0xSweep', category: 'crypto' },
    { username: 'tokenomicsguy', displayName: 'Tokenomics Guy', category: 'crypto' },
    { username: 'notdexrow', displayName: 'NotDexRow', category: 'crypto' },
    { username: 'chargiedao', displayName: 'ChargieDAO', category: 'crypto' },
    { username: 'dr_cintas', displayName: 'Dr. Cintas', category: 'crypto' },
    { username: 'realdonaldtrump', displayName: 'Donald Trump', category: 'person' },
    { username: 'binance', displayName: 'Binance', category: 'exchange' },
    { username: 'solana', displayName: 'Solana', category: 'blockchain' },
    { username: 'moneysignken', displayName: 'Money Sign Ken', category: 'person' }
  ];

  constructor(
    private bot: Telegraf<Context<Update>>,
    private xFeedService: XFeedService
  ) {
    super(bot);
    
    // Initialize the XFeedService with default profiles
    this.initializeProfiles();
  }

  private async initializeProfiles(): Promise<void> {
    try {
      // Get current profiles
      const currentProfiles = this.xFeedService.getProfiles();
      
      // Add default profiles if they don't exist
      for (const profile of this.DEFAULT_PROFILES) {
        const exists = currentProfiles.some(p => 
          p.username.toLowerCase() === profile.username.toLowerCase()
        );
        
        if (!exists) {
          await this.xFeedService.addProfile(
            profile.username,
            profile.displayName,
            profile.category
          );
        }
      }
    } catch (error) {
      console.error('Error initializing X Feed profiles:', error);
    }
  }

  async execute(ctx: Context<Update>): Promise<void> {
    try {
      await this.showXFeed(ctx);
    } catch (error) {
      await this.handleError(ctx, error);
    }
  }

  async handleCallback(ctx: Context<Update>): Promise<void> {
    try {
      if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;

      const callbackData = ctx.callbackQuery.data;
      
      // Split the callback data to handle profile filtering
      const [action, param] = callbackData.split(':');
      
      switch (action) {
        case 'x_feed':
          await this.showXFeed(ctx);
          break;
        case 'refresh_feed':
          await this.showXFeed(ctx, true);
          break;
        case 'filter_profile':
          await this.showFilteredFeed(ctx, param);
          break;
        case 'add_profile':
          await this.promptAddProfile(ctx);
          break;
        case 'remove_profile':
          await this.showRemoveProfileOptions(ctx);
          break;
        case 'confirm_remove_profile':
          await this.removeProfile(ctx, param);
          break;
        case 'manage_profiles':
          await this.showProfileManagement(ctx);
          break;
        case 'back_to_feed':
          await this.showXFeed(ctx);
          break;
        case 'back_to_main':
          // This will be handled by the StartCommand
          break;
      }

      await ctx.answerCbQuery();
    } catch (error) {
      await this.handleError(ctx, error);
    }
  }

  private async showXFeed(ctx: Context<Update>, forceRefresh: boolean = false): Promise<void> {
    try {
      // Show loading message
      await this.editMessage(ctx, '🔄 Loading X Feed...', { parse_mode: 'HTML' });
      
      // Get feed posts
      const posts = await this.xFeedService.getFeed(forceRefresh);
      
      if (posts.length === 0) {
        await this.editMessage(ctx, 
          '📭 No posts found in your X Feed.\n\n' +
          'Try refreshing or adding more profiles to follow.',
          {
            parse_mode: 'HTML',
            reply_markup: this.getXFeedKeyboard()
          }
        );
        return;
      }
      
      // Format the first post for display
      const firstPost = posts[0];
      const formattedPost = this.xFeedService.formatPostForTelegram(firstPost);
      
      // Create a keyboard with navigation options
      const keyboard = this.getPostNavigationKeyboard(0, posts.length);
      
      // Send the post
      await this.editMessage(ctx, formattedPost, {
        parse_mode: 'HTML',
        reply_markup: keyboard,
        disable_web_page_preview: false // Enable preview to show images
      });
    } catch (error) {
      console.error('Error showing X Feed:', error);
      await this.editMessage(ctx, 
        '❌ Error loading X Feed. Please try again later.',
        {
          parse_mode: 'HTML',
          reply_markup: X_FEED_MENU
        }
      );
    }
  }

  private async showFilteredFeed(ctx: Context<Update>, username: string): Promise<void> {
    try {
      // Show loading message
      await this.editMessage(ctx, `🔄 Loading posts from @${username}...`, { parse_mode: 'HTML' });
      
      // Get all posts
      const allPosts = await this.xFeedService.getFeed();
      
      // Filter posts by username
      const filteredPosts = allPosts.filter(post => 
        post.username.toLowerCase() === username.toLowerCase()
      );
      
      if (filteredPosts.length === 0) {
        await this.editMessage(ctx, 
          `📭 No posts found from @${username}.\n\n` +
          'Try refreshing or check back later.',
          {
            parse_mode: 'HTML',
            reply_markup: this.getXFeedKeyboard()
          }
        );
        return;
      }
      
      // Format the first post for display
      const firstPost = filteredPosts[0];
      const formattedPost = this.xFeedService.formatPostForTelegram(firstPost);
      
      // Create a keyboard with navigation options
      const keyboard = this.getFilteredPostNavigationKeyboard(0, filteredPosts.length, username);
      
      // Send the post
      await this.editMessage(ctx, formattedPost, {
        parse_mode: 'HTML',
        reply_markup: keyboard,
        disable_web_page_preview: false // Enable preview to show images
      });
    } catch (error) {
      console.error('Error showing filtered X Feed:', error);
      await this.editMessage(ctx, 
        `❌ Error loading posts from @${username}. Please try again later.`,
        {
          parse_mode: 'HTML',
          reply_markup: X_FEED_MENU
        }
      );
    }
  }

  private async showProfileManagement(ctx: Context<Update>): Promise<void> {
    try {
      const profiles = this.xFeedService.getProfiles();
      
      let message = '👥 *X Feed Profile Management*\n\n';
      message += 'Currently following these profiles:\n\n';
      
      profiles.forEach((profile, index) => {
        message += `${index + 1}. @${profile.username}`;
        if (profile.displayName) {
          message += ` (${profile.displayName})`;
        }
        if (profile.category) {
          message += ` - ${profile.category}`;
        }
        message += '\n';
      });
      
      const keyboard = {
        inline_keyboard: [
          [
            { text: '➕ Add Profile', callback_data: 'add_profile' },
            { text: '➖ Remove Profile', callback_data: 'remove_profile' }
          ],
          [{ text: '🔙 Back to Feed', callback_data: 'back_to_feed' }]
        ]
      };
      
      await this.editMessage(ctx, message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
    } catch (error) {
      console.error('Error showing profile management:', error);
      await this.handleError(ctx, error);
    }
  }

  private async promptAddProfile(ctx: Context<Update>): Promise<void> {
    try {
      const message = 
        '➕ *Add X Profile*\n\n' +
        'To add a new profile to follow, send a message in this format:\n\n' +
        '`/add_profile username [display name] [category]`\n\n' +
        'For example:\n' +
        '`/add_profile vitalik Vitalik Buterin crypto`\n\n' +
        'The display name and category are optional.';
      
      const keyboard = {
        inline_keyboard: [
          [{ text: '🔙 Back to Profile Management', callback_data: 'manage_profiles' }]
        ]
      };
      
      await this.editMessage(ctx, message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
    } catch (error) {
      console.error('Error prompting to add profile:', error);
      await this.handleError(ctx, error);
    }
  }

  private async showRemoveProfileOptions(ctx: Context<Update>): Promise<void> {
    try {
      const profiles = this.xFeedService.getProfiles();
      
      let message = '➖ *Remove X Profile*\n\n';
      message += 'Select a profile to remove from your feed:\n\n';
      
      const keyboard: InlineKeyboardMarkup = {
        inline_keyboard: []
      };
      
      // Create buttons for each profile
      for (let i = 0; i < profiles.length; i += 2) {
        const row = [];
        
        // Add first profile in row
        row.push({
          text: `@${profiles[i].username}`,
          callback_data: `confirm_remove_profile:${profiles[i].username}`
        });
        
        // Add second profile in row if it exists
        if (i + 1 < profiles.length) {
          row.push({
            text: `@${profiles[i + 1].username}`,
            callback_data: `confirm_remove_profile:${profiles[i + 1].username}`
          });
        }
        
        keyboard.inline_keyboard.push(row);
      }
      
      // Add back button
      keyboard.inline_keyboard.push([
        { text: '🔙 Back to Profile Management', callback_data: 'manage_profiles' }
      ]);
      
      await this.editMessage(ctx, message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
    } catch (error) {
      console.error('Error showing remove profile options:', error);
      await this.handleError(ctx, error);
    }
  }

  private async removeProfile(ctx: Context<Update>, username: string): Promise<void> {
    try {
      const success = await this.xFeedService.removeProfile(username);
      
      let message;
      if (success) {
        message = `✅ Successfully removed @${username} from your X Feed.`;
      } else {
        message = `❌ Failed to remove @${username}. Profile not found.`;
      }
      
      const keyboard = {
        inline_keyboard: [
          [{ text: '🔙 Back to Profile Management', callback_data: 'manage_profiles' }]
        ]
      };
      
      await this.editMessage(ctx, message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
    } catch (error) {
      console.error('Error removing profile:', error);
      await this.handleError(ctx, error);
    }
  }

  private getXFeedKeyboard(): InlineKeyboardMarkup {
    return {
      inline_keyboard: [
        [
          { text: '🔄 Refresh Feed', callback_data: 'refresh_feed' },
          { text: '👥 Manage Profiles', callback_data: 'manage_profiles' }
        ],
        [{ text: '🔙 Back to Main Menu', callback_data: 'back_to_main' }]
      ]
    };
  }

  private getPostNavigationKeyboard(currentIndex: number, totalPosts: number): InlineKeyboardMarkup {
    const keyboard: InlineKeyboardMarkup = {
      inline_keyboard: []
    };
    
    // Navigation buttons
    const navRow = [];
    if (currentIndex > 0) {
      navRow.push({ text: '⬅️ Previous', callback_data: `post_nav:${currentIndex - 1}` });
    }
    if (currentIndex < totalPosts - 1) {
      navRow.push({ text: 'Next ➡️', callback_data: `post_nav:${currentIndex + 1}` });
    }
    
    if (navRow.length > 0) {
      keyboard.inline_keyboard.push(navRow);
    }
    
    // Filter options - show top profiles
    const profiles = this.xFeedService.getProfiles().slice(0, 6);
    const filterRows = [];
    
    for (let i = 0; i < profiles.length; i += 3) {
      const row = [];
      for (let j = 0; j < 3 && i + j < profiles.length; j++) {
        const profile = profiles[i + j];
        row.push({
          text: `@${profile.username}`,
          callback_data: `filter_profile:${profile.username}`
        });
      }
      filterRows.push(row);
    }
    
    keyboard.inline_keyboard.push(...filterRows);
    
    // Control buttons
    keyboard.inline_keyboard.push([
      { text: '🔄 Refresh', callback_data: 'refresh_feed' },
      { text: '👥 Profiles', callback_data: 'manage_profiles' }
    ]);
    
    // Back button
    keyboard.inline_keyboard.push([
      { text: '🔙 Back to Main Menu', callback_data: 'back_to_main' }
    ]);
    
    return keyboard;
  }

  private getFilteredPostNavigationKeyboard(currentIndex: number, totalPosts: number, username: string): InlineKeyboardMarkup {
    const keyboard: InlineKeyboardMarkup = {
      inline_keyboard: []
    };
    
    // Navigation buttons
    const navRow = [];
    if (currentIndex > 0) {
      navRow.push({ 
        text: '⬅️ Previous', 
        callback_data: `filter_nav:${username}:${currentIndex - 1}` 
      });
    }
    if (currentIndex < totalPosts - 1) {
      navRow.push({ 
        text: 'Next ➡️', 
        callback_data: `filter_nav:${username}:${currentIndex + 1}` 
      });
    }
    
    if (navRow.length > 0) {
      keyboard.inline_keyboard.push(navRow);
    }
    
    // Control buttons
    keyboard.inline_keyboard.push([
      { text: '🔄 Refresh', callback_data: `filter_profile:${username}` },
      { text: '🔙 All Tweets', callback_data: 'back_to_feed' }
    ]);
    
    // Back button
    keyboard.inline_keyboard.push([
      { text: '🔙 Back to Main Menu', callback_data: 'back_to_main' }
    ]);
    
    return keyboard;
  }
}
