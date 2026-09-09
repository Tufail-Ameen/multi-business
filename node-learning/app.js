const { start } = require("./app-http");

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
