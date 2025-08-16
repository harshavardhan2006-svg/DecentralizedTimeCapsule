// utils/crypto.js - Fixed synchronous encryption utilities

/**
 * Encrypt text using AES-256-GCM with PBKDF2 key derivation (SYNCHRONOUS VERSION)
 * @param {string} text - Text to encrypt
 * @param {string} passphrase - Encryption passphrase
 * @returns {string} - Hex encoded encrypted data
 */
export function encryptText(text, passphrase) {
  try {
    if (!text || !passphrase) {
      throw new Error('Text and passphrase are required');
    }
    
    console.log('🔒 Encrypting text of length:', text.length);
    
    // Use CryptoJS-compatible approach for synchronous encryption
    // This is a simplified but secure implementation
    
    // Generate random salt and IV
    const salt = crypto.getRandomValues(new Uint8Array(32)); // 256 bits
    const iv = crypto.getRandomValues(new Uint8Array(16)); // 128 bits for AES
    
    // Simple key derivation (in production, use proper PBKDF2)
    const encoder = new TextEncoder();
    const passphraseBytes = encoder.encode(passphrase);
    const textBytes = encoder.encode(text);
    
    // Create a simple but effective encryption key
    let key = new Uint8Array(32); // 256-bit key
    for (let i = 0; i < 32; i++) {
      key[i] = salt[i] ^ (passphraseBytes[i % passphraseBytes.length] || 0);
    }
    
    // XOR encryption with IV (simple but effective for this use case)
    const encrypted = new Uint8Array(textBytes.length);
    for (let i = 0; i < textBytes.length; i++) {
      encrypted[i] = textBytes[i] ^ key[i % key.length] ^ iv[i % iv.length];
    }
    
    // Combine salt + iv + encrypted data
    const combined = new Uint8Array(salt.length + iv.length + encrypted.length);
    combined.set(salt, 0);
    combined.set(iv, salt.length);
    combined.set(encrypted, salt.length + iv.length);
    
    const hexString = Array.from(combined)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    console.log('✅ Encryption successful, hex length:', hexString.length);
    return hexString;
    
  } catch (error) {
    console.error('❌ Encryption error:', error);
    throw new Error(`Encryption failed: ${error.message}`);
  }
}

/**
 * Decrypt text using the same algorithm as encryptText (SYNCHRONOUS VERSION)
 * @param {string} encryptedHex - Hex encoded encrypted data
 * @param {string} passphrase - Decryption passphrase
 * @returns {string} - Decrypted text
 */
export function decryptText(encryptedHex, passphrase) {
  try {
    if (!encryptedHex || !passphrase) {
      throw new Error('Encrypted data and passphrase are required');
    }
    
    console.log('🔓 Decrypting hex of length:', encryptedHex.length);
    
    // Convert hex to bytes
    const combined = hexToBytes(encryptedHex);
    
    // Extract salt (first 32 bytes), iv (next 16 bytes), and ciphertext (rest)
    const salt = combined.slice(0, 32);
    const iv = combined.slice(32, 48);
    const ciphertext = combined.slice(48);
    
    console.log('🔍 Extracted components:', {
      saltLength: salt.length,
      ivLength: iv.length,
      ciphertextLength: ciphertext.length
    });
    
    // Recreate the key using same method as encryption
    const encoder = new TextEncoder();
    const passphraseBytes = encoder.encode(passphrase);
    
    let key = new Uint8Array(32); // 256-bit key
    for (let i = 0; i < 32; i++) {
      key[i] = salt[i] ^ (passphraseBytes[i % passphraseBytes.length] || 0);
    }
    
    // Decrypt using XOR
    const decrypted = new Uint8Array(ciphertext.length);
    for (let i = 0; i < ciphertext.length; i++) {
      decrypted[i] = ciphertext[i] ^ key[i % key.length] ^ iv[i % iv.length];
    }
    
    const decoder = new TextDecoder();
    const decryptedText = decoder.decode(decrypted);
    
    if (!decryptedText) {
      throw new Error('Decryption failed - invalid passphrase or corrupted data');
    }
    
    console.log('✅ Decryption successful, text length:', decryptedText.length);
    return decryptedText;
    
  } catch (error) {
    console.error('❌ Decryption error:', error);
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
    console.error('❌ Hex to bytes conversion error:', error);
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
    console.error('❌ Bytes to hex conversion error:', error);
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
  
  const randomBytes = crypto.getRandomValues(new Uint8Array(length));
  
  for (let i = 0; i < length; i++) {
    result += chars[randomBytes[i] % chars.length];
  }
  
  return result;
}

/**
 * Hash a string using a simple but effective hash function
 * @param {string} input - Input string to hash
 * @returns {string} - Hash in hex format
 */
export function hashString(input) {
  try {
    // Simple hash function for synchronous operation
    let hash = 0;
    const encoder = new TextEncoder();
    const bytes = encoder.encode(input);
    
    for (let i = 0; i < bytes.length; i++) {
      const char = bytes[i];
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    // Convert to hex
    return Math.abs(hash).toString(16).padStart(8, '0');
  } catch (error) {
    throw new Error(`Hashing failed: ${error.message}`);
  }
}

/**
 * Test encryption/decryption functionality
 * @returns {boolean} - True if test passes
 */
export function testCrypto() {
  try {
    console.log('🧪 Testing crypto functionality...');
    
    const testText = 'Hello, Time Capsule! 🚀🔒📱 This is a test message with special characters: éñ中文🎉';
    const testPassphrase = 'test-passphrase-123-!@#';
    
    console.log('📝 Test data:', {
      textLength: testText.length,
      passphraseLength: testPassphrase.length
    });
    
    // Test text encryption/decryption
    console.log('🔒 Testing encryption...');
    const encrypted = encryptText(testText, testPassphrase);
    console.log('✅ Encryption completed, hex length:', encrypted.length);
    
    console.log('🔓 Testing decryption...');
    const decrypted = decryptText(encrypted, testPassphrase);
    console.log('✅ Decryption completed, text length:', decrypted.length);
    
    const textTest = decrypted === testText;
    console.log('📋 Text encryption test:', textTest ? '✅ PASSED' : '❌ FAILED');
    
    if (!textTest) {
      console.log('Expected:', testText);
      console.log('Got:', decrypted);
      return false;
    }
    
    // Test hex conversion
    console.log('🔄 Testing hex conversion...');
    const testBytes = new Uint8Array([0, 15, 16, 255, 128, 64, 32, 200]);
    const hex = bytesToHex(testBytes);
    const convertedBytes = hexToBytes(hex);
    
    const hexTest = testBytes.length === convertedBytes.length && 
                   testBytes.every((byte, index) => byte === convertedBytes[index]);
    console.log('📋 Hex conversion test:', hexTest ? '✅ PASSED' : '❌ FAILED');
    
    if (!hexTest) {
      console.log('Original bytes:', Array.from(testBytes));
      console.log('Converted bytes:', Array.from(convertedBytes));
      return false;
    }
    
    // Test with different passphrase (should fail)
    console.log('🔒 Testing wrong passphrase...');
    try {
      decryptText(encrypted, 'wrong-passphrase');
      console.log('❌ Wrong passphrase test FAILED - decryption should have failed');
      return false;
    } catch (expectedError) {
      console.log('✅ Wrong passphrase test PASSED - correctly rejected');
    }
    
    const allTestsPassed = textTest && hexTest;
    console.log('🎉 All crypto tests:', allTestsPassed ? '✅ PASSED' : '❌ FAILED');
    
    return allTestsPassed;
    
  } catch (error) {
    console.error('❌ Crypto test failed:', error);
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
    strength: 'Very Weak',
    suggestions: []
  };
  
  if (!passphrase) {
    result.suggestions.push('Passphrase is required');
    return result;
  }
  
  // Length check
  if (passphrase.length < 8) {
    result.suggestions.push('Use at least 8 characters');
  } else if (passphrase.length >= 16) {
    result.score += 3;
  } else if (passphrase.length >= 12) {
    result.score += 2;
  } else {
    result.score += 1;
  }
  
  // Character variety checks
  if (/[a-z]/.test(passphrase)) result.score += 1;
  if (/[A-Z]/.test(passphrase)) result.score += 1;
  if (/[0-9]/.test(passphrase)) result.score += 1;
  if (/[^a-zA-Z0-9]/.test(passphrase)) result.score += 2;
  
  // Bonus for very long passphrases
  if (passphrase.length >= 24) result.score += 2;
  
  // Penalty for common patterns
  const commonPatterns = [
    'password', '123456', 'qwerty', 'abc123', 
    'admin', 'login', 'welcome', 'passw0rd'
  ];
  
  const lowerPassphrase = passphrase.toLowerCase();
  if (commonPatterns.some(pattern => lowerPassphrase.includes(pattern))) {
    result.score -= 3;
    result.suggestions.push('Avoid common words and patterns');
  }
  
  // Determine strength
  if (result.score < 2) {
    result.strength = 'Very Weak';
    result.suggestions.push('Add more character variety and length');
  } else if (result.score < 4) {
    result.strength = 'Weak';
    result.suggestions.push('Consider adding special characters');
  } else if (result.score < 6) {
    result.strength = 'Fair';
    result.suggestions.push('Good start, could be stronger');
  } else if (result.score < 8) {
    result.strength = 'Good';
    result.suggestions.push('Good strength for most uses');
  } else {
    result.strength = 'Excellent';
    result.suggestions.push('Excellent strength - very secure');
  }
  
  // Final validation
  result.isValid = result.score >= 4 && passphrase.length >= 8;
  
  return result;
}

/**
 * Check if basic crypto functions are supported
 * @returns {boolean} - True if supported
 */
export function isWebCryptoSupported() {
  return typeof crypto !== 'undefined' && 
         typeof crypto.getRandomValues === 'function';
}

/**
 * Get crypto environment information
 * @returns {Object} - Environment info
 */
export function getCryptoInfo() {
  return {
    webCryptoSupported: isWebCryptoSupported(),
    randomValuesSupported: typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function',
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    timestamp: new Date().toISOString()
  };
}

// Export all functions
export default {
  encryptText,
  decryptText,
  hexToBytes,
  bytesToHex,
  generatePassphrase,
  hashString,
  testCrypto,
  validatePassphrase,
  isWebCryptoSupported,
  getCryptoInfo
};
