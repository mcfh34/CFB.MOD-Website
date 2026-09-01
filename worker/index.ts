/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { ARCHIVE_REPAIR_COOLDOWN_SECONDS, claimArchiveRepair, currentCollegeFootballSeason, getBackfillStatus, syncArchiveBatch, syncSeason } from "../lib/dataPipeline";
import {
  claimPlayerSync,
  getPlayerArchiveStatus,
  queueActivePlayerSeasonRefresh,
  refreshPlayerProductionBaselineIfNeeded,
  syncPlayerSeasonBatch,
} from "../lib/playerPipeline";
import { maintainDepthChartArchive } from "../lib/depthChartArchive";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  CFBD_API_KEY?: string;
  SYNC_TOKEN?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

function secure(response: Response) {
  const secured = new Response(response.body, response);
  secured.headers.set("content-security-policy", "default-src 'self'; base-uri 'self'; connect-src 'self'; font-src 'self' data:; form-action 'self'; frame-ancestors 'none'; img-src 'self' data: https:; object-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; upgrade-insecure-requests");
  secured.headers.set("permissions-policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  secured.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  secured.headers.set("x-content-type-options", "nosniff");
  secured.headers.set("x-frame-options", "DENY");
  secured.headers.set("cross-origin-opener-policy", "same-origin");
  secured.headers.set("strict-transport-security", "max-age=31536000; includeSubDomains");
  return secured;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return secure(await handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths));
    }

    return secure(await handler.fetch(request, env, ctx));
  },
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil((async () => {
      // This archive uses official documents rather than the CFBD feed, so it
      // remains independently maintainable even when CFBD is unavailable.
      await maintainDepthChartArchive(env.DB).catch(() => null);
      if (!env.CFBD_API_KEY) return;
      const currentSeason = currentCollegeFootballSeason();
      const backfill = await getBackfillStatus(env);
      if (controller.cron === "0 11 * * 1") {
        // The active season always gets the Monday refresh, independent of the
        // historical archive's state.
        await syncSeason(env, currentSeason, "scheduled");
        await queueActivePlayerSeasonRefresh(env, currentSeason);
        return;
      }
      // Each repair run is globally leased and advances a paced batch. This
      // lets one-time history complete even when the hosting tier skips cron
      // deliveries, without allowing overlapping CFBD traffic.
      const repairSeason = backfill.missing[0];
      if (repairSeason && await claimArchiveRepair(env, ARCHIVE_REPAIR_COOLDOWN_SECONDS)) {
        await syncArchiveBatch(env, repairSeason, "scheduled");
        return;
      }
      if (!repairSeason) {
        const playerArchive = await getPlayerArchiveStatus(env);
        const playerSeason = playerArchive.missing[0];
        if (playerSeason && await claimPlayerSync(env)) {
          await syncPlayerSeasonBatch(env, playerSeason).catch(() => null);
        }
        // Percentile ratings depend only on completed player seasons. An
        // unpublished upcoming roster must not block historical normalization.
        await refreshPlayerProductionBaselineIfNeeded(env.DB).catch(() => null);
      }
    })());
  },
};

export default worker;
