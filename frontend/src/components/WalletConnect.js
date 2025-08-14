import React, { useState, useEffect } from "react";

export default function WalletConnect({ setAccount }) {
  const [isConnected, setIsConnected] = useState(false);

  const connectWallet = async () => {
    try {
      const { address } = await window.aptos.connect();
      setAccount(address);
      setIsConnected(true);
    } catch (err) {
      console.error("Connection error:", err);
    }
  };

  useEffect(() => {
    const checkConnection = async () => {
      if (window.aptos) {
        const connected = await window.aptos.isConnected();
        if (connected) {
          const account = await window.aptos.account();
          setAccount(account.address);
          setIsConnected(true);
        }
      }
    };
    checkConnection();
  }, [setAccount]);

  if (!window.aptos) {
    return (
      <div className="wallet-notice">
        <a href="https://petra.app/" target="_blank" rel="noreferrer">
          Install Petra Wallet
        </a>
      </div>
    );
  }

  return (
    <div className="wallet-connect">
      {isConnected ? (
        <button className="connected">Connected ✓</button>
      ) : (
        <button onClick={connectWallet}>Connect Wallet</button>
      )}
    </div>
  );
}