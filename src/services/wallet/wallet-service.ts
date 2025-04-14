import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { PhantomService } from './phantom-service';
import * as bs58 from 'bs58';
import { WalletPosition, WalletAllocation, WalletSelectionOptions } from '../../types/wallet-types';

const LAMPORTS_PER_SOL = 1e9;

export enum WalletType {
    PHANTOM = 'phantom',
    BOT_GENERATED = 'bot_generated'
}

interface WalletInfo {
    type: WalletType;
    address: string;
    secretKey?: string; // Only for bot-generated wallets
}

export class WalletService {
    private connection: Connection;
    private phantomService: PhantomService;
    private userWallets: Map<string, WalletInfo>;
    private activeWallets: Map<string, string>; // userId -> active wallet address
    private walletPositions: Map<string, Map<string, WalletPosition>>; // walletAddress -> positionId -> position
    private walletAllocations: Map<string, WalletAllocation[]>; // walletAddress -> allocations

    constructor(connection: Connection) {
        this.connection = connection;
        this.phantomService = new PhantomService(connection);
        this.userWallets = new Map();
        this.activeWallets = new Map();
        this.walletPositions = new Map();
        this.walletAllocations = new Map();
    }

    async createBotWallet(userId: string): Promise<string> {
        // Generate new Solana keypair
        const wallet = Keypair.generate();
        
        // Store wallet info securely
        this.userWallets.set(userId, {
            type: WalletType.BOT_GENERATED,
            address: wallet.publicKey.toString(),
            secretKey: bs58.encode(wallet.secretKey)
        });

        return wallet.publicKey.toString();
    }

    async connectPhantomWallet(userId: string, walletAddress: string): Promise<boolean> {
        const isValid = await this.phantomService.verifyConnection(userId, walletAddress);
        
        if (isValid) {
            this.userWallets.set(userId, {
                type: WalletType.PHANTOM,
                address: walletAddress
            });
        }

        return isValid;
    }

    async signTransaction(userId: string, transaction: Transaction): Promise<Transaction> {
        const walletInfo = this.userWallets.get(userId);
        
        if (!walletInfo) {
            throw new Error('No wallet connected');
        }

        if (walletInfo.type === WalletType.PHANTOM) {
            return this.phantomService.signTransaction(walletInfo.address, transaction);
        } else if (walletInfo.secretKey) {
            // For bot-generated wallets, sign directly
            const keypair = Keypair.fromSecretKey(bs58.decode(walletInfo.secretKey));
            transaction.sign(keypair);
            return transaction;
        } else {
            throw new Error('Invalid wallet configuration: missing secret key');
        }
    }

    async getBalance(userId: string): Promise<number> {
        const walletInfo = this.userWallets.get(userId);
        
        if (!walletInfo) {
            throw new Error('No wallet connected');
        }

        const publicKey = new PublicKey(walletInfo.address);
        const balance = await this.connection.getBalance(publicKey);

        // Subtract allocated funds
        const allocations = this.walletAllocations.get(walletInfo.address) || [];
        const totalAllocated = allocations.reduce((sum, alloc) => sum + alloc.amount, 0);

        return balance - totalAllocated;
    }

    async allocateFunds(walletAddress: string, amount: number, purpose: 'trade' | 'leverage' | 'liquidity'): Promise<boolean> {
        const walletInfo = Array.from(this.userWallets.values()).find(w => w.address === walletAddress);
        if (!walletInfo) throw new Error('Wallet not found');

        const balance = await this.connection.getBalance(new PublicKey(walletAddress));
        if (balance < amount) return false;

        const allocation: WalletAllocation = {
            walletAddress,
            amount,
            type: walletInfo.type,
            purpose,
            timestamp: new Date()
        };

        const allocations = this.walletAllocations.get(walletAddress) || [];
        allocations.push(allocation);
        this.walletAllocations.set(walletAddress, allocations);

        return true;
    }

    async trackPosition(position: WalletPosition): Promise<void> {
        let walletPositions = this.walletPositions.get(position.walletAddress);
        if (!walletPositions) {
            walletPositions = new Map();
            this.walletPositions.set(position.walletAddress, walletPositions);
        }
        walletPositions.set(position.positionId, position);
    }

    async closePosition(walletAddress: string, positionId: string): Promise<void> {
        const walletPositions = this.walletPositions.get(walletAddress);
        if (!walletPositions) return;

        const position = walletPositions.get(positionId);
        if (!position) return;

        position.status = 'closed';
        walletPositions.set(positionId, position);

        // Release allocated funds
        const allocations = this.walletAllocations.get(walletAddress) || [];
        const allocationIndex = allocations.findIndex(a => 
            a.amount === position.amount && a.purpose === position.type);
        
        if (allocationIndex !== -1) {
            allocations.splice(allocationIndex, 1);
            this.walletAllocations.set(walletAddress, allocations);
        }
    }

    async selectWalletForTrade(userId: string, requiredAmount: number, options: WalletSelectionOptions = {}): Promise<string | null> {
        const wallets = Array.from(this.userWallets.values())
            .filter(w => {
                if (options.walletType && w.type !== options.walletType) return false;
                if (options.excludeAddresses?.includes(w.address)) return false;
                return true;
            });

        for (const wallet of wallets) {
            if (options.preferredAddress && wallet.address === options.preferredAddress) {
                const balance = await this.getBalance(userId);
                if (balance >= requiredAmount) return wallet.address;
            }
        }

        for (const wallet of wallets) {
            const balance = await this.connection.getBalance(new PublicKey(wallet.address));
            if (balance >= requiredAmount) return wallet.address;
        }

        return null;
    }

    getWalletType(userId: string): WalletType | null {
        return this.userWallets.get(userId)?.type || null;
    }

    getWalletAddress(userId: string): string | null {
        return this.userWallets.get(userId)?.address || null;
    }

    // Backup and recovery methods for bot-generated wallets
    async exportWallet(userId: string): Promise<string | null> {
        const walletInfo = this.userWallets.get(userId);
        
        if (walletInfo?.type === WalletType.BOT_GENERATED && walletInfo.secretKey) {
            return walletInfo.secretKey;
        }
        
        return null;
    }

    async importWallet(userId: string, secretKey: string): Promise<boolean> {
        try {
            const keypair = Keypair.fromSecretKey(bs58.decode(secretKey));
            
            this.userWallets.set(userId, {
                type: WalletType.BOT_GENERATED,
                address: keypair.publicKey.toString(),
                secretKey: secretKey
            });
            
            return true;
        } catch (error) {
            console.error('Error importing wallet:', error);
            return false;
        }
    }

    async createOrGetSystemWallet(userId: string): Promise<string> {
        const existingWallet = Array.from(this.userWallets.entries())
            .find(([id, info]) => id === userId && info.type === WalletType.BOT_GENERATED);
        
        if (existingWallet) {
            return existingWallet[1].address;
        }

        return this.createBotWallet(userId);
    }

    async getPhantomConnectionQR(userId: string): Promise<string> {
        return this.phantomService.generateConnectionQR(userId);
    }

    async setActiveWallet(userId: string, wallet: WalletInfo): Promise<void> {
        this.activeWallets.set(userId, wallet.address);
        this.userWallets.set(`${userId}:${wallet.address}`, wallet);
    }

    async getActiveWallet(userId: string): Promise<WalletInfo | null> {
        const activeAddress = this.activeWallets.get(userId);
        if (!activeAddress) return null;
        
        const wallet = this.userWallets.get(`${userId}:${activeAddress}`);
        return wallet || null;
    }

    async getUserWallets(userId: string): Promise<WalletInfo[]> {
        return Array.from(this.userWallets.entries())
            .filter(([key]) => key.startsWith(userId + ':'))
            .map(([_, info]) => info);
    }

    async getWalletBalance(address: string): Promise<number> {
        try {
            const publicKey = new PublicKey(address);
            const balance = await this.connection.getBalance(publicKey);
            return balance / LAMPORTS_PER_SOL;
        } catch (error) {
            console.error('Error getting wallet balance:', error);
            return 0;
        }
    }
}
