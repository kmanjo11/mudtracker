export class DeleteMessages {
  static deleteMessage(wallets: { wallet: { id: string; address: string } }[]): string {
    if (!wallets || wallets.length === 0) {
      return 'You have no wallets to delete.';
    }

    const walletList = wallets
      .map(w => `• ${w.wallet.address}`)
      .join('\n');

    return `Your tracked wallets:\n${walletList}\n\nSelect a wallet to delete:`;
  }
}