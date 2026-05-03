// One-shot dev helper: seeds an admin user and marks setup complete so the
// auth + home flow can be tested without driving the wizard end-to-end.
//
// Usage: node scripts/seed-dev-admin.mjs
//
// Safe to delete once milestone 3 is done — actual admin creation flows through
// /setup in production.

import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const username = "admin";
const email = "admin@audioseerr.local";
const password = "changemeplease";

await prisma.user.upsert({
  where: { username },
  update: {},
  create: {
    username,
    email,
    passwordHash: await bcrypt.hash(password, 10),
    role: "ADMIN",
    requestQuota: 0,
  },
});

await prisma.settings.upsert({
  where: { id: 1 },
  update: { setupComplete: true },
  create: { id: 1, setupComplete: true },
});

console.log(`Seeded admin '${username}' (password: '${password}') and marked setupComplete=true.`);
await prisma.$disconnect();
