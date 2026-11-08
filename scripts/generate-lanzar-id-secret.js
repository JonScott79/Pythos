#!/usr/bin/env node
/**
 * scripts/generate-lanzar-id-secret.js
 *
 * Secure Local Provisioning Utility for LANZAR_ID_SECRET.
 *
 * Requirements:
 * - Generates 32 cryptographically random bytes using Node's crypto.randomBytes(32).
 * - Encodes the result as hexadecimal to produce a 64-character secret.
 * - Displays the secret on stdout ONLY when explicitly executed by the operator.
 * - Never writes the secret to disk, configuration files, git history, or client assets.
 * - Detects if LANZAR_ID_SECRET is already configured in the local environment and
 *   warns before generating an unneeded replacement.
 *
 * Usage:
 *   node scripts/generate-lanzar-id-secret.js
 */

const crypto = require('crypto');

function generateSecret() {
  const existing = process.env.LANZAR_ID_SECRET;
  if (existing && existing.trim().length >= 16) {
    console.warn('\n⚠️  WARNING: LANZAR_ID_SECRET is already configured in your current local environment.');
    console.warn('   Generating a new secret is typically unnecessary unless you are rotating credentials.');
    console.warn('   Note: Rotating an active secret will invalidate existing student HMAC sessions (prompting re-login).\n');
  }

  // Generate 32 bytes of cryptographically secure random bytes
  const bytes = crypto.randomBytes(32);
  const secretHex = bytes.toString('hex');

  if (secretHex.length !== 64) {
    throw new Error(`Unexpected secret length: expected 64 hex characters, got ${secretHex.length}`);
  }

  return secretHex;
}

if (require.main === module) {
  const secret = generateSecret();
  console.log('======================================================================');
  console.log('🔐 PYTHOS SECURE PROVISIONING UTILITY — LANZAR_ID_SECRET');
  console.log('======================================================================\n');
  console.log('Generated 64-character cryptographically secure HMAC secret (256 bits entropy):\n');
  console.log(`  ${secret}\n`);
  console.log('Instructions for Operator:');
  console.log('1. Copy the secret string above.');
  console.log('2. Navigate to Railway Dashboard -> Project "pythos-production" -> Service "pythos-backend".');
  console.log('3. Open the "Variables" tab and add:');
  console.log('     Name:  LANZAR_ID_SECRET');
  console.log('     Value: <paste 64-character secret>');
  console.log('4. Click "Add" / "Save" to apply. Railway will restart the container with the secret.');
  console.log('5. Do NOT commit this secret to Git or store it in plain text files.');
  console.log('======================================================================\n');
}

module.exports = {
  generateSecret
};
