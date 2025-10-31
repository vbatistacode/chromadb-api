const apiKey = process.env.API_KEY;
if (!apiKey) {
    throw new Error("API_KEY environment variable is required");
}
export async function authMiddleware(c, next) {
    const providedKey = c.req.header("X-API-Key") ||
        c.req.header("Authorization")?.replace("Bearer ", "");
    if (!providedKey || providedKey !== apiKey) {
        return c.json({ error: "Unauthorized" }, 401);
    }
    await next();
}
