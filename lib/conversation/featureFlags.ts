/**
 * Feature Flags & Safe Execution Wrappers for Conversation Engine V2
 */

export interface FeatureFlagContext {
  clinicId?: string;
  agencyId?: string;
  channel?: string;
}

export class ConversationFeatureFlags {
  /**
   * Check if Intent Router V2 is enabled for the given context
   */
  public static isIntentRouterV2Enabled(context?: FeatureFlagContext): boolean {
    const envVal = process.env.INTENT_ROUTER_V2;
    if (envVal === "false" || envVal === "0" || envVal === "disabled") {
      return false;
    }
    return true; // Default to enabled
  }

  /**
   * Check if Conversation State Engine V2 is enabled
   */
  public static isStateEngineV2Enabled(context?: FeatureFlagContext): boolean {
    const envVal = process.env.CONVERSATION_STATE_V2;
    if (envVal === "false" || envVal === "0" || envVal === "disabled") {
      return false;
    }
    return true; // Default to enabled
  }

  /**
   * Execute new engine function with automatic fallback on exception
   */
  public static async executeWithFallback<T>(
    operationName: string,
    primaryFn: () => Promise<T>,
    fallbackFn: () => Promise<T>,
    context?: Record<string, any>
  ): Promise<T> {
    try {
      return await primaryFn();
    } catch (err: any) {
      console.error(`[ConversationEngine] Error in ${operationName} (falling back to legacy):`, {
        error: err?.message || err,
        context
      });
      return await fallbackFn();
    }
  }
}
