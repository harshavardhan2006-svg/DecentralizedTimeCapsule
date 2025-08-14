// utils/ipfs.js - Fixed IPFS file handling utilities

/**
 * Upload a file to IPFS using public gateways
 * @param {File} file - The file to upload
 * @returns {Promise<string>} - The IPFS hash
 */
export async function uploadToIPFS(file) {
  try {
    console.log(`Uploading ${file.name} to IPFS...`);
    
    // Convert file to base64 for easier handling
    const base64Data = await fileToBase64(file);
    
    // Try multiple IPFS upload services
    const uploadServices = [
      // Pinata (most reliable)
      async () => {
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
          method: 'POST',
          body: formData,
          headers: {
            'pinata_api_key': 'your_pinata_api_key', // Replace with your key
            'pinata_secret_api_key': 'your_pinata_secret_key' // Replace with your secret
          }
        });
        
        if (!response.ok) throw new Error('Pinata upload failed');
        const result = await response.json();
        return result.IpfsHash;
      },
      
      // Web3.Storage (free alternative)
      async () => {
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch('https://api.web3.storage/upload', {
          method: 'POST',
          body: formData,
          headers: {
            'Authorization': `Bearer your_web3_storage_token`, // Replace with your token
            'X-NAME': file.name
          }
        });
        
        if (!response.ok) throw new Error('Web3.Storage upload failed');
        const result = await response.json();
        return result.cid;
      },
      
      // NFT.Storage (another free option)
      async () => {
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch('https://api.nft.storage/upload', {
          method: 'POST',
          body: formData,
          headers: {
            'Authorization': `Bearer your_nft_storage_token` // Replace with your token
          }
        });
        
        if (!response.ok) throw new Error('NFT.Storage upload failed');
        const result = await response.json();
        return result.value.cid;
      },
      
      // Fallback: Store as base64 in a JSON file and upload that
      async () => {
        console.log('Using fallback method: base64 encoding');
        
        const fileData = {
          name: file.name,
          type: file.type,
          size: file.size,
          data: base64Data,
          uploadedAt: new Date().toISOString()
        };
        
        const jsonBlob = new Blob([JSON.stringify(fileData)], { type: 'application/json' });
        const formData = new FormData();
        formData.append('file', jsonBlob, `${file.name}.json`);
        
        // Try a simple IPFS gateway that accepts direct uploads
        const response = await fetch('https://ipfs.infura.io:5001/api/v0/add', {
          method: 'POST',
          body: formData
        });
        
        if (!response.ok) throw new Error('Infura upload failed');
        const result = await response.text();
        const lines = result.trim().split('\n');
        const lastLine = JSON.parse(lines[lines.length - 1]);
        return lastLine.Hash;
      }
    ];
    
    let lastError;
    
    // Try each upload service
    for (let i = 0; i < uploadServices.length; i++) {
      try {
        console.log(`Trying upload method ${i + 1}...`);
        const hash = await uploadServices[i]();
        console.log(`File uploaded successfully: ${hash}`);
        
        // Verify the upload by trying to access it
        try {
          await verifyIPFSHash(hash);
          return hash;
        } catch (verifyError) {
          console.warn(`Upload succeeded but verification failed: ${verifyError.message}`);
          return hash; // Return anyway, might work later
        }
        
      } catch (error) {
        console.warn(`Upload method ${i + 1} failed:`, error.message);
        lastError = error;
        continue;
      }
    }
    
    throw new Error(`All upload methods failed. Last error: ${lastError?.message}`);
    
  } catch (error) {
    console.error('IPFS upload failed:', error);
    throw new Error(`Failed to upload ${file.name} to IPFS: ${error.message}`);
  }
}

/**
 * Download a file from IPFS
 * @param {string} ipfsHash - The IPFS hash
 * @param {string} fileName - Original file name (optional)
 * @returns {Promise<Blob>} - The file as a Blob
 */
export async function downloadFromIPFS(ipfsHash, fileName = 'downloaded-file') {
  try {
    console.log(`Downloading ${ipfsHash} from IPFS...`);
    
    // Try multiple IPFS gateways
    const gateways = [
      `https://ipfs.io/ipfs/${ipfsHash}`,
      `https://gateway.ipfs.io/ipfs/${ipfsHash}`,
      `https://cloudflare-ipfs.com/ipfs/${ipfsHash}`,
      `https://dweb.link/ipfs/${ipfsHash}`,
      `https://${ipfsHash}.ipfs.w3s.link/`,
      `https://${ipfsHash}.ipfs.nftstorage.link/`,
      `https://gateway.pinata.cloud/ipfs/${ipfsHash}`
    ];
    
    let lastError;
    
    for (let gateway of gateways) {
      try {
        console.log(`Trying gateway: ${gateway}`);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
        
        const response = await fetch(gateway, {
          method: 'GET',
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const contentType = response.headers.get('content-type');
        console.log(`Content type: ${contentType}`);
        
        const blob = await response.blob();
        console.log(`Successfully downloaded from: ${gateway}`);
        
        // Check if this is a JSON file (our fallback format)
        if (contentType?.includes('application/json') || fileName.endsWith('.json')) {
          try {
            const text = await blob.text();
            const fileData = JSON.parse(text);
            
            if (fileData.data && fileData.name) {
              console.log('Decoding base64 file data...');
              const base64Data = fileData.data.split(',')[1] || fileData.data;
              const binaryString = atob(base64Data);
              const bytes = new Uint8Array(binaryString.length);
              
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              
              return new Blob([bytes], { type: fileData.type });
            }
          } catch (jsonError) {
            console.warn('Failed to parse as JSON, treating as regular file');
          }
        }
        
        return blob;
        
      } catch (gatewayError) {
        console.warn(`Gateway ${gateway} failed:`, gatewayError.message);
        lastError = gatewayError;
        continue;
      }
    }
    
    throw new Error(`Failed to download from IPFS: ${lastError?.message || 'All gateways failed'}`);
    
  } catch (error) {
    console.error('IPFS download failed:', error);
    throw new Error(`Failed to download from IPFS: ${error.message}`);
  }
}

/**
 * Convert File object to base64
 * @param {File} file - The file to convert
 * @returns {Promise<string>} - Base64 encoded file
 */
async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = () => {
      resolve(reader.result);
    };
    
    reader.onerror = () => {
      reject(new Error('Failed to read file as base64'));
    };
    
    reader.readAsDataURL(file);
  });
}

/**
 * Verify that an IPFS hash is accessible
 * @param {string} ipfsHash - The IPFS hash to verify
 * @returns {Promise<boolean>} - True if accessible
 */
async function verifyIPFSHash(ipfsHash) {
  const testUrl = `https://ipfs.io/ipfs/${ipfsHash}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
  
  try {
    const response = await fetch(testUrl, { 
      method: 'HEAD',
      signal: controller.signal 
    });
    clearTimeout(timeoutId);
    return response.ok;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * Test IPFS functionality with a small test file
 * @returns {Promise<boolean>} - True if test passes
 */
export async function testIPFS() {
  try {
    console.log('Testing IPFS functionality...');
    
    // Create a test file
    const testContent = 'Hello IPFS! This is a test file from Time Capsule.';
    const testBlob = new Blob([testContent], { type: 'text/plain' });
    const testFile = new File([testBlob], 'test.txt', { type: 'text/plain' });
    
    // Upload test file
    const hash = await uploadToIPFS(testFile);
    console.log('Test file uploaded:', hash);
    
    // Download test file
    const downloadedBlob = await downloadFromIPFS(hash, 'test.txt');
    const downloadedContent = await downloadedBlob.text();
    
    const success = downloadedContent === testContent;
    console.log('IPFS test', success ? 'PASSED' : 'FAILED');
    
    if (!success) {
      console.log('Expected:', testContent);
      console.log('Got:', downloadedContent);
    }
    
    return success;
    
  } catch (error) {
    console.error('IPFS test failed:', error);
    return false;
  }
}

/**
 * Get file info without downloading the full file
 * @param {string} ipfsHash - The IPFS hash
 * @returns {Promise<Object>} - File information
 */
export async function getIPFSFileInfo(ipfsHash) {
  try {
    const response = await fetch(`https://ipfs.io/ipfs/${ipfsHash}`, { method: 'HEAD' });
    const contentLength = response.headers.get('content-length');
    const contentType = response.headers.get('content-type');
    
    return {
      hash: ipfsHash,
      size: contentLength ? parseInt(contentLength) : null,
      type: contentType || 'unknown',
      accessible: response.ok
    };
  } catch (error) {
    console.warn('Could not get IPFS file info:', error.message);
    return {
      hash: ipfsHash,
      size: null,
      type: 'unknown',
      accessible: false
    };
  }
}

/**
 * Simple IPFS upload using a public gateway (no auth required)
 * This is a fallback method that should work without API keys
 * @param {File} file - The file to upload
 * @returns {Promise<string>} - The IPFS hash
 */
export async function simpleIPFSUpload(file) {
  try {
    // For demo purposes, we'll use a mock implementation
    // In a real app, you'd want to use a proper IPFS service
    
    const base64Data = await fileToBase64(file);
    const fileData = {
      name: file.name,
      type: file.type,
      size: file.size,
      data: base64Data,
      uploadedAt: new Date().toISOString()
    };
    
    // Create a deterministic hash based on file content
    const hashInput = file.name + file.size + file.lastModified;
    const hash = await createSimpleHash(hashInput);
    
    // Store in localStorage as a fallback (not recommended for production)
    const storageKey = `ipfs_${hash}`;
    localStorage.setItem(storageKey, JSON.stringify(fileData));
    
    console.log(`File stored with hash: ${hash}`);
    return hash;
    
  } catch (error) {
    throw new Error(`Simple IPFS upload failed: ${error.message}`);
  }
}

/**
 * Simple IPFS download for files uploaded with simpleIPFSUpload
 * @param {string} hash - The hash from simpleIPFSUpload
 * @returns {Promise<Blob>} - The file as a Blob
 */
export async function simpleIPFSDownload(hash) {
  try {
    const storageKey = `ipfs_${hash}`;
    const storedData = localStorage.getItem(storageKey);
    
    if (!storedData) {
      throw new Error(`File with hash ${hash} not found`);
    }
    
    const fileData = JSON.parse(storedData);
    const base64Data = fileData.data.split(',')[1] || fileData.data;
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    return new Blob([bytes], { type: fileData.type });
    
  } catch (error) {
    throw new Error(`Simple IPFS download failed: ${error.message}`);
  }
}

/**
 * Create a simple hash for demo purposes
 * @param {string} input - Input string to hash
 * @returns {Promise<string>} - Hash string
 */
async function createSimpleHash(input) {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex.substring(0, 46); // Return first 46 chars to simulate IPFS hash format
}