var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var _a;
import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import { initDatabase, generateToken, User, Config } from "@fosscord/util";
import path from "path";
import fetch from "node-fetch";
// apparently dirname doesn't exist in modules, nice
/* https://stackoverflow.com/a/62892482 */
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
app.use(cookieParser());
const port = process.env.PORT;
// ip -> unix epoch that requests will be accepted again
const rateLimits = {};
const allowRequestsEveryMs = 0.5 * 1000; // every half second
const allowedRequestsPerSecond = 50;
let requestsThisSecond = 0;
setInterval(() => {
    requestsThisSecond = 0;
}, 1000);
class Discord {
}
_a = Discord;
Discord.getAccessToken = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { code } = req.query;
    const body = new URLSearchParams(Object.entries({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_SECRET,
        redirect_uri: process.env.DISCORD_REDIRECT,
        code: code,
        grant_type: "authorization_code",
    })).toString();
    const resp = yield fetch("https://discord.com/api/oauth2/token", {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body
    });
    const json = yield resp.json();
    if (json.error)
        return null;
    return {
        access_token: json.access_token,
        token_type: json.token_type,
        expires_in: json.expires_in,
        refresh_token: json.refresh_token,
        scope: json.scope,
    };
});
Discord.getUserDetails = (token) => __awaiter(void 0, void 0, void 0, function* () {
    const resp = yield fetch("https://discord.com/api/users/@me", {
        headers: {
            "Authorization": `Bearer ${token}`,
        }
    });
    const json = yield resp.json();
    if (!json.username || !json.email)
        return null; // eh, deal with bad code later
    return {
        id: json.id,
        email: json.email,
        username: json.username,
    };
});
const handlers = {
    "discord": Discord,
};
app.get("/oauth/:type", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    requestsThisSecond++;
    if (requestsThisSecond > allowedRequestsPerSecond)
        return res.sendStatus(429);
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
    console.log(`${ip}`);
    if (!rateLimits[ip]) {
        rateLimits[ip] = Date.now() + allowRequestsEveryMs;
    }
    else if (rateLimits[ip] > Date.now()) {
        rateLimits[ip] += allowRequestsEveryMs;
        console.log(`${new Date()} : user ${ip} was timed out for ${(rateLimits[ip] - Date.now()) / 1000}s`);
        return res.sendStatus(429);
    }
    else {
        delete rateLimits[ip];
    }
    const { type } = req.params;
    const handler = handlers[type];
    if (!type || !handler)
        return res.sendStatus(400);
    const data = yield handler.getAccessToken(req, res);
    if (!data)
        return res.sendStatus(500);
    const details = yield handler.getUserDetails(data.access_token);
    if (!details)
        return res.sendStatus(500);
    let user = yield User.findOne({ where: { email: details.email } });
    if (!user) {
        user = yield User.register({
            email: details.email,
            username: details.username,
            req
        });
    }
    const token = yield generateToken(user.id);
    res.cookie("token", token);
    res.sendFile(path.join(__dirname, "../public/login.html"));
}));
app.use(express.static("public", { extensions: ["html"] }));
(() => __awaiter(void 0, void 0, void 0, function* () {
    yield initDatabase();
    yield Config.init();
    app.listen(port, () => {
        console.log(`Listening on port ${port}`);
    });
}))();
//# sourceMappingURL=index.js.map