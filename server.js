import fastify from 'fastify';
import view from '@fastify/view';
import ejs from 'ejs';
import jwt from '@fastify/jwt';
import dotenv from 'dotenv';
import { compare } from 'bcrypt';
import FormBody from '@fastify/formbody';
import cookie from '@fastify/cookie';

dotenv.config();

import { readFileSync, writeFileSync, existsSync } from "fs";

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

const ressource_whitelist = [ "main.css", "login.css", "index.css" ];
const types = {"css": "text/css"};

function init_db() {
    writeFileSync("./databse.json", "{\"users\":[], \"countdowns\": []}");
}

function import_db() {
    return JSON.parse(readFileSync("./database.json"));
}

function save_db() {
    writeFileSync("./database.json", JSON.stringify(database))
}

if (!existsSync("./database.json")) {
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
    let { login_error } = req.params;

    res.view("/static/login.ejs", { login_error });
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

            console.log(req.query)

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
})

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

server.get("/logout", (req, res) => {
    res.clearCookie("jwt");
})

server.listen({ port: dev ? 8080:80 }, (err, address) => {
    if (err) {
        console.error(err)
        process.exit(1)
    }
    console.log(`Server listening at ${address}`)
})