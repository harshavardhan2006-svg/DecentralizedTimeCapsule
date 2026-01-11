import React, { useState, useEffect } from "react";

export default function WalletConnect({ setAccount }) {
  const [isConnected, setIsConnected] = useState(false);
  const [wallet, setWallet] = useState(null);

  useEffect(() => {
    const detectWallet = async () => {
      // Wait for wallet to be injected
      const checkWallet = () => {
        if (window.petra) {
          return window.petra;
        }
        if (window.aptos) {
          return window.aptos;
        }
        return null;
      };

      let detectedWallet = checkWallet();
      
      // If not immediately available, wait a bit
      if (!detectedWallet) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        detectedWallet = checkWallet();
      }

      if (detectedWallet) {
        setWallet(detectedWallet);
        
        try {
          // Check if already connected using the standard method
          const isConnectedNow = await detectedWallet.isConnected?.();
          if (isConnectedNow) {
            const accountInfo = await detectedWallet.account?.();
            if (accountInfo?.address) {
              setAccount(accountInfo.address);
              setIsConnected(true);
            }
          }
        } catch (err) {
          console.log("Not connected yet");
        }

        // Listen for account changes
        if (detectedWallet.onAccountChange) {
          detectedWallet.onAccountChange((newAccount) => {
            if (newAccount) {
              setAccount(newAccount.address);
              setIsConnected(true);
            } else {
              setAccount(null);
              setIsConnected(false);
            }
          });
        }

        // Listen for disconnect
        if (detectedWallet.onDisconnect) {
          detectedWallet.onDisconnect(() => {
            setAccount(null);
            setIsConnected(false);
          });
        }
      }
    };

    detectWallet();
  }, [setAccount]);

  const connectWallet = async () => {
    if (!wallet) {
      alert("Please install Petra Wallet first");
      return;
    }

    try {
      // Use the standard connect method
      const response = await wallet.connect();
      
      if (response?.address) {
        setAccount(response.address);
        setIsConnected(true);
      } else if (response?.account?.address) {
        setAccount(response.account.address);
        setIsConnected(true);
      }
    } catch (err) {
      console.error("Connection error:", err);
      alert("Failed to connect wallet. Please try again.");
    }
  };

  const disconnectWallet = async () => {
    if (!wallet) return;

    try {
      await wallet.disconnect?.();
      setAccount(null);
      setIsConnected(false);
    } catch (err) {
      console.error("Disconnection error:", err);
    }
  };

  if (!wallet && typeof window !== 'undefined') {
    return (
      <div style={{
        padding: "16px",
        backgroundColor: "#fef3c7",
        border: "2px solid #f59e0b",
        borderRadius: "8px",
        textAlign: "center"
      }}>
        <p style={{ marginBottom: "12px", fontWeight: "600" }}>
          Petra Wallet Required
        </p>
        <a 
          href="https://petra.app/" 
          target="_blank" 
          rel="noreferrer"
          style={{
            display: "inline-block",
            padding: "8px 16px",
            backgroundColor: "#3b82f6",
            color: "white",
            textDecoration: "none",
            borderRadius: "6px",
            fontWeight: "500"
          }}
        >
          Install Petra Wallet
        </a>
        <p style={{ marginTop: "12px", fontSize: "14px", color: "#78716c" }}>
          After installing, refresh this page
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: "16px" }}>
      {isConnected ? (
        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          <button 
            style={{
              padding: "10px 20px",
              backgroundColor: "#10b981",
              color: "white",
              border: "none",
              borderRadius: "8px",
              fontWeight: "600",
              cursor: "default",
              display: "flex",
              alignItems: "center",
              gap: "8px"
            }}
          >
            <span style={{ fontSize: "18px" }}>✓</span>
            Connected
          </button>
          <button 
            onClick={disconnectWallet}
            style={{
              padding: "10px 20px",
              backgroundColor: "#ef4444",
              color: "white",
              border: "none",
              borderRadius: "8px",
              fontWeight: "600",
              cursor: "pointer",
              transition: "background-color 0.2s"
            }}
            onMouseEnter={(e) => e.target.style.backgroundColor = "#dc2626"}
            onMouseLeave={(e) => e.target.style.backgroundColor = "#ef4444"}
          >
            Disconnect
          </button>
        </div>
      ) : (
        <button 
          onClick={connectWallet}
          style={{
            padding: "10px 20px",
            backgroundColor: "#3b82f6",
            color: "white",
            border: "none",
            borderRadius: "8px",
            fontWeight: "600",
            cursor: "pointer",
            transition: "background-color 0.2s"
          }}
          onMouseEnter={(e) => e.target.style.backgroundColor = "#2563eb"}
          onMouseLeave={(e) => e.target.style.backgroundColor = "#3b82f6"}
        >
          Connect Wallet
        </button>
      )}
    </div>
  );
}
