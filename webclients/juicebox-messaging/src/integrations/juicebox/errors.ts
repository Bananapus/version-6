export type JuiceboxPreviewErrorCode =
  | "invalid_request"
  | "unsupported_chain"
  | "project_not_found"
  | "request_too_large"
  | "unsupported_media_type"
  | "service_misconfigured"
  | "upstream_unavailable"
  | "upstream_timeout"
  | "upstream_invalid_response";

export class JuiceboxPreviewError extends Error {
  readonly code: JuiceboxPreviewErrorCode;
  readonly status: number;

  constructor(
    code: JuiceboxPreviewErrorCode,
    status: number,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "JuiceboxPreviewError";
    this.code = code;
    this.status = status;
  }
}

export function invalidPreviewRequest(message: string): JuiceboxPreviewError {
  return new JuiceboxPreviewError("invalid_request", 400, message);
}
