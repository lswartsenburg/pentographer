import Anthropic from "@anthropic-ai/sdk";

/**
 * Converts Anthropic SDK errors and other unknown errors into a short,
 * user-readable string suitable for display in a toast notification.
 */
export function aiErrorMessage(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) {
    return "Invalid or missing API key. Check your ANTHROPIC_API_KEY setting.";
  }
  if (err instanceof Anthropic.RateLimitError) {
    return "AI rate limit reached. Please wait a moment and try again.";
  }
  if (err instanceof Anthropic.APIConnectionTimeoutError) {
    return "The AI request timed out. Please try again.";
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return "Could not reach the AI service. Check your internet connection.";
  }
  if (err instanceof Anthropic.BadRequestError) {
    const msg: string = (err as { message?: string }).message ?? "";
    if (msg.includes("max_tokens")) {
      return "The content is too large to process in a single AI call. Try with a smaller playbook.";
    }
    return `AI request error: ${msg}`;
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return "The API key does not have permission to use this AI model.";
  }
  if (err instanceof Anthropic.InternalServerError) {
    // Status 529 = overloaded, 500 = internal error
    const status = (err as { status?: number }).status;
    if (status === 529) {
      return "AI service is temporarily overloaded. Please try again shortly.";
    }
    return "The AI service returned an internal error. Please try again.";
  }
  if (err instanceof Anthropic.APIError) {
    return `AI API error (${(err as { status?: number }).status ?? "unknown"}). Please try again.`;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}
