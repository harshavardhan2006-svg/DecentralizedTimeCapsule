import React, { useState } from "react";
import { AptosClient } from "aptos";
import { decryptText } from "../utils/crypto";
import { downloadFromIPFS } from "../utils/ipfs";

const NODE_URL = "https://fullnode.testnet.aptoslabs.com";
const MODULE_ADDRESS = "0x40584014251cc83138a7bfb2b83c13ed3b227bff6d481238f586216b69cec2f6";

export default function ViewCapsule({ account }) {
  const client = new AptosClient(NODE_URL);
  const [capsuleId, setCapsuleId] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [capsule, setCapsule] = useState(null);
  const [decryptedContent, setDecryptedContent] = useState(null);
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [downloadingFile, setDownloadingFile] = useState(null);

  const fetchCapsule = async () => {
    if (!account) {
      setStatus("Please connect your wallet first");
      return;
    }
    
    if (!capsuleId) {
      setStatus("Please enter a capsule ID");
      return;
    }
    
    setIsLoading(true);
    try {
      const resource = await client.getAccountResource(
        MODULE_ADDRESS,
        `${MODULE_ADDRESS}::time_capsule::Capsules`
      );

      const capsuleData = resource.data.items.find(
        (c) => c.id === Number(capsuleId)
      );

      if (!capsuleData) {
        setStatus("Capsule not found");
        setIsLoading(false);
        return;
      }

      const unlockTime = new Date(capsuleData.unlock_time * 1000);
      const now = new Date();
      const isUnlocked = now >= unlockTime;
      const isAuthorized = account === capsuleData.sender || account === capsuleData.receiver;

      setCapsule({
        id: capsuleData.id,
        sender: capsuleData.sender,
        receiver: capsuleData.receiver,
        unlockTime: unlockTime,
        encryptedHex: capsuleData.encrypted_hex,
        contentType: capsuleData.content_type || "text", // Fallback for old capsules
        isUnlocked: isUnlocked,
        isAuthorized: isAuthorized
      });
      
      let statusMsg = `📦 Capsule #${capsuleId} Details:\n\n`;
      statusMsg += `From: ${capsuleData.sender}\n`;
      statusMsg += `To: ${capsuleData.receiver}\n`;
      statusMsg += `Content Type: ${capsuleData.content_type || 'text'}\n`;
      statusMsg += `Unlock Time: ${unlockTime.toLocaleString()}\n`;
      statusMsg += `Status: ${isUnlocked ? '🔓 UNLOCKED' : '🔒 LOCKED'}\n`;
      statusMsg += `Your Access: ${isAuthorized ? '🟢 AUTHORIZED' : '❌ NOT AUTHORIZED'}\n`;
      
      if (!isUnlocked) {
        const timeLeft = unlockTime.getTime() - now.getTime();
        const hours = Math.floor(timeLeft / (1000 * 60 * 60));
        const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
        statusMsg += `\n⏰ Time remaining: ${hours}h ${minutes}m`;
      }
      
      setStatus(statusMsg);
      
    } catch (err) {
      console.error("Fetch capsule error:", err);
      setStatus(`❌ Error: ${err.message}\n\nPossible issues:\n1. Capsule doesn't exist\n2. Network connection\n3. Wrong capsule ID`);
    } finally {
      setIsLoading(false);
    }
  };

  const decryptMessage = async () => {
    if (!capsule) {
      setStatus("Please fetch capsule details first");
      return;
    }
    
    if (!capsule.isUnlocked) {
      setStatus("❌ Capsule is still locked!\nWait until unlock time: " + capsule.unlockTime.toLocaleString());
      return;
    }
    
    if (!capsule.isAuthorized) {
      setStatus("❌ You are not authorized to view this capsule");
      return;
    }
    
    if (!passphrase.trim()) {
      setStatus("Please enter the passphrase");
      return;
    }
    
    setIsLoading(true);
    try {
      console.log("Encrypted hex from capsule:", capsule.encryptedHex);
      
      // Clean the hex string (remove 0x prefix if present)
      const cleanHex = capsule.encryptedHex.startsWith('0x') 
        ? capsule.encryptedHex.slice(2) 
        : capsule.encryptedHex;
      
      console.log("Cleaned hex for decryption:", cleanHex);
      
      // Decrypt the content
      const decryptedText = decryptText(cleanHex, passphrase.trim());
      console.log("Decrypted text:", decryptedText);
      
      // Try to parse as JSON (new format with files)
      let content;
      try {
        content = JSON.parse(decryptedText);
      } catch (jsonError) {
        // If JSON parsing fails, treat as plain text (backward compatibility)
        content = {
          text: decryptedText,
          files: [],
          timestamp: null
        };
      }
      
      setDecryptedContent(content);
      
      let statusMsg = `🟢 Capsule #${capsule.id} Decrypted Successfully!\n\n`;
      
      if (content.text) {
        statusMsg += `📩 Text Message:\n${content.text}\n\n`;
      }
      
      if (content.files && content.files.length > 0) {
        statusMsg += `📎 Files Found: ${content.files.length}\n`;
        content.files.forEach((file, index) => {
          statusMsg += `${index + 1}. ${file.name} (${(file.size / 1024).toFixed(1)} KB)\n`;
        });
        statusMsg += `\nClick the download buttons below to get your files.`;
      }
      
      setStatus(statusMsg);
      
    } catch (err) {
      console.error("Decryption error:", err);
      setDecryptedContent(null);
      setStatus(`❌ Decryption Failed: ${err.message}\n\nPossible reasons:\n1. Wrong passphrase\n2. Corrupted data\n3. Encryption mismatch\n\nTry checking the passphrase with sender.`);
    } finally {
      setIsLoading(false);
    }
  };

  const downloadFile = async (file, index) => {
    if (!file.ipfsHash) {
      setStatus(`❌ No IPFS hash found for ${file.name}`);
      return;
    }
    
    setDownloadingFile(index);
    try {
      setStatus(`📥 Downloading ${file.name} from IPFS...`);
      
      const fileBlob = await downloadFromIPFS(file.ipfsHash);
      
      // Create download link
      const url = URL.createObjectURL(fileBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      setStatus(`🟢 Downloaded ${file.name} successfully!`);
      
    } catch (error) {
      console.error('Download error:', error);
      setStatus(`❌ Failed to download ${file.name}: ${error.message}\n\nTry again or contact the sender.`);
    } finally {
      setDownloadingFile(null);
    }
  };

  const getTotalCapsules = async () => {
    setIsLoading(true);
    try {
      const response = await client.view({
        function: `${MODULE_ADDRESS}::time_capsule::get_capsules_len`,
        type_arguments: [],
        arguments: []
      });
      
      setStatus(`📊 Total capsules in system: ${response[0]}\n\nCapsule IDs start from 0, so valid IDs are: 0 to ${response[0] - 1}`);
      
    } catch (err) {
      console.error("Get total error:", err);
      setStatus(`❌ Error getting total: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="view-capsule">
      <h3>View Time Capsule</h3>
      
      <div className="form-group">
        <label>Your Address:</label>
        <input
          type="text"
          value={account || "Not connected"}
          disabled
          style={{ background: "#f0f0f0" }}
        />
      </div>
      
      <div className="form-group">
        <label>Capsule ID:</label>
        <input
          type="number"
          min="0"
          value={capsuleId}
          onChange={(e) => setCapsuleId(e.target.value)}
          placeholder="Enter capsule ID (0, 1, 2, ...)"
          disabled={isLoading}
        />
      </div>
      
      <div className="button-group">
        <button onClick={fetchCapsule} disabled={isLoading || !account}>
          {isLoading ? "Fetching..." : "Fetch Capsule"}
        </button>
        <button onClick={getTotalCapsules} disabled={isLoading}>
          Get Total Capsules
        </button>
      </div>

      {capsule && (
        <div className="capsule-details">
          <h4>Capsule Details</h4>
          <div className="detail-item">
            <strong>ID:</strong> {capsule.id}
          </div>
          <div className="detail-item">
            <strong>From:</strong> {capsule.sender}
          </div>
          <div className="detail-item">
            <strong>To:</strong> {capsule.receiver}
          </div>
          <div className="detail-item">
            <strong>Content Type:</strong> {capsule.contentType}
          </div>
          <div className="detail-item">
            <strong>Unlocks At:</strong> {capsule.unlockTime.toLocaleString()}
          </div>
          <div className="detail-item">
            <strong>Status:</strong> 
            <span className={capsule.isUnlocked ? "status-unlocked" : "status-locked"}>
              {capsule.isUnlocked ? " 🔓 UNLOCKED" : " 🔒 LOCKED"}
            </span>
          </div>
          <div className="detail-item">
            <strong>Your Access:</strong> 
            <span className={capsule.isAuthorized ? "status-authorized" : "status-unauthorized"}>
              {capsule.isAuthorized ? " 🟢 AUTHORIZED" : " ❌ NOT AUTHORIZED"}
            </span>
          </div>
          
          {capsule.isUnlocked && capsule.isAuthorized && (
            <div className="decrypt-section">
              <h4>Decrypt Content</h4>
              <div className="form-group">
                <label>Passphrase:</label>
                <input
                  type="password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  placeholder="Enter the exact passphrase used by sender"
                  disabled={isLoading}
                />
              </div>
              <button onClick={decryptMessage} disabled={isLoading}>
                {isLoading ? "Decrypting..." : "Decrypt Content"}
              </button>
            </div>
          )}
        </div>
      )}

      {decryptedContent && (
        <div className="decrypted-content">
          <h4>📦 Capsule Contents</h4>
          
          {decryptedContent.text && (
            <div className="text-content">
              <h5>📩 Message:</h5>
              <div className="message-box">
                {decryptedContent.text}
              </div>
            </div>
          )}
          
          {decryptedContent.files && decryptedContent.files.length > 0 && (
            <div className="files-content">
              <h5>📎 Files ({decryptedContent.files.length}):</h5>
              <div className="files-list">
                {decryptedContent.files.map((file, index) => (
                  <div key={index} className="file-download-item">
                    <div className="file-info">
                      <div className="file-name">{file.name}</div>
                      <div className="file-details">
                        {file.type || 'Unknown type'} • {(file.size / 1024).toFixed(1)} KB
                      </div>
                      {file.ipfsHash && (
                        <div className="file-hash">
                          IPFS: {file.ipfsHash.substring(0, 20)}...
                        </div>
                      )}
                    </div>
                    <button 
                      onClick={() => downloadFile(file, index)}
                      disabled={downloadingFile === index}
                      className="download-btn"
                    >
                      {downloadingFile === index ? "Downloading..." : "Download"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {decryptedContent.timestamp && (
            <div className="timestamp-info">
              <small>
                Created: {new Date(decryptedContent.timestamp).toLocaleString()}
              </small>
            </div>
          )}
        </div>
      )}
      
      {status && (
        <div className="status">
          <h4>Status:</h4>
          <pre style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
            {status}
          </pre>
        </div>
      )}
      
      <style jsx>{`
  .view-capsule {
    max-width: 600px;
    margin: 20px auto;
    padding: 20px;
    border: 1px solid #333;
    border-radius: 8px;
    background: #1e1e1e;
    color: #e0e0e0;
  }
  
  .form-group {
    margin-bottom: 15px;
  }
  
  label {
    display: block;
    margin-bottom: 5px;
    font-weight: bold;
    color: #e0e0e0;
  }
  
  input {
    width: 100%;
    padding: 10px;
    background: #262626;
    border: 1px solid #333;
    border-radius: 4px;
    font-size: 14px;
    color: #e0e0e0;
  }
  
  input:disabled {
    background: #1a1a1a;
    cursor: not-allowed;
  }
  
  .button-group {
    display: flex;
    gap: 10px;
    margin-bottom: 20px;
  }
  
  button {
    flex: 1;
    padding: 12px;
    background: #262626;
    color: #e0e0e0;
    border: 1px solid #333;
    border-radius: 4px;
    font-size: 14px;
    cursor: pointer;
    transition: background 0.2s;
  }
  
  button:hover:not(:disabled) {
    background: #333;
  }
  
  button:disabled {
    background: #1a1a1a;
    cursor: not-allowed;
  }
  
  .capsule-details {
    margin: 20px 0;
    padding: 15px;
    border: 1px solid #333;
    border-radius: 8px;
    background: #262626;
  }
  
  .detail-item {
    margin: 10px 0;
    padding: 5px 0;
    border-bottom: 1px solid #333;
    color: #e0e0e0;
  }
  
  .detail-item:last-child {
    border-bottom: none;
  }
  
  .status-unlocked {
    color: #27ae60;
  }
  
  .status-locked {
    color: #e74c3c;
  }
  
  .status-authorized {
    color: #27ae60;
  }
  
  .status-unauthorized {
    color: #e74c3c;
  }
  
  .decrypt-section {
    margin-top: 20px;
    padding-top: 20px;
    border-top: 1px solid #333;
  }
  
  .decrypted-content {
    margin: 20px 0;
    padding: 20px;
    border: 1px solid #333;
    border-radius: 8px;
    background: #262626;
  }
  
  .text-content {
    margin-bottom: 20px;
  }
  
  .text-content h5, .files-content h5 {
    margin: 0 0 15px 0;
    color: #e0e0e0;
    font-size: 16px;
  }
  
  .message-box {
    background: #1e1e1e;
    padding: 15px;
    border: 1px solid #333;
    border-radius: 4px;
    white-space: pre-wrap;
    word-wrap: break-word;
    font-family: inherit;
    color: #e0e0e0;
  }
  
  .files-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  
  .file-download-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 15px;
    background: #1e1e1e;
    border: 1px solid #333;
    border-radius: 8px;
  }
  
  .file-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  
  .file-name {
    font-weight: bold;
    font-size: 14px;
    color: #e0e0e0;
  }
  
  .file-details {
    font-size: 12px;
    color: #b0b0b0;
  }
  
  .file-hash {
    font-size: 11px;
    color: #999;
    font-family: monospace;
  }
  
  .download-btn {
    background: #27ae60;
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    font-weight: bold;
    min-width: 100px;
    margin-left: 15px;
  }
  
  .download-btn:hover:not(:disabled) {
    background: #219955;
  }
  
  .download-btn:disabled {
    background: #262626;
    cursor: not-allowed;
  }
  
  .timestamp-info {
    margin-top: 15px;
    padding-top: 15px;
    border-top: 1px solid #333;
    text-align: center;
  }
  
  .timestamp-info small {
    color: #b0b0b0;
    font-style: italic;
  }
  
  .status {
    margin-top: 20px;
    padding: 15px;
    border-radius: 4px;
    background: #121212;
    border: 1px solid #333;
  }
  
  .status h4 {
    margin: 0 0 10px 0;
    color: #e0e0e0;
  }
  
  .status pre {
    margin: 0;
    font-family: monospace;
    font-size: 12px;
    line-height: 1.4;
    color: #e0e0e0;
  }
`}</style>
    </div>
  );
}