#!/usr/bin/env node
/**
 * Sanity Check for Instagram DM Lines
 * Validates, deduplicates, and exports clean message list
 */

import { readFileSync, writeFileSync } from 'fs';
import Ajv from 'ajv';

// Simple Levenshtein distance implementation
function levenshteinDistance(str1, str2) {
  const matrix = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

// Check if two messages are too similar
function areTooSimilar(msg1, msg2, threshold = 3) {
  const distance = levenshteinDistance(msg1.toLowerCase(), msg2.toLowerCase());
  return distance <= threshold;
}

// Load and validate messages
function validateAndClean() {
  console.log('📋 Loading messages from lines.json...');
  
  // Load messages
  let messages;
  try {
    const rawData = readFileSync('./src/lines.json', 'utf8');
    messages = JSON.parse(rawData);
  } catch (error) {
    console.error('❌ Error loading lines.json:', error.message);
    process.exit(1);
  }
  
  console.log(`📊 Loaded ${messages.length} messages`);
  
  // Load schema
  let schema;
  try {
    const schemaData = readFileSync('./src/lint.jsonschema', 'utf8');
    schema = JSON.parse(schemaData);
  } catch (error) {
    console.error('❌ Error loading lint.jsonschema:', error.message);
    process.exit(1);
  }
  
  // Validate with JSON Schema
  const ajv = new Ajv();
  const validate = ajv.compile(schema);
  
  // Convert messages to objects for validation
  const messageObjects = messages.map(text => {
    const obj = { text };
    
    // Extract placeholders
    const placeholderMatches = text.match(/\{[^}]+\}/g);
    if (placeholderMatches) {
      obj.placeholders = placeholderMatches;
    }
    
    return obj;
  });
  
  const isValid = validate(messageObjects);
  
  if (!isValid) {
    console.error('❌ Schema validation failed:');
    console.error(JSON.stringify(validate.errors, null, 2));
    process.exit(1);
  }
  
  console.log('✅ Schema validation passed');
  
  // Check individual message constraints
  const validMessages = [];
  const errors = [];
  
  messages.forEach((msg, index) => {
    // Length check
    if (msg.length > 120) {
      errors.push(`Message ${index}: Too long (${msg.length} chars): "${msg}"`);
      return;
    }
    
    if (msg.length < 10) {
      errors.push(`Message ${index}: Too short (${msg.length} chars): "${msg}"`);
      return;
    }
    
    // Forbidden terms check
    const forbiddenTerms = [
      'sex', 'sexual', 'services', 'rates', 'price', 'pricing',
      'link', 'http', 'www', '@', 'onlyfans', 'porn', 'adult', 
      'xxx', 'nudes', 'naked', 'explicit'
    ];
    
    const foundForbidden = forbiddenTerms.find(term => 
      msg.toLowerCase().includes(term.toLowerCase())
    );
    
    if (foundForbidden) {
      errors.push(`Message ${index}: Contains forbidden term "${foundForbidden}": "${msg}"`);
      return;
    }
    
    // Emoji check (basic)
    if (/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]/u.test(msg)) {
      errors.push(`Message ${index}: Contains emoji: "${msg}"`);
      return;
    }
    
    validMessages.push(msg);
  });
  
  if (errors.length > 0) {
    console.error('❌ Message validation errors:');
    errors.forEach(error => console.error(error));
    process.exit(1);
  }
  
  console.log(`✅ All ${validMessages.length} messages passed individual validation`);
  
  // Deduplication by Levenshtein distance
  const uniqueMessages = [];
  const duplicates = [];
  
  validMessages.forEach((msg, index) => {
    const isDuplicate = uniqueMessages.some(existingMsg => 
      areTooSimilar(msg, existingMsg, 3)
    );
    
    if (isDuplicate) {
      duplicates.push(`Message ${index}: Too similar to existing: "${msg}"`);
    } else {
      uniqueMessages.push(msg);
    }
  });
  
  if (duplicates.length > 0) {
    console.warn('⚠️  Found similar messages:');
    duplicates.forEach(dup => console.warn(dup));
  }
  
  console.log(`✅ Deduplication complete: ${uniqueMessages.length} unique messages`);
  
  // Export clean messages
  const cleanData = {
    messages: uniqueMessages,
    metadata: {
      total_original: messages.length,
      total_valid: validMessages.length,
      total_unique: uniqueMessages.length,
      duplicates_removed: duplicates.length,
      generated_at: new Date().toISOString(),
      schema_version: "1.0",
      compliance: "instagram_dm_2025"
    }
  };
  
  writeFileSync('./src/lines.clean.json', JSON.stringify(cleanData, null, 2));
  
  console.log('📁 Exported to lines.clean.json');
  console.log('📊 Summary:');
  console.log(`  Original: ${messages.length}`);
  console.log(`  Valid: ${validMessages.length}`);
  console.log(`  Unique: ${uniqueMessages.length}`);
  console.log(`  Success Rate: ${Math.round((uniqueMessages.length / messages.length) * 100)}%`);
  
  return uniqueMessages.length === messages.length;
}

// Run validation
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const allPassed = validateAndClean();
    process.exit(allPassed ? 0 : 1);
  } catch (error) {
    console.error('❌ Sanity check failed:', error.message);
    process.exit(1);
  }
}