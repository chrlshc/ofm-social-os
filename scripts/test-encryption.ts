import * as dotenv from 'dotenv';
dotenv.config();

import { encrypt, decrypt } from "../src/lib/crypto";

// Test encryption/decryption
const testToken = "TEST_ACCESS_TOKEN_123456";
console.log("Original token:", testToken);

try {
  const encrypted = encrypt(testToken);
  console.log("Encrypted:", encrypted);
  
  const decrypted = decrypt(encrypted);
  console.log("Decrypted:", decrypted);
  
  console.log("Success:", testToken === decrypted);
} catch (error) {
  console.error("Error:", error);
}