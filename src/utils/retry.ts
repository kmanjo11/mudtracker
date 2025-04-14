export async function retry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: Error = new Error('No attempts made yet');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof Error) {
        lastError = error;
      } else {
        lastError = new Error(String(error));
      }

      if (attempt === maxAttempts) {
        break;
      }

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
