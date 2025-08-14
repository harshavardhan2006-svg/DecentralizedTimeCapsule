import React, { useState, useRef } from "react";
import { AptosClient } from "aptos";
import { encryptText, hexToBytes } from "../utils/crypto";
import { uploadToIPFS } from "../utils/ipfs";

const NODE_URL = "https://fullnode.testnet.aptoslabs.com";
const MODULE_ADDRESS = "0x40584014251cc83138a7bfb2b83c13ed3b227bff6d481238f586216b69cec2f6";

export default function CreateCapsule({ account }) {
  const client = new AptosClient(NODE_URL);
  const [receiver, setReceiver] = useState("");
  const [message, setMessage] = useState("");
  const [unlockMinutes, setUnlockMinutes] = useState(60);
  const [passphrase, setPassphrase] = useState("");
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  const fileInputRef = useRef();

  const handleFileSelect = (event) => {
    const files = Array.from(event.target.files);
    setSelectedFiles(prev => [...prev, ...files]);
    setStatus(`Selected ${files.length} file(s): ${files.map(f => f.name).join(", ")}`);
  };

  const removeFile = (index) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const createCapsule = async () => {
    if (!account) {
      setStatus("Please connect your wallet first");
      return;
    }
    
    setIsLoading(true);
    try {
      // Validate inputs
      if (!receiver.startsWith("0x") || receiver.length !== 66) {
        setStatus("Invalid receiver address (must be 0x... and 66 characters)");
        setIsLoading(false);
        return;
      }
      if (!passphrase.trim()) {
        setStatus("Please enter a passphrase");
        setIsLoading(false);
        return;
      }
      if (!message.trim() && selectedFiles.length === 0) {
        setStatus("Please enter a message or select files");
        setIsLoading(false);
        return;
      }

      const unlockTime = Math.floor(Date.now() / 1000) + (unlockMinutes * 60);
      const trimmedPassphrase = passphrase.trim();
      
      setStatus("Uploading files to IPFS...");
      
      // Upload files to IPFS
      let fileData = [];
      for (let file of selectedFiles) {
        try {
          setStatus(`Uploading ${file.name} to IPFS...`);
          const ipfsHash = await uploadToIPFS(file);
          fileData.push({
            name: file.name,
            type: file.type,
            size: file.size,
            ipfsHash: ipfsHash
          });
          setStatus(`🟢 Uploaded ${file.name}: ${ipfsHash}`);
        } catch (error) {
          console.error(`Failed to upload ${file.name}:`, error);
          setStatus(`❌ Failed to upload ${file.name}: ${error.message}`);
          setIsLoading(false);
          return;
        }
      }

      // Create content object
      const content = {
        text: message.trim(),
        files: fileData,
        timestamp: Date.now()
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
      const contentJson = JSON.stringify(content);
      console.log("Content to encrypt:", contentJson);
      
      const encryptedHex = encryptText(contentJson, trimmedPassphrase);
      console.log("Encrypted hex:", encryptedHex);
      
      // Convert hex to bytes for the smart contract
      const encryptedBytes = hexToBytes(encryptedHex);
      console.log("Encrypted bytes length:", encryptedBytes.length);

      setStatus("Creating capsule on blockchain...");

      const payload = {
        type: "entry_function_payload",
        function: `${MODULE_ADDRESS}::time_capsule::create_capsule`,
        type_arguments: [],
        arguments: [
          receiver,
          unlockTime.toString(),
          encryptedBytes,
          contentType
        ]
      };

      const tx = await window.aptos.signAndSubmitTransaction(payload);
      console.log("Transaction submitted:", tx.hash);
      
      // Wait for transaction confirmation
      await client.waitForTransaction(tx.hash);
      
      setStatus(
        `🟢 Capsule Created Successfully!\n\n` +
        `Transaction: ${tx.hash}\n` +
        `Content Type: ${contentType}\n` +
        `Text Message: ${content.text ? 'Yes' : 'No'}\n` +
        `Files Attached: ${fileData.length}\n` +
        `Unlocks in: ${unlockMinutes} minutes\n` +
        `Unlock time: ${new Date(unlockTime * 1000).toLocaleString()}\n\n` +
        `🔑 Remember your passphrase: "${trimmedPassphrase}"\n` +
        `Share this passphrase securely with the receiver!\n\n` +
        `File Details:\n${fileData.map(f => `- ${f.name} (${(f.size/1024).toFixed(1)} KB)`).join('\n')}`
      );
      
      // Clear form after success
      setMessage("");
      setPassphrase("");
      setSelectedFiles([]);
      
    } catch (err) {
      console.error("Create capsule error:", err);
      setStatus(`❌ Error: ${err.message}\n\nPlease check:\n1. Wallet connection\n2. Network (Testnet)\n3. Sufficient gas fees\n4. IPFS connectivity`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="capsule-form">
      <h3>Create Time Capsule</h3>
      
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
        <label>Receiver Address:</label>
        <input
          type="text"
          placeholder="0x..."
          value={receiver}
          onChange={(e) => setReceiver(e.target.value)}
          disabled={isLoading}
        />
      </div>
      
      <div className="form-group">
        <label>Secret Message:</label>
        <div className="input-with-upload">
          <button 
            className="file-upload-btn" 
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            title="Upload files"
          >
            +
          </button>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Enter your secret message (optional if files are uploaded)..."
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
          <h4>Selected Files ({selectedFiles.length}):</h4>
          {selectedFiles.map((file, index) => (
            <div key={index} className="file-item">
              <div className="file-info">
                <span className="file-name">{file.name}</span>
                <span className="file-details">
                  {file.type || 'Unknown'} • {(file.size / 1024).toFixed(1)} KB
                </span>
              </div>
              <button 
                onClick={() => removeFile(index)} 
                className="remove-btn"
                disabled={isLoading}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      
      <div className="form-group">
        <label>Unlock After (minutes):</label>
        <input
          type="number"
          min="1"
          max="525600"
          value={unlockMinutes}
          onChange={(e) => setUnlockMinutes(parseInt(e.target.value) || 1)}
          disabled={isLoading}
        />
        <small>Will unlock at: {new Date(Date.now() + unlockMinutes * 60 * 1000).toLocaleString()}</small>
      </div>
      
      <div className="form-group">
        <label>Encryption Passphrase:</label>
        <input
          type="password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          placeholder="Enter a secret passphrase (share with receiver)"
          disabled={isLoading}
        />
      </div>
      
      <button 
        onClick={createCapsule} 
        disabled={isLoading || !account}
        className={isLoading ? "loading" : ""}
      >
        {isLoading ? "Creating Capsule..." : "Create Capsule"}
      </button>
      
      {status && (
        <div className="status">
          <pre style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
            {status}
          </pre>
        </div>
      )}
      
      <style jsx>{`
  .capsule-form {
    max-width: 500px;
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
  
  input, textarea {
    width: 100%;
    padding: 10px;
    background: #262626;
    border: 1px solid #333;
    border-radius: 4px;
    font-size: 14px;
    color: #e0e0e0;
  }
  
  input:disabled, textarea:disabled {
    background: #1a1a1a;
    cursor: not-allowed;
  }
  
  .input-with-upload {
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }
  
  .file-upload-btn {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: #262626;
    color: #e0e0e0;
    border: 1px solid #333;
    cursor: pointer;
    font-size: 20px;
    font-weight: bold;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: background 0.2s;
  }
  
  .file-upload-btn:hover:not(:disabled) {
    background: #333;
  }
  
  .file-upload-btn:disabled {
    background: #1a1a1a;
    cursor: not-allowed;
  }
  
  .input-with-upload textarea {
    flex: 1;
    margin: 0;
    background: #262626;
    color: #e0e0e0;
  }
  
  .selected-files {
    margin: 10px 0;
    padding: 15px;
    border: 1px solid #333;
    border-radius: 4px;
    background: #262626;
  }
  
  .selected-files h4 {
    margin: 0 0 15px 0;
    font-size: 14px;
    color: #e0e0e0;
  }
  
  .file-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px;
    margin: 5px 0;
    background: #1e1e1e;
    border: 1px solid #333;
    border-radius: 4px;
  }
  
  .file-info {
    display: flex;
    flex-direction: column;
    flex: 1;
  }
  
  .file-name {
    font-weight: bold;
    font-size: 14px;
    color: #e0e0e0;
  }
  
  .file-details {
    font-size: 12px;
    color: #b0b0b0;
    margin-top: 2px;
  }
  
  .remove-btn {
    background: #262626;
    color: #e0e0e0;
    border: none;
    border-radius: 50%;
    width: 24px;
    height: 24px;
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
    margin-left: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .remove-btn:hover:not(:disabled) {
    background: #333;
  }
  
  .remove-btn:disabled {
    background: #1a1a1a;
    cursor: not-allowed;
  }
  
  small {
    display: block;
    margin-top: 5px;
    color: #b0b0b0;
    font-size: 12px;
  }
  
  button {
    width: 100%;
    padding: 12px;
    background: #0095f6;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 16px;
    cursor: pointer;
    transition: background 0.2s;
  }
  
  button:hover:not(:disabled) {
    background: #0081e6;
  }
  
  button:disabled {
    background: #262626;
    color: #666;
    cursor: not-allowed;
  }
  
  button.loading {
    background: #262626;
    color: #b0b0b0;
  }
  
  .status {
    margin-top: 20px;
    padding: 15px;
    border-radius: 4px;
    background: #121212;
    border: 1px solid #333;
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