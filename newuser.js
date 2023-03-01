import { readFileSync, writeFileSync, existsSync } from "fs";
import { hash } from 'bcrypt';

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

function show_help() {
    console.log("  newuser.js <username> <password> <display name>");
    console.log(" -h for help")
}

if (process.argv.includes("-h") || process.argv.includes("--help") || process.argv.length < 5) {
    show_help();
    process.exit(1);
}

let username = process.argv[2];
let pwd = process.argv[3];
let display = process.argv[4];

console.log("**** CREATING NEW USER ****");
console.log(" Username: "+username);
console.log(" Display name: "+display);
console.log(" Password length: "+pwd.length);

if (database.users.map(u => u.username).includes(username)) {
    console.log("\nUser already exists... Exiting");
    process.exit(1);
}

console.log("\nComputing hash ...");

let computed_hash = await hash(pwd, 10);

console.log("[*] Hash complete");

database.users.push({username, display_name: display, hash: computed_hash});

console.log("[!] Saving database...");
save_db();
console.log("[#] Database saved...");

console.log("*** User created ***");