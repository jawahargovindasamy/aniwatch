import { cors } from "hono/cors";
import { env } from "./env.js";

const DEFAULT_ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "https://otakustreams.netlify.app",
];

const allowedOrigins = env.ANIWATCH_API_CORS_ALLOWED_ORIGINS
    ? env.ANIWATCH_API_CORS_ALLOWED_ORIGINS.split(",")
    : DEFAULT_ALLOWED_ORIGINS;

export const corsConfig = cors({
    allowMethods: ["GET", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    maxAge: 600,
    credentials: true,
    origin: (requestOrigin) => {
        // If no origin (curl, server-side), allow nothing or "*"
        if (!requestOrigin) return null;

        // Echo back the origin if it is allowed
        if (allowedOrigins.includes(requestOrigin)) return requestOrigin;

        // Otherwise disallow
        return null;
    },
});
