import React, { useState, useEffect } from "react";

export default function WalletConnect({ setAccount }) {
  const [isConnected, setIsConnected] = useState(false);
  const [walletAdapter, setWalletAdapter] = useState(null);

  useEffect(() => {
    // Initialize wallet adapter
    const initWallet = async () => {
      if (window.aptos) {
        try {
          setWalletAdapter(window.aptos);
          
          // Check if already connected
          const isWalletConnected = await window.aptos.isConnected();
          if (isWalletConnected) {
            const account = await window.aptos.account();
            setAccount(account.address);
            setIsConnected(true);
          }
        } catch (err) {
          console.error("Wallet initialization error:", err);
        }
      }
    };

    initWallet();

    // Listen for account changes
    const handleAccountChange = (newAccount) => {
      if (newAccount) {
        setAccount(newAccount.address);
        setIsConnected(true);
      } else {
        setAccount(null);
        setIsConnected(false);
      }
    };

    if (window.aptos) {
      window.aptos.onAccountChange(handleAccountChange);
    }

    return () => {
      // Cleanup listener if needed
      if (window.aptos && window.aptos.onAccountChange) {
        // Note: Petra doesn't have a removeListener method, but we clean up on unmount
      }
    };
  }, [setAccount]);

  const connectWallet = async () => {
    if (!walletAdapter) {
      console.error("Wallet adapter not initialized");
      return;
    }

    try {
      const response = await walletAdapter.connect();
      if (response) {
        setAccount(response.address);
        setIsConnected(true);
      }
    } catch (err) {
      console.error("Connection error:", err);
    }
  };

  const disconnectWallet = async () => {
    if (!walletAdapter) return;

    try {
      await walletAdapter.disconnect();
      setAccount(null);
      setIsConnected(false);
    } catch (err) {
      console.error("Disconnection error:", err);
    }
  };

  if (!window.aptos) {
    return (
      <div style={{
        padding: "16px",
        backgroundColor: "#f3f4f6",
        borderRadius: "8px",
        textAlign: "center"
      }}>
        <p style={{ marginBottom: "8px" }}>Petra Wallet not detected</p>
        <a 
          href="https://petra.app/" 
          target="_blank" 
          rel="noreferrer"
          style={{
            color: "#3b82f6",
            textDecoration: "underline"
          }}
        >
          Install Petra Wallet
        </a>
      </div>
    );
  }

  return (
    <div style={{ padding: "16px" }}>
      {isConnected ? (
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <button 
            style={{
              padding: "8px 16px",
              backgroundColor: "#10b981",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: "default"
            }}
          >
            Connected ✓
          </button>
          <button 
            onClick={disconnectWallet}
            style={{
              padding: "8px 16px",
              backgroundColor: "#ef4444",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer"
            }}
          >
            Disconnect
          </button>
        </div>
      ) : (
        <button 
          onClick={connectWallet}
          style={{
            padding: "8px 16px",
            backgroundColor: "#3b82f6",
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer"
          }}
        >
          Connect Wallet
        </button>
      )}
    </div>
  );
}
