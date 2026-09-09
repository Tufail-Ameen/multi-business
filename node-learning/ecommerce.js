const crypto = require("crypto");
const { promisify } = require("util");
const express = require("express");
const cors = require("cors");
const { MongoClient } = require("mongodb");

const scrypt = promisify(crypto.scrypt);

const app = express();
app.use(cors({ origin: "http://localhost:3000" }));
app.use(express.json());

let db;

async function nextId(collectionName) {
  const last = await db
    .collection(collectionName)
    .find()
    .sort({ id: -1 })
    .limit(1)
    .toArray();

  return last.length ? last[0].id + 1 : 1;
}

const PASSWORD_KEY_LENGTH = 64;

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = await scrypt(password, salt, PASSWORD_KEY_LENGTH);
  return `${salt}:${derivedKey.toString("hex")}`;
}

async function verifyPassword(password, storedHash) {
  if (!storedHash || typeof storedHash !== "string" || !storedHash.includes(":")) {
    return false;
  }

  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) {
    return false;
  }

  const derivedKey = await scrypt(password, salt, PASSWORD_KEY_LENGTH);
  const hashBuffer = Buffer.from(hash, "hex");
  const derivedBuffer = Buffer.from(derivedKey);

  if (hashBuffer.length !== derivedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(hashBuffer, derivedBuffer);
}

app.post("/register", async (req, res) => {
  const {
    firstname,
    lastname,
    email,
    phone,
    password,
    confirmpassword,
  } = req.body;

  if (
    !firstname ||
    !lastname ||
    !email ||
    !phone ||
    !password ||
    !confirmpassword
  ) {
    res.status(400).json({
      message:
        "firstname, lastname, email, phone, password, and confirmpassword are required",
    });
    return;
  }

  if (password !== confirmpassword) {
    res.status(400).json({ message: "password and confirmpassword do not match" });
    return;
  }

  if (password.length < 6) {
    res.status(400).json({ message: "password must be at least 6 characters" });
    return;
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    res.status(400).json({ message: "invalid email format" });
    return;
  }

  const existingUser = await db
    .collection("users")
    .findOne({ email: normalizedEmail });

  if (existingUser) {
    res.status(409).json({ message: "email already registered" });
    return;
  }

  const newUser = {
    id: await nextId("users"),
    firstname: String(firstname).trim(),
    lastname: String(lastname).trim(),
    email: normalizedEmail,
    phone: String(phone).trim(),
    password: await hashPassword(password),
    createdAt: new Date(),
  };

  await db.collection("users").insertOne(newUser);

  const { password: _, ...userWithoutPassword } = newUser;
  res.status(201).json(userWithoutPassword);
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ message: "email and password are required" });
    return;
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  const user = await db.collection("users").findOne({ email: normalizedEmail });

  if (!user || !(await verifyPassword(password, user.password))) {
    res.status(401).json({ message: "invalid email or password" });
    return;
  }

  const { password: _, ...userWithoutPassword } = user;
  res.json(userWithoutPassword);
});

app.get("/", (req, res) => {
  res.json({ message: "Ecommerce API is running" });
});

app.get("/products", async (req, res) => {
  const products = await db.collection("products").find().toArray();
  res.json(products);
});

app.get("/products/:id", async (req, res) => {
  const product = await db
    .collection("products")
    .findOne({ id: Number(req.params.id) });

  if (!product) {
    res.status(404).json({ message: "Product not found" });
    return;
  }

  res.json(product);
});

app.post("/products", async (req, res) => {
  const data = req.body;

  if (!data.name || data.price === undefined) {
    res.status(400).json({ message: "name and price are required" });
    return;
  }

  const newProduct = {
    id: await nextId("products"),
    name: data.name,
    description: data.description || "",
    price: Number(data.price),
    stock: data.stock === undefined ? 0 : Number(data.stock),
    category: data.category || "",
    createdAt: new Date(),
  };

  await db.collection("products").insertOne(newProduct);
  res.status(201).json(newProduct);
});

app.put("/products/:id", async (req, res) => {
  const id = Number(req.params.id);
  const data = req.body;

  const result = await db.collection("products").updateOne(
    { id: id },
    {
      $set: {
        name: data.name,
        description: data.description,
        price: Number(data.price),
        stock: Number(data.stock),
        category: data.category,
      },
    }
  );

  if (result.matchedCount === 0) {
    res.status(404).json({ message: "Product not found" });
    return;
  }

  const updated = await db.collection("products").findOne({ id: id });
  res.json(updated);
});

app.delete("/products/:id", async (req, res) => {
  const id = Number(req.params.id);

  const result = await db.collection("products").deleteOne({ id: id });

  if (result.deletedCount === 0) {
    res.status(404).json({ message: "Product not found" });
    return;
  }

  res.json({ message: "Product deleted", id: id });
});

app.get("/orders", async (req, res) => {
  const orders = await db.collection("orders").find().toArray();
  res.json(orders);
});

app.get("/orders/:id", async (req, res) => {
  const order = await db
    .collection("orders")
    .findOne({ id: Number(req.params.id) });

  if (!order) {
    res.status(404).json({ message: "Order not found" });
    return;
  }

  res.json(order);
});

app.post("/orders", async (req, res) => {
  const data = req.body;

  if (!data.customerName || !Array.isArray(data.items) || !data.items.length) {
    res
      .status(400)
      .json({ message: "customerName and a non-empty items array are required" });
    return;
  }

  const productIds = data.items.map((item) => Number(item.productId));
  const products = await db
    .collection("products")
    .find({ id: { $in: productIds } })
    .toArray();

  const lines = [];

  for (const item of data.items) {
    const product = products.find((p) => p.id === Number(item.productId));

    if (!product) {
      res.status(400).json({ message: `Product ${item.productId} not found` });
      return;
    }

    const quantity = Number(item.quantity) || 1;

    // Price is copied into the order so later product edits don't change past orders.
    lines.push({
      productId: product.id,
      name: product.name,
      price: product.price,
      quantity: quantity,
      lineTotal: product.price * quantity,
    });
  }

  const newOrder = {
    id: await nextId("orders"),
    customerName: data.customerName,
    email: data.email || "",
    items: lines,
    total: lines.reduce((sum, line) => sum + line.lineTotal, 0),
    status: "pending",
    createdAt: new Date(),
  };

  await db.collection("orders").insertOne(newOrder);
  res.status(201).json(newOrder);
});

app.put("/orders/:id/status", async (req, res) => {
  const id = Number(req.params.id);
  const allowed = ["pending", "paid", "shipped", "delivered", "cancelled"];

  if (!allowed.includes(req.body.status)) {
    res.status(400).json({ message: `status must be one of: ${allowed.join(", ")}` });
    return;
  }

  const result = await db
    .collection("orders")
    .updateOne({ id: id }, { $set: { status: req.body.status } });

  if (result.matchedCount === 0) {
    res.status(404).json({ message: "Order not found" });
    return;
  }

  const updated = await db.collection("orders").findOne({ id: id });
  res.json(updated);
});

async function start() {
  const uri = process.env.MONGODB_URI;

  if (!uri || uri.includes("<db_password>")) {
    console.error("Replace <db_password> in .env with your Atlas database password");
    process.exit(1);
  }

  const mongoClient = new MongoClient(uri);
  await mongoClient.connect();
  db = mongoClient.db("Ecommerce");
  console.log("Connected to Atlas");

  const port = process.env.ECOMMERCE_PORT || 5002;

  app.listen(port, () => {
    console.log(`Ecommerce server running on port ${port}`);
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
