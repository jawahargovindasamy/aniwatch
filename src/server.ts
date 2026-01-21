import https from "https";

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";

import { log } from "./config/logger.js";
import { corsConfig } from "./config/cors.js";
import { ratelimit } from "./config/ratelimit.js";
import { execGracefulShutdown } from "./utils.js";
import { DeploymentEnv, env, SERVERLESS_ENVIRONMENTS } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./config/errorHandler.js";
import type { ServerContext } from "./config/context.js";

import { hianimeRouter } from "./routes/hianime.js";
import { logging } from "./middleware/logging.js";
import { cacheConfigSetter, cacheControl } from "./middleware/cache.js";

import pkgJson from "../package.json" with { type: "json" };

//
const BASE_PATH = "/api/v2" as const;

const app = new Hono<ServerContext>();

app.use(logging);
app.use(corsConfig);
app.use(cacheControl);

/*
    Rate limiting is applied only if HOSTNAME is set.
*/
const isPersonalDeployment = Boolean(env.ANIWATCH_API_HOSTNAME);
if (isPersonalDeployment) {
    app.use(ratelimit);
}

app.use("/", serveStatic({ root: "public" }));

app.get("/health", (c) => c.text("ok", { status: 200 }));
app.get("/v", async (c) =>
    c.text(
        `api-server: v${"version" in pkgJson && pkgJson?.version ? pkgJson.version : "-1"}\n` +
        `aniwatch-dependency: v${"dependencies" in pkgJson && pkgJson?.dependencies?.aniwatch ? pkgJson?.dependencies?.aniwatch : "-1"}`
    )
);

app.use(cacheConfigSetter(BASE_PATH.length));

app.basePath(BASE_PATH).route("/hianime", hianimeRouter);
app.basePath(BASE_PATH).get("/anicrush", (c) =>
    c.text("Feature not implemented yet.")
);

app.notFound(notFoundHandler);
app.onError(errorHandler);

//
(function () {
    /*
        Skip server instantiation for serverless environments
    */
    if (SERVERLESS_ENVIRONMENTS.includes(env.ANIWATCH_API_DEPLOYMENT_ENV)) {
        return;
    }

    const server = serve({
        port: env.ANIWATCH_API_PORT,
        fetch: app.fetch,
    }).addListener("listening", () =>
        log.info(`API server running at http://localhost:${env.ANIWATCH_API_PORT}`)
    );

    process.on("SIGINT", () => execGracefulShutdown(server));
    process.on("SIGTERM", () => execGracefulShutdown(server));
    process.on("uncaughtException", (err) => {
        log.error(`Uncaught Exception: ${err.message}`);
        execGracefulShutdown(server);
    });
    process.on("unhandledRejection", (reason, promise) => {
        log.error(
            `Unhandled Rejection at: ${promise}, reason: ${reason instanceof Error ? reason.message : reason}`
        );
        execGracefulShutdown(server);
    });

    /*
        Optional: keep-alive for free-tier hosting that sleeps the server.
        Remove this block if not needed.
    */
    if (isPersonalDeployment && env.ANIWATCH_API_DEPLOYMENT_ENV === DeploymentEnv.RENDER) {
        const INTERVAL_DELAY = 8 * 60 * 1000; // 8 minutes
        const url = new URL(`https://${env.ANIWATCH_API_HOSTNAME}/health`);

        setInterval(() => {
            https
                .get(url.href)
                .on("response", () => {
                    log.info(`Health check at ${new Date().toISOString()}`);
                })
                .on("error", (err) =>
                    log.warn(`Health check failed; ${err.message.trim()}`)
                );
        }, INTERVAL_DELAY);
    }
})();

export default app;
