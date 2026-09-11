const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath) && typeof process.loadEnvFile === "function") {
  process.loadEnvFile(envPath);
}

const { start } = require("./app-http");

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
