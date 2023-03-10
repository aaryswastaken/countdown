import fastify from 'fastify';
import view from '@fastify/view';
import ejs from 'ejs';
import jwt from '@fastify/jwt';
import dotenv from 'dotenv';
import { compare } from 'bcrypt';
import FormBody from '@fastify/formbody';
import cookie from '@fastify/cookie';

dotenv.config();

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";

const dev = process.env.PROD != "true";

const server = fastify();

server.register(view, {
    engine: {
        ejs: ejs,
    },
});

server.register(jwt, {
    secret: process.env.APP_SECRET ?? 'thisisasecret',
    cookie: {
        cookieName: 'jwt',
    },
})

server.register(FormBody);

server.register(cookie, {
    secret: process.env.COOKIE_SECRET ?? "cookie_secret",
    hook: 'onRequest',
    parseOptions: {}
});

const ressource_whitelist = [ "main.css", "login.css", "index.css", "favicon.png" ];
const types = {"css": "text/css", "png": "image/png"};

function init_db() {
    console.log("Initialising database");
    try {
        mkdirSync("./cache/");
    } catch {}

    try {
        writeFileSync("./cache/database.json", "{\"users\":[], \"countdowns\": []}");
    } catch {
        console.log("An error happened while trying to create the database... Exiting.")
        process.exit(101);
    }
}

function import_db() {
    return JSON.parse(readFileSync("./cache/database.json"));
}

function save_db() {
    writeFileSync("./cache/database.json", JSON.stringify(database))
}

if (!existsSync("./cache/database.json")) {
    init_db()
}

let database = {};

try {
    database = import_db();
} catch {
    init_db();
    database = import_db();
}

if (!Object.keys(database).includes("users")) {
    database.users = [];
    save_db();
}

if (!Object.keys(database).includes("countdowns")) {
    database.countdowns = [];
    save_db();
}

server.get("/", async (req, res) => {
    if (req.cookies["jwt"] === undefined) {
        res.redirect("/login");
    } else {
        if (await req.jwtVerify({onlyCookie: true})) {
            let decoded = await server.jwt.decode(req.cookies["jwt"]);
            let countdowns = database.countdowns.filter(c => c.user == decoded.username)
            return res.view("/static/index.ejs", { user: decoded, countdowns });
        } else {
            res.redirect("/login?jwt_e");
        }
    }
})

server.get("/login", (req, res) => {
    let login_error = Object.entries(req.query).map(e => e[0])[0];

    let reason = undefined;

    if (login_error == "jwt_e") {
        reason = "Token Error";
    } else if (login_error == "pwd_e") {
        reason = "Wrong Password";
    } else if (login_error == "u_e") {
        reason = "Unknown user";
    }

    res.view("/static/login.ejs", { reason });
})

server.get("/static/:ressource_name", (req, res) => {
    const { ressource_name } = req.params;

    if (ressource_whitelist.includes(ressource_name)) {
        let s = ressource_name.split(".");
        if (Object.keys(types).includes(s[s.length - 1])) {
            res.header("Content-type", types[s[s.length-1]])
        }
        res.send(readFileSync("./static/"+ressource_name));
    } else {
        res.code(401);
        res.send("Unauthorized");
    }
})

server.get("/api/countdowns", async (req, res) => {
    if (req.cookies["jwt"] === undefined) {
        res.code(401).send("No authorisation token")
    } else {
        if (await req.jwtVerify({onlyCookie: true})) {
            let decoded = server.jwt.decode(req.cookies["jwt"]);
            
            res.send(database.countdowns.filter(c => c.user == decoded.username));
        } else {
            res.code(401).send("Wrong authorisation token")
        }
    }
})

server.post("/api/countdowns/edit/:id", async (req, res) => {
    if (req.cookies["jwt"] === undefined) {
        res.code(401).send("No authorisation token")
    } else {
        if (await req.jwtVerify({onlyCookie: true})) {
            let { id } = req.params;
            let { new_epoch, new_name } = req.query;
            let decoded = server.jwt.decode(req.cookies["jwt"]);
            
            // Check if countdown id is from user:
            let countdown = database.countdowns.filter(c => c.id == id)[0];

            if (countdown.user == decoded.username) {
                // Proceed

                database.countdowns = database.countdowns.map(c => {
                    if (c.id == id) {
                        c.end = parseInt(new_epoch) || c.end;
                        c.name = new_name || c.name;
                    }

                    return c
                });

                save_db();

                res.code(200).send("Ok");
            } else {
                res.code(401).send("Unauthorized edit")
            }
        } else {
            res.code(401).send("Wrong authorisation token")
        }
    }
});

server.post("/api/countdowns/new", async (req, res) => {
    if (req.cookies["jwt"] === undefined) {
        res.code(401).send("No authorisation token")
    } else {
        if (await req.jwtVerify({onlyCookie: true})) {
            let decoded = server.jwt.decode(req.cookies["jwt"]);
            
            let lastId;

            if (database.countdowns.length == 0) {
                lastId = 0;
            } else {
                lastId = Math.max(...(database.countdowns.map(c => c.id)));
            }

            database.countdowns.push({ user: decoded.username, id: lastId+1, end: Date.now(), name: "New Countdown" })

            save_db();

            res.code(200).send("Ok");
        } else {
            res.code(401).send("Wrong authorisation token")
        }
    }
});

server.post("/api/countdowns/delete/:id", async (req, res) => {
    if (req.cookies["jwt"] === undefined) {
        res.code(401).send("No authorisation token")
    } else {
        if (await req.jwtVerify({onlyCookie: true})) {
            let { id } = req.params;
            let decoded = server.jwt.decode(req.cookies["jwt"]);

            if (database.countdowns.filter(c => c.id == id)[0].user == decoded.username) {
                database.countdowns = database.countdowns.filter(c => c.id != id);

                save_db();

                res.code(200).send("Ok");
            } else {
                res.code(401).send("Unauthorized");
            }
        } else {
            res.code(401).send("Wrong authorisation token")
        }
    }
});

server.post("/authenticate", {
    schema: {
        body: {
            type: 'object',
            properties: {
                username: {
                    type: 'string',
                },
                password: {
                    type: 'string',
                },
                redirect_uri: {
                    type: 'string',
                }
            },
            required: ['username', 'password'],
        },
    }},
    async (req, res) => {
        let { username, password, redirect_uri } = req.body;

        if (database.users.map(u => u.username).includes(username)) {
            let user = database.users.filter(u => u.username == username)[0];
            let match = await compare(password, user.hash);

            if (match) {
                const token = await res.jwtSign({ username: user.username, display_name: user.display_name})
                res.setCookie("jwt", token).redirect(redirect_uri ?? "/");
            } else {
                res.redirect("/login?pwd_e");
            }
        } else {
            res.redirect("/login?u_e");
        }
    }
);

server.get("/api/isalive", (req, res) => {
    res.code(200).send("Ok");
});

server.get("/api/refresh_db", (req, res) => {
    database = import_db();

    res.code(200).send("Ok");
})

server.get("/logout", (req, res) => {
    res.clearCookie("jwt");
})

server.listen({ host: dev ? "127.0.0.1":"0.0.0.0", port: dev ? 8080:80 }, (err, address) => {
    if (err) {
        console.error(err)
        process.exit(1)
    }
    console.log(`Server listening at ${address}`)
})