// utils/aptos.js - APTOS blockchain interaction utilities

import { AptosClient } from "aptos";

// Network configuration
const TESTNET_NODE_URL = "https://fullnode.testnet.aptoslabs.com";
const DEVNET_NODE_URL = "https://fullnode.devnet.aptoslabs.com";
const MAINNET_NODE_URL = "https://fullnode.mainnet.aptoslabs.com";

// Initialize client with fallback URLs
let client = new AptosClient(TESTNET_NODE_URL);

// Alternative endpoints in case primary fails
const BACKUP_ENDPOINTS = [
  "https://testnet.aptosdev.com",
  "https://aptos-testnet.public.blastapi.io",
  "https://rpc.ankr.com/http/aptos_testnet/v1"
];

/**
 * Initialize APTOS client with network detection
 * @param {string} network - Network to connect to (testnet, devnet, mainnet)
 */
export function initializeClient(network = 'testnet') {
  let nodeUrl;
  
  switch (network.toLowerCase()) {
    case 'mainnet':
      nodeUrl = MAINNET_NODE_URL;
      break;
    case 'devnet':
      nodeUrl = DEVNET_NODE_URL;
      break;
    case 'testnet':
    default:
      nodeUrl = TESTNET_NODE_URL;
      break;
  }
  
  client = new AptosClient(nodeUrl);
  console.log(`APTOS client initialized for ${network}: ${nodeUrl}`);
}

/**
 * Check if APTOS client is working
 * @returns {Promise<boolean>} - True if client is working
 */
export async function checkConnection() {
  try {
    const ledgerInfo = await client.getLedgerInfo();
    console.log('APTOS connection successful:', {
      chainId: ledgerInfo.chain_id,
      ledgerVersion: ledgerInfo.ledger_version
    });
    return true;
  } catch (error) {
    console.warn('Primary APTOS endpoint failed, trying backups...');
    
    // Try backup endpoints
    for (const endpoint of BACKUP_ENDPOINTS) {
      try {
        const backupClient = new AptosClient(endpoint);
        const ledgerInfo = await backupClient.getLedgerInfo();
        client = backupClient;
        console.log(`Connected to backup endpoint: ${endpoint}`);
        return true;
      } catch (backupError) {
        console.warn(`Backup endpoint ${endpoint} failed:`, backupError.message);
      }
    }
    
    console.error('All APTOS endpoints failed:', error.message);
    return false;
  }
}

/**
 * Call a view function on the smart contract
 * @param {string} functionName - Full function name (address::module::function)
 * @param {Array} args - Function arguments
 * @param {Array} typeArgs - Type arguments (optional)
 * @returns {Promise<any>} - Function result
 */
export async function viewFunction(functionName, args = [], typeArgs = []) {
  try {
    console.log(`Calling view function: ${functionName}`, { args, typeArgs });
    
    const result = await client.view({
      function: functionName,
      arguments: args,
      type_arguments: typeArgs
    });
    
    console.log(`View function result:`, result);
    return result;
    
  } catch (error) {
    console.error(`View function call failed: ${functionName}`, error);
    
    // Try to extract more specific error information
    let errorMessage = error.message;
    if (error.response?.data?.message) {
      errorMessage = error.response.data.message;
    } else if (error.response?.data?.error_code) {
      errorMessage = `Error code: ${error.response.data.error_code}`;
    }
    
    throw new Error(`View function failed: ${errorMessage}`);
  }
}

/**
 * Submit a transaction to the blockchain
 * @param {Object} transaction - Transaction payload
 * @param {string} senderAddress - Sender's address
 * @returns {Promise<string>} - Transaction hash
 */
export async function submitTransaction(transaction, senderAddress) {
  try {
    console.log('Submitting transaction:', transaction);
    
    // Check if wallet is available
    if (!window.aptos) {
      throw new Error('Petra wallet not found. Please install Petra wallet extension.');
    }
    
    // Ensure we're on the right network
    const network = await window.aptos.network();
    if (network !== 'Testnet') {
      throw new Error(`Wrong network: ${network}. Please switch to Testnet in Petra wallet.`);
    }
    
    // Sign and submit transaction
    const txResult = await window.aptos.signAndSubmitTransaction(transaction);
    console.log('Transaction submitted:', txResult.hash);
    
    // Wait for transaction confirmation
    const confirmedTx = await client.waitForTransaction(txResult.hash);
    console.log('Transaction confirmed:', confirmedTx);
    
    return txResult.hash;
    
  } catch (error) {
    console.error('Transaction submission failed:', error);
    
    // Extract user-friendly error messages
    let errorMessage = error.message;
    
    if (error.message?.includes('INSUFFICIENT_BALANCE')) {
      errorMessage = 'Insufficient balance to pay for transaction fees';
    } else if (error.message?.includes('SEQUENCE_NUMBER')) {
      errorMessage = 'Transaction sequence error. Please try again.';
    } else if (error.message?.includes('GAS_UNIT_PRICE_TOO_LOW')) {
      errorMessage = 'Gas price too low. Please increase gas fee.';
    } else if (error.message?.includes('TRANSACTION_EXPIRED')) {
      errorMessage = 'Transaction expired. Please try again.';
    }
    
    throw new Error(errorMessage);
  }
}

/**
 * Get account information
 * @param {string} address - Account address
 * @returns {Promise<Object>} - Account info
 */
export async function getAccountInfo(address) {
  try {
    const accountInfo = await client.getAccount(address);
    console.log('Account info retrieved:', accountInfo);
    return accountInfo;
  } catch (error) {
    console.error('Failed to get account info:', error);
    throw new Error(`Failed to get account info: ${error.message}`);
  }
}

/**
 * Get account balance
 * @param {string} address - Account address
 * @returns {Promise<string>} - Balance in APT
 */
export async function getAccountBalance(address) {
  try {
    const resources = await client.getAccountResources(address);
    const coinResource = resources.find(r => r.type === "0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>");
    
    if (!coinResource) {
      return "0";
    }
    
    const balance = coinResource.data.coin.value;
    const balanceInApt = (parseInt(balance) / 100000000).toFixed(8); // Convert octas to APT
    
    console.log(`Account balance: ${balanceInApt} APT`);
    return balanceInApt;
    
  } catch (error) {
    console.error('Failed to get account balance:', error);
    return "0";
  }
}

/**
 * Get transaction details
 * @param {string} txHash - Transaction hash
 * @returns {Promise<Object>} - Transaction details
 */
export async function getTransaction(txHash) {
  try {
    const transaction = await client.getTransactionByHash(txHash);
    console.log('Transaction details:', transaction);
    return transaction;
  } catch (error) {
    console.error('Failed to get transaction:', error);
    throw new Error(`Failed to get transaction: ${error.message}`);
  }
}

/**
 * Estimate gas for a transaction
 * @param {Object} transaction - Transaction payload
 * @param {string} senderAddress - Sender address
 * @returns {Promise<number>} - Estimated gas units
 */
export async function estimateGas(transaction, senderAddress) {
  try {
    const gasEstimate = await client.estimateGasPrice();
    console.log('Gas estimate:', gasEstimate);
    return gasEstimate.gas_estimate || 1000; // Default fallback
  } catch (error) {
    console.warn('Gas estimation failed, using default:', error.message);
    return 1000; // Default gas units
  }
}

/**
 * Check if an account exists
 * @param {string} address - Account address to check
 * @returns {Promise<boolean>} - True if account exists
 */
export async function accountExists(address) {
  try {
    await client.getAccount(address);
    return true;
  } catch (error) {
    if (error.status === 404) {
      return false;
    }
    throw error;
  }
}

/**
 * Get module information
 * @param {string} moduleAddress - Module address
 * @param {string} moduleName - Module name
 * @returns {Promise<Object>} - Module info
 */
export async function getModuleInfo(moduleAddress, moduleName) {
  try {
    const module = await client.getAccountModule(moduleAddress, moduleName);
    console.log('Module info:', module);
    return module;
  } catch (error) {
    console.error('Failed to get module info:', error);
    throw new Error(`Module not found: ${moduleAddress}::${moduleName}`);
  }
}

/**
 * Validate an Aptos address
 * @param {string} address - Address to validate
 * @returns {boolean} - True if valid
 */
export function isValidAddress(address) {
  if (!address || typeof address !== 'string') {
    return false;
  }
  
  // Remove 0x prefix if present
  const cleanAddress = address.startsWith('0x') ? address.slice(2) : address;
  
  // Check length (32 bytes = 64 hex characters)
  if (cleanAddress.length !== 64) {
    return false;
  }
  
  // Check if all characters are valid hex
  return /^[0-9a-fA-F]{64}$/.test(cleanAddress);
}

/**
 * Format address for display (shorten middle part)
 * @param {string} address - Full address
 * @param {number} prefixLength - Length of prefix to show
 * @param {number} suffixLength - Length of suffix to show
 * @returns {string} - Formatted address
 */
export function formatAddress(address, prefixLength = 6, suffixLength = 4) {
  if (!address) return '';
  
  if (address.length <= prefixLength + suffixLength + 3) {
    return address;
  }
  
  return `${address.slice(0, prefixLength)}...${address.slice(-suffixLength)}`;
}

/**
 * Wait for transaction with custom timeout
 * @param {string} txHash - Transaction hash
 * @param {number} timeoutMs - Timeout in milliseconds (default: 30000)
 * @returns {Promise<Object>} - Transaction result
 */
export async function waitForTransaction(txHash, timeoutMs = 30000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    try {
      const transaction = await client.getTransactionByHash(txHash);
      if (transaction.success !== undefined) {
        console.log(`Transaction ${txHash} completed:`, transaction.success ? 'SUCCESS' : 'FAILED');
        return transaction;
      }
    } catch (error) {
      // Transaction not found yet, continue waiting
    }
    
    // Wait 1 second before checking again
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  throw new Error(`Transaction ${txHash} timeout after ${timeoutMs}ms`);
}

/**
 * Test all APTOS utilities
 * @returns {Promise<boolean>} - True if all tests pass
 */
export async function testAptos() {
  try {
    console.log('Testing APTOS utilities...');
    
    // Test connection
    const connectionTest = await checkConnection();
    if (!connectionTest) {
      throw new Error('Connection test failed');
    }
    
    // Test address validation
    const validAddress = '0x1';
    const invalidAddress = 'invalid';
    
    const addressTest1 = isValidAddress('0x0000000000000000000000000000000000000000000000000000000000000001');
    const addressTest2 = !isValidAddress(invalidAddress);
    
    if (!addressTest1 || !addressTest2) {
      throw new Error('Address validation test failed');
    }
    
    // Test view function (get ledger info equivalent)
    try {
      const ledgerInfo = await client.getLedgerInfo();
      console.log('Ledger info test passed:', ledgerInfo.chain_id);
    } catch (error) {
      throw new Error('Ledger info test failed');
    }
    
    console.log('All APTOS tests PASSED');
    return true;
    
  } catch (error) {
    console.error('APTOS test failed:', error);
    return false;
  }
}

// Initialize client on import
initializeClient('testnet');

// Export all functions
export default {
  initializeClient,
  checkConnection,
  viewFunction,
  submitTransaction,
  getAccountInfo,
  getAccountBalance,
  getTransaction,
  estimateGas,
  accountExists,
  getModuleInfo,
  isValidAddress,
  formatAddress,
  waitForTransaction,
  testAptos
};