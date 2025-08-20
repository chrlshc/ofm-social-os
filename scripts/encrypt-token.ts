import * as dotenv from 'dotenv';
dotenv.config();

import { encrypt } from "../src/lib/crypto";

const token = process.argv[2];
if (!token) {
  console.error("Usage: tsx scripts/encrypt-token.ts <PLAINTEXT_TOKEN>");
  process.exit(1);
}

try {
  const encrypted = encrypt(token);
  console.log(encrypted);
} catch (error) {
  console.error("Error encrypting token:", error);
  process.exit(1);
}