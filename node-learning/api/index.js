const { createServerApp } = require("../app-http");

let appPromise;

module.exports = async (req, res) => {
  try {
    appPromise = appPromise || createServerApp();
    const app = await appPromise;
    return app(req, res);
  } catch (error) {
    appPromise = null;
    console.error(error);
    if (res.headersSent) return;
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: error.message || "An unexpected server error occurred",
        },
      })
    );
  }
};
