import React, { useState, useRef } from "react";
import { viewFunction } from "./utils/aptos";
import { encryptText, decryptText, hexToBytes, bytesToHex } from "./utils/crypto";
import { uploadToIPFS, downloadFromIPFS, simpleIPFSUpload, simpleIPFSDownload, testIPFS } from "./utils/ipfs";

const MODULE_ADDR = "0x40584014251cc83138a7bfb2b83c13ed3b227bff6d481238f586216b69cec2f6";
const FUNC_CREATE = `${MODULE_ADDR}::time_capsule::create_capsule`;
const FUNC_LEN = `${MODULE_ADDR}::time_capsule::get_capsules_len`;
const FUNC_META = `${MODULE_ADDR}::time_capsule::capsule_meta`;
const FUNC_REVEAL = `${MODULE_ADDR}::time_capsule::reveal_encrypted`;

// Utility function to truncate long text
const truncateText = (text, maxLength = 20) => {
  if (text.length <= maxLength) return text;
  return `${text.substring(0, maxLength / 2)}...${text.substring(text.length - maxLength / 2)}`;
};

export default function App() {
  const [account, setAccount] = useState(null);
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const [receiver, setReceiver] = useState("");
  const [message, setMessage] = useState("");
  const [unlockAt, setUnlockAt] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [useSimpleIPFS, setUseSimpleIPFS] = useState(true); // Toggle for demo mode

  const [capsuleId, setCapsuleId] = useState("");
  const [revealPass, setRevealPass] = useState("");
  const [revealedContent, setRevealedContent] = useState(null);

  const fileInputRef = useRef();

  const nowSeconds = () => Math.floor(Date.now() / 1000);
  const isValidAddress = (addr) => /^0x[0-9a-f]{64}$/i.test(addr);

  const connectWallet = async () => {
    try {
      if (!window.aptos) {
        window.open("https://petra.app/", "_blank");
        return alert("Please install Petra Wallet");
      }
      const { address } = await window.aptos.connect();
      const network = await window.aptos.network();
      if (network !== "Testnet") {
        await window.aptos.disconnect();
        return alert("Please switch to Testnet");
      }
      setAccount(address);
      setStatus(`Connected: ${address}`);
    } catch (e) {
      console.error(e);
      setStatus("Connection failed: " + e.message);
    }
  };

  const handleFileSelect = (event) => {
    const files = Array.from(event.target.files);
    
    // Validate file sizes (limit to 10MB per file for demo)
    const maxSize = 10 * 1024 * 1024; // 10MB
    const oversizedFiles = files.filter(f => f.size > maxSize);
    
    if (oversizedFiles.length > 0) {
      setStatus(`Some files are too large (max 10MB): ${oversizedFiles.map(f => f.name).join(", ")}`);
      return;
    }
    
    setSelectedFiles(prev => [...prev, ...files]);
    setStatus(`Selected ${files.length} file(s): ${files.map(f => f.name).join(", ")}`);
  };

  const removeFile = (index) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const checkCapsuleStatus = async (id) => {
    try {
      const [total, meta] = await Promise.all([
        viewFunction(FUNC_LEN, []),
        viewFunction(FUNC_META, [id])
      ]);
      return {
        exists: true,
        sender: meta[0],
        receiver: meta[1],
        unlockTime: Number(meta[2]),
        contentType: meta[3],
        isUnlocked: nowSeconds() >= Number(meta[2]),
        isAuthorized: account === meta[0] || account === meta[1],
        totalCapsules: total[0]
      };
    } catch (e) {
      console.error("Capsule check failed:", e);
      return { exists: false };
    }
  };

  const createCapsule = async () => {
    if (!account) return alert("Connect wallet first");
    if (!receiver || (!message.trim() && selectedFiles.length === 0) || !unlockAt || !passphrase) {
      return alert("Please fill all required fields and select at least a message or files");
    }
    if (!isValidAddress(receiver)) {
      return alert("Invalid receiver address format");
    }
    
    setIsLoading(true);
    try {
      const unlockSeconds = Math.floor(new Date(unlockAt).getTime() / 1000);
      if (unlockSeconds <= nowSeconds()) {
        setIsLoading(false);
        return alert("Unlock time must be in future");
      }
      
      const trimmedPassphrase = passphrase.trim();
      if (trimmedPassphrase.length === 0) {
        setIsLoading(false);
        return alert("Passphrase cannot be empty");
      }

      setStatus("Processing files...");
      
      // Upload files to IPFS with better error handling
      let fileData = [];
      let uploadErrors = [];
      
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        setStatus(`Uploading file ${i + 1}/${selectedFiles.length}: ${file.name}`);
        
        try {
          let ipfsHash;
          
          if (useSimpleIPFS) {
            // Use simple localStorage-based method for demo
            ipfsHash = await simpleIPFSUpload(file);
            setStatus(`🟢 Stored ${file.name} locally: ${ipfsHash.substring(0, 12)}...`);
          } else {
            // Use real IPFS (requires API keys)
            ipfsHash = await uploadToIPFS(file);
            setStatus(`🟢 Uploaded ${file.name} to IPFS: ${ipfsHash}`);
          }
          
          fileData.push({
            name: file.name,
            type: file.type,
            size: file.size,
            ipfsHash: ipfsHash,
            uploadMethod: useSimpleIPFS ? 'local' : 'ipfs'
          });
          
        } catch (error) {
          console.error(`Failed to upload ${file.name}:`, error);
          uploadErrors.push(`${file.name}: ${error.message}`);
          setStatus(`❌ Failed to upload ${file.name}: ${error.message}`);
        }
      }
      
      if (uploadErrors.length > 0 && fileData.length === 0) {
        setIsLoading(false);
        setStatus(`All file uploads failed:\n${uploadErrors.join('\n')}`);
        return;
      }
      
      if (uploadErrors.length > 0) {
        setStatus(`Some files failed to upload:\n${uploadErrors.join('\n')}\n\nContinuing with ${fileData.length} successful uploads...`);
      }

      // Create content object with better structure
      const content = {
        text: message.trim(),
        files: fileData,
        timestamp: Date.now(),
        version: "2.0" // Version for backward compatibility
      };

      // Determine content type
      let contentType = "text";
      if (fileData.length > 0 && content.text) {
        contentType = "mixed";
      } else if (fileData.length > 0) {
        contentType = "file";
      }

      setStatus("Encrypting content...");
      
      // Encrypt the entire content object as JSON
      const contentJson = JSON.stringify(content, null, 2);
      console.log("Content to encrypt:", contentJson.substring(0, 200) + "...");
      
      const encryptedHex = encryptText(contentJson, trimmedPassphrase);
      console.log("Encrypted hex length:", encryptedHex.length);
      
      // Validate encryption worked
      if (!/^[0-9a-f]+$/i.test(encryptedHex)) {
        throw new Error("Invalid encrypted data format");
      }
      
      // Test decryption before submitting
      try {
        const testDecrypt = decryptText(encryptedHex, trimmedPassphrase);
        const testContent = JSON.parse(testDecrypt);
        console.log("Encryption test passed, files count:", testContent.files?.length || 0);
      } catch (testError) {
        throw new Error(`Encryption validation failed: ${testError.message}`);
      }
      
      const encryptedBytes = hexToBytes(encryptedHex);
      console.log("Encrypted bytes length:", encryptedBytes.length);
      
      setStatus("Creating capsule on blockchain...");
      
      const transaction = {
        type: "entry_function_payload",
        function: FUNC_CREATE,
        type_arguments: [],
        arguments: [receiver, unlockSeconds.toString(), encryptedBytes, contentType]
      };
      
      const tx = await window.aptos.signAndSubmitTransaction(transaction);
      
      setStatus(
        `🟢 Capsule Created Successfully!\n\n` +
        `Transaction: ${tx.hash}\n` +
        `Content Type: ${contentType}\n` +
        `Text Message: ${content.text ? 'Yes' : 'No'}\n` +
        `Files Attached: ${fileData.length}\n` +
        `Upload Method: ${useSimpleIPFS ? 'Local Storage' : 'IPFS'}\n` +
        `Unlocks at: ${new Date(unlockSeconds * 1000).toLocaleString()}\n\n` +
        `🔑 Passphrase: "${trimmedPassphrase}"\n` +
        `Save this passphrase safely!\n\n` +
        `File Details:\n${fileData.map(f => `- ${f.name} (${(f.size/1024).toFixed(1)} KB)`).join('\n')}\n` +
        `${uploadErrors.length > 0 ? `\nUpload Errors:\n${uploadErrors.join('\n')}` : ''}`
      );
      
      // Clear form after success
      setMessage("");
      setPassphrase("");
      setSelectedFiles([]);
      
    } catch (e) {
      console.error("Create capsule error:", e);
      setStatus(`❌ Failed: ${e.message}\n\nTroubleshooting:\n1. Check wallet connection\n2. Verify network is Testnet\n3. Ensure sufficient gas fees\n4. Try reducing file sizes\n5. Check IPFS connectivity`);
    } finally {
      setIsLoading(false);
    }
  };

  const revealCapsule = async () => {
    if (!account) return alert("Connect wallet first");
    if (!capsuleId || !revealPass) return alert("Enter ID and passphrase");
    setIsLoading(true);
    
    try {
      const capsule = await checkCapsuleStatus(capsuleId);
      if (!capsule.exists) {
        setIsLoading(false);
        return setStatus("Capsule not found");
      }
      if (!capsule.isUnlocked) {
        setIsLoading(false);
        return setStatus(`Capsule is still locked. Unlocks at: ${new Date(capsule.unlockTime * 1000).toLocaleString()}`);
      }
      if (!capsule.isAuthorized) {
        setIsLoading(false);
        return setStatus("Not authorized to view this capsule");
      }

      setStatus("Retrieving encrypted data...");

      const encryptedData = await viewFunction(FUNC_REVEAL, [account, capsuleId]);
      console.log("Raw data from chain:", encryptedData);
      
      let encryptedHex;
      
      if (!encryptedData) {
        setIsLoading(false);
        return setStatus("No encrypted data found or access denied");
      }
      
      // Handle different data formats from the blockchain
      if (typeof encryptedData === 'string') {
        if (encryptedData.length === 0) {
          setIsLoading(false);
          return setStatus("Empty encrypted data - you may not be authorized or capsule is still locked");
        }
        encryptedHex = encryptedData.startsWith('0x') ? encryptedData.slice(2) : encryptedData;
        
      } else if (Array.isArray(encryptedData) && typeof encryptedData[0] === 'number') {
        if (encryptedData.length === 0) {
          setIsLoading(false);
          return setStatus("Empty encrypted data - you may not be authorized or capsule is still locked");
        }
        encryptedHex = bytesToHex(encryptedData);
        
      } else if (Array.isArray(encryptedData) && encryptedData.length === 1 && typeof encryptedData[0] === 'string') {
        const hexString = encryptedData[0];
        if (hexString.length === 0) {
          setIsLoading(false);
          return setStatus("Empty encrypted data - you may not be authorized or capsule is still locked");
        }
        encryptedHex = hexString.startsWith('0x') ? hexString.slice(2) : hexString;
        
      } else {
        setIsLoading(false);
        return setStatus(`Unexpected data format: ${typeof encryptedData}\nData: ${JSON.stringify(encryptedData).substring(0, 200)}`);
      }
      
      if (!/^[0-9a-f]+$/i.test(encryptedHex)) {
        setIsLoading(false);
        return setStatus("Invalid capsule data format - corrupted encryption data");
      }

      const trimmedPassphrase = revealPass.trim();
      if (trimmedPassphrase.length === 0) {
        setIsLoading(false);
        return setStatus("Passphrase cannot be empty");
      }
      
      setStatus("Decrypting content...");
      
      let decryptedContent;
      try {
        const decryptedText = decryptText(encryptedHex, trimmedPassphrase);
        console.log("Decrypted text length:", decryptedText.length);
        
        // Try to parse as JSON (new format with files)
        try {
          decryptedContent = JSON.parse(decryptedText);
          console.log("Parsed content:", {
            hasText: !!decryptedContent.text,
            filesCount: decryptedContent.files?.length || 0,
            version: decryptedContent.version
          });
        } catch (jsonError) {
          console.warn("JSON parsing failed, treating as plain text:", jsonError.message);
          // If JSON parsing fails, treat as plain text (backward compatibility)
          decryptedContent = {
            text: decryptedText,
            files: [],
            timestamp: null,
            version: "1.0"
          };
        }
        
      } catch (decryptError) {
        console.error("Decryption failed:", decryptError);
        setIsLoading(false);
        return setStatus(`❌ Decryption failed: ${decryptError.message}\n\nPossible issues:\n1. Wrong passphrase\n2. Corrupted data\n3. Encryption/decryption mismatch`);
      }

      if (!decryptedContent) {
        setIsLoading(false);
        return setStatus(`Decryption failed - wrong passphrase or corrupted data`);
      }

      setRevealedContent(decryptedContent);

      let statusMessage = `🟢 Capsule #${capsuleId} Unlocked Successfully!\n\n` +
        `From: ${capsule.sender}\n` +
        `To: ${capsule.receiver}\n` +
        `Content Type: ${capsule.contentType}\n` +
        `Content Version: ${decryptedContent.version || '1.0'}\n` +
        `Unlocked at: ${new Date(capsule.unlockTime * 1000).toLocaleString()}\n\n`;

      if (decryptedContent.text && decryptedContent.text.trim()) {
        statusMessage += `📩 Text Message:\n${decryptedContent.text}\n\n`;
      }

      if (decryptedContent.files && decryptedContent.files.length > 0) {
        statusMessage += `📎 Files (${decryptedContent.files.length}):\n`;
        decryptedContent.files.forEach((file, index) => {
          const sizeKB = file.size ? (file.size / 1024).toFixed(1) : 'Unknown';
          const method = file.uploadMethod || 'Unknown';
          statusMessage += `${index + 1}. ${file.name} (${sizeKB} KB) [${method}]\n`;
        });
        statusMessage += `\nClick individual files below to download them.`;
      }

      setStatus(statusMessage);
      
    } catch (e) {
      console.error("Reveal error:", e);
      setStatus(`❌ Error: ${e.message}\n\nTroubleshooting:\n1. Check network connection\n2. Verify capsule ID exists\n3. Ensure wallet is connected to Testnet\n4. Try refreshing the page\n5. Double-check your passphrase`);
    } finally {
      setIsLoading(false);
    }
  };

  const downloadFile = async (file) => {
    try {
      setStatus(`Downloading ${file.name}...`);
      
      let fileBlob;
      
      if (file.uploadMethod === 'local') {
        // Use simple download for localStorage files
        fileBlob = await simpleIPFSDownload(file.ipfsHash);
        setStatus(`🟢 Downloaded ${file.name} from local storage!`);
      } else {
        // Use IPFS download for real IPFS files
        fileBlob = await downloadFromIPFS(file.ipfsHash, file.name);
        setStatus(`🟢 Downloaded ${file.name} from IPFS!`);
      }
      
      // Create download link
      const url = URL.createObjectURL(fileBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      setStatus(`🟢 ${file.name} downloaded successfully!`);
      
    } catch (error) {
      console.error("Download error:", error);
      setStatus(`❌ Failed to download ${file.name}: ${error.message}\n\nTroubleshooting:\n1. Check internet connection\n2. File may be corrupted\n3. IPFS gateway may be unavailable`);
    }
  };

  const getTotalCapsules = async () => {
    try {
      const res = await viewFunction(FUNC_LEN, []);
      const count = (res?.[0] ?? 0);
      const actualcnt = count-1;
      setStatus(`Total capsules created: ${actualcnt}`);
    } catch (e) {
      console.error(e);
      setStatus("Failed to fetch total capsules: " + e.message);
    }
  };

  const getCapsuleMetadata = async () => {
    if (!capsuleId) return alert("Enter capsule ID");
    try {
      const capsule = await checkCapsuleStatus(capsuleId);
      if (!capsule.exists) return setStatus("Capsule not found");
      
      const unlockDate = new Date(capsule.unlockTime * 1000);
      const now = new Date();
      const timeRemaining = capsule.unlockTime * 1000 - Date.now();
      
      let statusText = `📦 Capsule #${capsuleId} Metadata\n\n` +
        `Sender: ${capsule.sender}\n` +
        `Receiver: ${capsule.receiver}\n` +
        `Content Type: ${capsule.contentType}\n` +
        `Unlock Time: ${unlockDate.toLocaleString()}\n` +
        `Status: ${capsule.isUnlocked ? "🔓 UNLOCKED" : "🔒 LOCKED"}\n` +
        `Authorization: ${capsule.isAuthorized ? "🟢 AUTHORIZED" : "❌ NOT AUTHORIZED"}\n` +
        `Your Address: ${account}`;
      
      if (!capsule.isUnlocked && timeRemaining > 0) {
        const days = Math.floor(timeRemaining / (1000 * 60 * 60 * 24));
        const hours = Math.floor((timeRemaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
        statusText += `\n\n⏰ Time remaining: ${days}d ${hours}h ${minutes}m`;
      }
      
      setStatus(statusText);
    } catch (e) {
      console.error(e);
      setStatus("Metadata error: " + e.message);
    }
  };

  return (
    <div className="container">
      <header className="app-header">
        <h1>Decentralized Time Capsule</h1>
        <p>Encrypt and time-lock your messages and files on the blockchain</p>
      </header>
      
      <div className="wallet-section">
        <button onClick={connectWallet} disabled={!!account} className="wallet-btn">
          {account ? `Connected: ${account.slice(0, 6)}...${account.slice(-4)}` : "Connect Petra Wallet"}
        </button>
        
        {account && (
          <div className="network-info">
            <span>🟢 Connected to Testnet</span>
          </div>
        )}
      </div>
      
      <div className="main-content">
        <div className="section create-section">
          <h3>📝 Create Time Capsule</h3>
          
          <div className="form-group">
            <label>Receiver Address:</label>
            <input 
              value={receiver} 
              onChange={e => setReceiver(e.target.value)} 
              placeholder="0x..." 
              disabled={isLoading}
              className="address-input"
            />
          </div>
          
          <div className="form-group">
            <label>Secret Message:</label>
            <div className="input-container">
              <button 
                className="file-upload-btn" 
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
                title="Add files to your time capsule"
              >
                ➕
              </button>
              <textarea 
                value={message} 
                onChange={e => setMessage(e.target.value)} 
                placeholder="Enter your secret message (optional if files are uploaded)"
                rows="4"
                disabled={isLoading}
              />
              <input 
                type="file" 
                ref={fileInputRef}
                onChange={handleFileSelect}
                style={{ display: 'none' }}
                multiple
                disabled={isLoading}
              />
            </div>
          </div>

          {selectedFiles.length > 0 && (
            <div className="selected-files">
              <h4>📎 Selected Files ({selectedFiles.length}):</h4>
              <div className="files-grid">
                {selectedFiles.map((file, index) => (
                  <div key={index} className="file-item">
                    <div className="file-info">
                      <div className="file-name" title={file.name}>
                        {truncateText(file.name)}
                      </div>
                      <div className="file-details">
                        {file.type || 'Unknown type'} • {(file.size / 1024).toFixed(1)} KB
                      </div>
                    </div>
                    <button 
                      onClick={() => removeFile(index)} 
                      className="remove-btn"
                      disabled={isLoading}
                    >
                      ❌
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          <div className="form-group">
            <label>Unlock Date & Time:</label>
            <input 
              type="datetime-local" 
              value={unlockAt} 
              onChange={e => setUnlockAt(e.target.value)}
              min={new Date().toISOString().slice(0, 16)}
              disabled={isLoading}
            />
          </div>
          
          <div className="form-group">
            <label>Encryption Passphrase:</label>
            <input 
              type="password" 
              value={passphrase} 
              onChange={e => setPassphrase(e.target.value)} 
              placeholder="Enter a strong passphrase (share securely with receiver)" 
              disabled={isLoading}
            />
            <small>⚠️ Remember this passphrase! It cannot be recovered.</small>
          </div>
          
          <button onClick={createCapsule} disabled={isLoading || !account} className="create-btn">
            {isLoading ? "🔄 Creating..." : "🚀 Create Capsule"}
          </button>
        </div>

        <div className="section reveal-section">
          <h3>🔓 Reveal Time Capsule</h3>
          
          <div className="form-group">
            <label>Capsule ID:</label>
            <input 
              type="number" 
              value={capsuleId} 
              onChange={e => setCapsuleId(e.target.value)} 
              placeholder="Enter capsule ID (0, 1, 2, ...)" 
              min="0"
              disabled={isLoading}
            />
          </div>
          
          <div className="button-group">
            <button onClick={getTotalCapsules} disabled={isLoading}>
              📊 Get Total Capsules
            </button>
            <button onClick={getCapsuleMetadata} disabled={isLoading}>
              📋 Get Metadata
            </button>
          </div>
          
          <div className="form-group">
            <label>Decryption Passphrase:</label>
            <input 
              type="password" 
              value={revealPass} 
              onChange={e => setRevealPass(e.target.value)} 
              placeholder="Enter the exact passphrase used during creation" 
              disabled={isLoading}
            />
          </div>
          
          <button onClick={revealCapsule} disabled={isLoading || !account} className="reveal-btn">
            {isLoading ? "🔄 Decrypting..." : "🔓 Reveal Content"}
          </button>

          {revealedContent && (
            <div className="revealed-content">
              <h4>🟢 Capsule Contents Unlocked!</h4>
              
              {revealedContent.text && revealedContent.text.trim() && (
                <div className="text-content">
                  <h5>📩 Message:</h5>
                  <div className="message-box">{revealedContent.text}</div>
                </div>
              )}
              
              {revealedContent.files && revealedContent.files.length > 0 && (
                <div className="files-content">
                  <h5>📎 Attached Files ({revealedContent.files.length}):</h5>
                  <div className="files-grid">
                    {revealedContent.files.map((file, index) => (
                      <div key={index} className="file-download-item">
                        <div className="file-info">
                          <div className="file-name" title={file.name}>
                            {truncateText(file.name)}
                          </div>
                          <div className="file-details">
                            {file.type || 'Unknown'} • {(file.size / 1024).toFixed(1)} KB
                            <br />
                            <small>Storage: {file.uploadMethod || 'Unknown'}</small>
                          </div>
                        </div>
                        <button 
                          onClick={() => downloadFile(file)}
                          className="download-btn"
                          disabled={isLoading}
                        >
                          ⬇️ Download
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {revealedContent.timestamp && (
                <div className="metadata">
                  <small>
                    📅 Created: {new Date(revealedContent.timestamp).toLocaleString()}
                  </small>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="status-section">
        <h4>📱 Status & Logs:</h4>
        <div className="status-box">
          <pre>{status || "Ready to create or reveal time capsules..."}</pre>
        </div>
      </div>
      
      <style jsx>{`
        .container {
          max-width: 1000px;
          margin: 0 auto;
          padding: 20px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: #121212;
          min-height: 100vh;
          color: #e0e0e0;
        }
        
        .app-header {
          text-align: center;
          margin-bottom: 30px;
          color: #ffffff;
        }
        
        .app-header h1 {
          font-size: 2.5rem;
          margin-bottom: 10px;
          color: #ffffff;
        }
        
        .app-header p {
          font-size: 1.1rem;
          color: #b0b0b0;
        }
        
        .wallet-section {
          text-align: center;
          margin-bottom: 30px;
        }
        
        .wallet-btn {
          background: #0095f6;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 8px;
          font-size: 16px;
          cursor: pointer;
          transition: background 0.3s;
        }
        
        .wallet-btn:hover:not(:disabled) {
          background: #0081e6;
        }
        
        .wallet-btn:disabled {
          background: #262626;
          cursor: default;
        }
        
        .network-info {
          margin-top: 10px;
          color: #b0b0b0;
          font-size: 14px;
        }
        
        .main-content {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 30px;
          margin-bottom: 30px;
        }
        
        @media (max-width: 768px) {
          .main-content {
            grid-template-columns: 1fr;
          }
        }
        
        .section {
          background: #1e1e1e;
          border-radius: 12px;
          padding: 25px;
          box-shadow: 0 4px 8px rgba(0,0,0,0.3);
          border: 1px solid #333;
        }
        
        .section h3 {
          margin-top: 0;
          color: #ffffff;
          font-size: 1.4rem;
          border-bottom: 1px solid #333;
          padding-bottom: 10px;
        }
        
        .form-group {
          margin-bottom: 20px;
        }
        
        .form-group label {
          display: block;
          margin-bottom: 8px;
          font-weight: 600;
          color: #e0e0e0;
        }
        
        .form-group small {
          display: block;
          margin-top: 5px;
          color: #b0b0b0;
          font-size: 12px;
        }
        
        .input-container {
          display: flex;
          align-items: flex-start;
          gap: 10px;
        }
        
        .file-upload-btn {
          width: 50px;
          height: 50px;
          border-radius: 50%;
          background: #262626;
          color: #e0e0e0;
          border: 1px solid #333;
          cursor: pointer;
          font-size: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: background 0.3s;
        }
        
        .file-upload-btn:hover:not(:disabled) {
          background: #333;
        }
        
        .file-upload-btn:disabled {
          background: #1a1a1a;
          cursor: not-allowed;
        }
        
        input, textarea {
          width: 100%;
          padding: 12px;
          background: #262626;
          border: 1px solid #333;
          border-radius: 8px;
          font-size: 14px;
          color: #e0e0e0;
          transition: border-color 0.3s;
          box-sizing: border-box;
        }
        
        input:focus, textarea:focus {
          outline: none;
          border-color: #0095f6;
        }
        
        .input-container input, .input-container textarea {
          flex: 1;
          margin: 0;
        }
        
        .address-input {
          font-family: monospace;
          font-size: 13px;
        }
        
        .selected-files {
          margin: 15px 0;
          padding: 20px;
          background: #262626;
          border-radius: 8px;
          border: 1px dashed #333;
        }
        
        .selected-files h4 {
          margin: 0 0 15px 0;
          color: #e0e0e0;
        }
        
        .files-grid {
          display: grid;
          gap: 10px;
        }
        
        .file-item, .file-download-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px;
          background: #1e1e1e;
          border: 1px solid #333;
          border-radius: 6px;
          transition: background 0.3s;
        }
        
        .file-item:hover, .file-download-item:hover {
          background:rgb(44, 37, 37);
        }
        
        .file-info {
          flex: 1;
        }
        
        .file-name {
          font-weight: 600;
          color: #e0e0e0;
          margin-bottom: 4px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        .file-details {
          font-size: 12px;
          color: #b0b0b0;
        }
        
        .remove-btn {
          background: none;
          border: none;
          font-size: 16px;
          width: 22px;
          cursor: pointer;
          padding: 2px;
          color: #b0b0b0;
         
          border-radius: 50%;
          transition: background 0.3s;
        }
        
        .remove-btn:hover:not(:disabled) {
          background: #333;
        }
        
        .button-group {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin: 15px 0;
        }
        
        button {
          padding: 12px 20px;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.3s;
          font-weight: 500;
        }
        
        .create-btn {
          background: #0095f6;
          color: white;
          font-size: 16px;
          padding: 15px;
        }
        
        .reveal-btn {
          background: #8e44ad;
          color: white;
          font-size: 16px;
          padding: 15px;
        }
        
        .download-btn {
          background: #27ae60;
          color: white;
          padding: 8px 12px;
          font-size: 12px;
        }
        
        button:hover:not(:disabled) {
          opacity: 0.9;
        }
        
        button:disabled {
          background: #262626 !important;
          color: #666;
          cursor: not-allowed;
        }
        
        .revealed-content {
          margin-top: 25px;
          padding: 20px;
          background: #262626;
          border-radius: 12px;
          border: 1px solid #333;
        }
        
        .revealed-content h4 {
          margin-top: 0;
          color: #ffffff;
          text-align: center;
        }
        
        .text-content {
          margin-bottom: 20px;
        }
        
        .text-content h5 {
          margin: 0 0 10px 0;
          color: #e0e0e0;
        }
        
        .message-box {
          background: #1e1e1e;
          padding: 15px;
          border-radius: 8px;
          border: 1px solid #333;
          white-space: pre-wrap;
          word-wrap: break-word;
          font-family: inherit;
          line-height: 1.6;
          color: #e0e0e0;
        }
        
        .files-content h5 {
          margin: 0 0 15px 0;
          color: #e0e0e0;
        }
        
        .metadata {
          margin-top: 15px;
          text-align: center;
          color: #b0b0b0;
        }
        
        .status-section {
          background: #1e1e1e;
          border-radius: 12px;
          padding: 25px;
          box-shadow: 0 4px 8px rgba(0,0,0,0.3);
          border: 1px solid #333;
        }
        
        .status-section h4 {
          margin-top: 0;
          color: #ffffff;
        }
        
        .status-box {
          background: #121212;
          border: 1px solid #333;
          border-radius: 8px;
          padding: 15px;
          max-height: 300px;
          overflow-y: auto;
        }
        
        .status-box pre {
          margin: 0;
          font-family: 'Courier New', monospace;
          font-size: 13px;
          line-height: 1.5;
          white-space: pre-wrap;
          word-wrap: break-word;
          color: #e0e0e0;
        }
      `}</style>
    </div>
  );
}