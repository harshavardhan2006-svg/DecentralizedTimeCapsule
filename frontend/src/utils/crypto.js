// utils/crypto.js - Enhanced encryption utilities for Time Capsule

import CryptoJS from 'crypto-js';

/**
 * Encrypt text using AES encryption
 * @param {string} text - Text to encrypt
 * @param {string} passphrase - Encryption passphrase
 * @returns {string} - Hex encoded encrypted data
 */
export function encryptText(text, passphrase) {
  try {
    if (!text || !passphrase) {
      throw new Error('Text and passphrase are required');
    }
    
    console.log('Encrypting text of length:', text.length);
    
    // Use AES encryption with PBKDF2 key derivation
    const salt = CryptoJS.lib.WordArray.random(128/8);
    const key = CryptoJS.PBKDF2(passphrase, salt, {
      keySize: 256/32,
      iterations: 10000
    });
    
    const iv = CryptoJS.lib.WordArray.random(128/8);
    
    const encrypted = CryptoJS.AES.encrypt(text, key, { 
      iv: iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    });
    
    // Combine salt + iv + encrypted data
    const combined = salt.concat(iv).concat(encrypted.ciphertext);
    const hexString = combined.toString(CryptoJS.enc.Hex);
    
    console.log('Encryption successful, hex length:', hexString.length);
    return hexString;
    
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error(`Encryption failed: ${error.message}`);
  }
}

/**
 * Decrypt text using AES decryption
 * @param {string} encryptedHex - Hex encoded encrypted data
 * @param {string} passphrase - Decryption passphrase
 * @returns {string} - Decrypted text
 */
export function decryptText(encryptedHex, passphrase) {
  try {
    if (!encryptedHex || !passphrase) {
      throw new Error('Encrypted data and passphrase are required');
    }
    
    console.log('Decrypting hex of length:', encryptedHex.length);
    
    // Convert hex to WordArray
    const combined = CryptoJS.enc.Hex.parse(encryptedHex);
    
    // Extract salt (first 16 bytes), iv (next 16 bytes), and ciphertext (rest)
    const salt = CryptoJS.lib.WordArray.create(combined.words.slice(0, 4));
    const iv = CryptoJS.lib.WordArray.create(combined.words.slice(4, 8));
    const ciphertext = CryptoJS.lib.WordArray.create(combined.words.slice(8));
    
    // Derive key using same parameters as encryption
    const key = CryptoJS.PBKDF2(passphrase, salt, {
      keySize: 256/32,
      iterations: 10000
    });
    
    // Create cipher params object
    const cipherParams = CryptoJS.lib.CipherParams.create({
      ciphertext: ciphertext
    });
    
    // Decrypt
    const decrypted = CryptoJS.AES.decrypt(cipherParams, key, {
      iv: iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    });
    
    const decryptedText = decrypted.toString(CryptoJS.enc.Utf8);
    
    if (!decryptedText) {
      throw new Error('Decryption failed - invalid passphrase or corrupted data');
    }
    
    console.log('Decryption successful, text length:', decryptedText.length);
    return decryptedText;
    
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error(`Decryption failed: ${error.message}`);
  }
}

/**
 * Convert hex string to byte array
 * @param {string} hexString - Hex string
 * @returns {Uint8Array} - Byte array
 */
export function hexToBytes(hexString) {
  try {
    if (!hexString) {
      throw new Error('Hex string is required');
    }
    
    // Remove 0x prefix if present
    const cleanHex = hexString.startsWith('0x') ? hexString.slice(2) : hexString;
    
    // Validate hex string
    if (!/^[0-9a-f]+$/i.test(cleanHex)) {
      throw new Error('Invalid hex string format');
    }
    
    if (cleanHex.length % 2 !== 0) {
      throw new Error('Hex string must have even length');
    }
    
    const bytes = new Uint8Array(cleanHex.length / 2);
    
    for (let i = 0; i < cleanHex.length; i += 2) {
      const hexByte = cleanHex.substr(i, 2);
      bytes[i / 2] = parseInt(hexByte, 16);
    }
    
    return bytes;
    
  } catch (error) {
    console.error('Hex to bytes conversion error:', error);
    throw new Error(`Failed to convert hex to bytes: ${error.message}`);
  }
}

/**
 * Convert byte array to hex string
 * @param {Uint8Array|Array} bytes - Byte array
 * @returns {string} - Hex string
 */
export function bytesToHex(bytes) {
  try {
    if (!bytes || bytes.length === 0) {
      throw new Error('Byte array is required');
    }
    
    const hexArray = Array.from(bytes, byte => {
      const hex = byte.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    });
    
    return hexArray.join('');
    
  } catch (error) {
    console.error('Bytes to hex conversion error:', error);
    throw new Error(`Failed to convert bytes to hex: ${error.message}`);
  }
}

/**
 * Generate a secure random passphrase
 * @param {number} length - Length of passphrase (default: 16)
 * @returns {string} - Random passphrase
 */
export function generatePassphrase(length = 16) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let result = '';
  
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * chars.length);
    result += chars[randomIndex];
  }
  
  return result;
}

/**
 * Hash a string using SHA-256
 * @param {string} input - Input string to hash
 * @returns {string} - SHA-256 hash in hex format
 */
export function hashString(input) {
  try {
    const hash = CryptoJS.SHA256(input);
    return hash.toString(CryptoJS.enc.Hex);
  } catch (error) {
    throw new Error(`Hashing failed: ${error.message}`);
  }
}

/**
 * Encrypt file data as base64
 * @param {File} file - File to encrypt
 * @param {string} passphrase - Encryption passphrase
 * @returns {Promise<string>} - Encrypted base64 data as hex
 */
export async function encryptFile(file, passphrase) {
  try {
    console.log(`Encrypting file: ${file.name}`);
    
    // Convert file to base64
    const base64Data = await fileToBase64(file);
    
    // Create file metadata
    const fileData = {
      name: file.name,
      type: file.type,
      size: file.size,
      lastModified: file.lastModified,
      data: base64Data
    };
    
    // Encrypt the entire file data object
    const fileDataJson = JSON.stringify(fileData);
    const encryptedHex = encryptText(fileDataJson, passphrase);
    
    console.log(`File encrypted successfully: ${file.name}`);
    return encryptedHex;
    
  } catch (error) {
    console.error('File encryption error:', error);
    throw new Error(`Failed to encrypt file ${file.name}: ${error.message}`);
  }
}

/**
 * Decrypt file data from hex
 * @param {string} encryptedHex - Encrypted file data as hex
 * @param {string} passphrase - Decryption passphrase
 * @returns {Promise<Blob>} - Decrypted file as Blob
 */
export async function decryptFile(encryptedHex, passphrase) {
  try {
    console.log('Decrypting file data...');
    
    // Decrypt the file data
    const decryptedJson = decryptText(encryptedHex, passphrase);
    const fileData = JSON.parse(decryptedJson);
    
    // Extract base64 data
    const base64Data = fileData.data;
    const base64Content = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
    
    // Convert base64 to blob
    const binaryString = atob(base64Content);
    const bytes = new Uint8Array(binaryString.length);
    
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    const blob = new Blob([bytes], { type: fileData.type });
    
    console.log(`File decrypted successfully: ${fileData.name}`);
    return {
      blob: blob,
      name: fileData.name,
      type: fileData.type,
      size: fileData.size
    };
    
  } catch (error) {
    console.error('File decryption error:', error);
    throw new Error(`Failed to decrypt file: ${error.message}`);
  }
}

/**
 * Convert File to base64
 * @param {File} file - File to convert
 * @returns {Promise<string>} - Base64 string
 */
async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read file as base64'));
    
    reader.readAsDataURL(file);
  });
}

/**
 * Test encryption/decryption functionality
 * @returns {Promise<boolean>} - True if test passes
 */
export async function testCrypto() {
  try {
    console.log('Testing crypto functionality...');
    
    const testText = 'Hello, Time Capsule! This is a test message with special characters: 🎉🔒📱';
    const testPassphrase = 'test-passphrase-123';
    
    // Test text encryption/decryption
    const encrypted = encryptText(testText, testPassphrase);
    const decrypted = decryptText(encrypted, testPassphrase);
    
    const textTest = decrypted === testText;
    console.log('Text encryption test:', textTest ? 'PASSED' : 'FAILED');
    
    if (!textTest) {
      console.log('Expected:', testText);
      console.log('Got:', decrypted);
      return false;
    }
    
    // Test file encryption/decryption
    const testFileContent = 'This is test file content for encryption testing.';
    const testBlob = new Blob([testFileContent], { type: 'text/plain' });
    const testFile = new File([testBlob], 'test.txt', { type: 'text/plain' });
    
    const encryptedFile = await encryptFile(testFile, testPassphrase);
    const decryptedFile = await decryptFile(encryptedFile, testPassphrase);
    const decryptedContent = await decryptedFile.blob.text();
    
    const fileTest = decryptedContent === testFileContent && decryptedFile.name === 'test.txt';
    console.log('File encryption test:', fileTest ? 'PASSED' : 'FAILED');
    
    if (!fileTest) {
      console.log('Expected file content:', testFileContent);
      console.log('Got file content:', decryptedContent);
      console.log('Expected file name: test.txt');
      console.log('Got file name:', decryptedFile.name);
    }
    
    // Test hex conversion
    const testBytes = new Uint8Array([0, 15, 16, 255, 128, 64]);
    const hex = bytesToHex(testBytes);
    const convertedBytes = hexToBytes(hex);
    
    const hexTest = testBytes.length === convertedBytes.length && 
                   testBytes.every((byte, index) => byte === convertedBytes[index]);
    console.log('Hex conversion test:', hexTest ? 'PASSED' : 'FAILED');
    
    const allTestsPassed = textTest && fileTest && hexTest;
    console.log('All crypto tests:', allTestsPassed ? 'PASSED' : 'FAILED');
    
    return allTestsPassed;
    
  } catch (error) {
    console.error('Crypto test failed:', error);
    return false;
  }
}

/**
 * Validate passphrase strength
 * @param {string} passphrase - Passphrase to validate
 * @returns {Object} - Validation result with score and suggestions
 */
export function validatePassphrase(passphrase) {
  const result = {
    isValid: false,
    score: 0,
    suggestions: []
  };
  
  if (!passphrase) {
    result.suggestions.push('Passphrase is required');
    return result;
  }
  
  // Length check
  if (passphrase.length < 8) {
    result.suggestions.push('Use at least 8 characters');
  } else if (passphrase.length >= 12) {
    result.score += 2;
  } else {
    result.score += 1;
  }
  
  // Character variety checks
  if (/[a-z]/.test(passphrase)) result.score += 1;
  if (/[A-Z]/.test(passphrase)) result.score += 1;
  if (/[0-9]/.test(passphrase)) result.score += 1;
  if (/[^a-zA-Z0-9]/.test(passphrase)) result.score += 1;
  
  // Common patterns check
  if (passphrase.toLowerCase().includes('password') || 
      passphrase.toLowerCase().includes('123456') ||
      passphrase === passphrase.toLowerCase() ||
      passphrase === passphrase.toUpperCase()) {
    result.score -= 2;
    result.suggestions.push('Avoid common patterns and dictionary words');
  }
  
  // Final validation
  result.isValid = result.score >= 4 && passphrase.length >= 8;
  
  if (result.score < 2) {
    result.suggestions.push('Very weak - add more character variety');
  } else if (result.score < 4) {
    result.suggestions.push('Weak - consider adding special characters');
  } else if (result.score < 6) {
    result.suggestions.push('Good strength');
  } else {
    result.suggestions.push('Excellent strength');
  }
  
  return result;
}

// Export all functions
export default {
  encryptText,
  decryptText,
  hexToBytes,
  bytesToHex,
  generatePassphrase,
  hashString,
  encryptFile,
  decryptFile,
  testCrypto,
  validatePassphrase
};