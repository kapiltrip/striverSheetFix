declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    GITHUB_ENCRYPTION_KEY?: string;
  }
}
