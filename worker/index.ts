/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import {currentCollegeFootballSeason, syncSeason, cfbd} from "../lib/dataPipeline";
import {syncWeeklyPlayers} from "../lib/playerPipeline";
import {sundayNoonSlot, withApiPolicy} from "../lib/weeklyApiPolicy";

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
  secured.headers.set("cross-origin-resource-policy", "same-origin");
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

    // All visitor routes, including advanced/player detail, read stored data only.
    if(request.method !== "GET" && ["/api/refresh","/api/sync","/api/bootstrap","/api/maintenance"].includes(url.pathname))
      return secure(Response.json({status:"scheduled",message:"Stats update Sundays at 12:00 PM Central. Previously published data remains available."},{status:403}));
    return withApiPolicy(env.DB, false, async () => secure(await handler.fetch(request, env, ctx)));
  },
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const slot=sundayNoonSlot(new Date(controller.scheduledTime));
    if(!slot || !env.CFBD_API_KEY)return;
    ctx.waitUntil((async()=>{
      // Permanent slot claim: duplicate cron deliveries and failed runs never retry the API.
      await env.DB.prepare("CREATE TABLE IF NOT EXISTS weekly_stats_runs (slot TEXT PRIMARY KEY,status TEXT NOT NULL,detail TEXT,updated_at TEXT DEFAULT CURRENT_TIMESTAMP)").run();
      const claim=await env.DB.prepare("INSERT OR IGNORE INTO weekly_stats_runs(slot,status) VALUES(?,'running')").bind(slot).run();
      if(!claim.meta.changes)return;
      try {
        await withApiPolicy(env.DB,true,async()=>{
          const season=currentCollegeFootballSeason();
          // Bulk feeds, active season only. No historical archive repairs.
          await syncWeeklyPlayers(env,season);
          await syncSeason(env,season,"scheduled");
          // Shared bulk caches for public player and advanced detail pages.
          for(const path of ["/games/players","/passing/players/season","/rushing/players/season","/ppa/players/games","/stats/player/success/game","/rankings","/passing/teams/season","/passing/teams/games","/passing/players/games","/rushing/teams/season","/rushing/teams/games","/rushing/players/games"])
            await cfbd(path,env.CFBD_API_KEY!,{year:season});
        });
        await env.DB.prepare("UPDATE weekly_stats_runs SET status='complete',updated_at=CURRENT_TIMESTAMP WHERE slot=?").bind(slot).run();
      }catch(error){
        await env.DB.prepare("UPDATE weekly_stats_runs SET status='error',detail=?,updated_at=CURRENT_TIMESTAMP WHERE slot=?").bind(error instanceof Error?error.message:'Refresh failed',slot).run();
      }
    })());
  },
};

export default worker;
