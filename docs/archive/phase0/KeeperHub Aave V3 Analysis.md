# **Integration Architecture and Operational Analysis of the KeeperHub Aave V3 Plugin**

The emergence of autonomous onchain agents requires execution infrastructure that can bridge the gap between cognitive reasoning and reliable transaction execution1. Traditional decentralized applications rely on user-initiated wallet signatures, but automated strategies require robust systems that manage transaction retries, mitigate gas volatility, prevent Miner Extractable Value (MEV) extraction, and maintain comprehensive audit trails1.  
KeeperHub functions as a reliable execution plane for these onchain processes1. It exposes pre-integrated protocol capabilities via a visual workflow builder, a command-line interface, and a Model Context Protocol (MCP) server4.  
This report provides a technical analysis of the KeeperHub Aave V3 plugin6. It evaluates its schema completeness, details its operational dependencies, maps a native Web3 fallback integration path, and outlines the economic mechanisms that govern its execution5.

## **Architectural Verdict and Plugin Capabilities**

The KeeperHub Aave V3 plugin **fully covers** the requirements for automated debt management, asset supply, and credit-health monitoring6. The plugin exposes seven discrete actions that cover the primary interactions with the Aave V3 lending pool, making a custom smart contract fallback unnecessary under standard operating conditions6.  
The action matrix below details the capabilities exposed by the Aave V3 plugin on KeeperHub6:

| Action Name | Action Type | Credentials Required | Primary Function |
| :---- | :---- | :---- | :---- |
| **Supply Asset** | Write | Wallet Integration | Supplies ERC-20 assets to the Aave lending pool to earn yield6. |
| **Withdraw Asset** | Write | Wallet Integration | Withdraws supplied assets from the pool back to a recipient address6. |
| **Borrow Asset** | Write | Wallet Integration | Borrows an asset against supplied collateral using variable interest rates6. |
| **Repay Debt** | Write | Wallet Integration | Repays an outstanding variable or stable rate borrow position6. |
| **Set Asset as Collateral** | Write | Wallet Integration | Enables or disables a specific supplied asset to back borrowed debt6. |
| **Get User Account Data** | Read | None (Public RPC) | Queries overall health, collateral values, total debt, and borrowing power6. |
| **Get User Reserve Data** | Read | None (Public RPC) | Queries specific user balances and rates for a given underlying asset6. |

## **Specific Action Schemas and Parameter Decoupling**

Executing operations through the Aave V3 plugin requires a precise configuration of inputs and parameters6. The schemas for the three primary actions required to monitor, supply, and repay lending positions are defined below6.

### **Get User Account Data (Read Action)**

This read-only query monitors the user's borrowing capacity and liquidation risk6. It does not require transaction signatures or gas fees6.

* **Inputs:** user (address)6.  
* **Contextual Routing:** The schema does not require an explicit chain id parameter6. Instead, the network context is inherited from the parent workflow execution environment5. Workflows run globally on a selected target network, which automatically configures the appropriate RPC endpoints and contract addresses5.

### **Supply Asset (Write Action)**

This action transfers ERC-20 tokens from the executing wallet into the Aave liquidity pool6.

* **Inputs:**  
  * asset (address): The contract address of the underlying ERC-20 token6.  
  * amount (uint256): The deposit amount denominated in the asset's base unit (wei)6.  
  * onBehalfOf (address): The destination address that will receive the resulting interest-bearing ![][image1]6.  
  * referralCode (uint16): An optional referral identifier (defaults to ![][image2])6.

### **Repay Debt (Write Action)**

This action returns borrowed assets to the pool, reducing the outstanding debt balance6.

* **Inputs:**  
  * asset (address): The contract address of the underlying ERC-20 token to return6.  
  * amount (uint256): The amount to repay in wei6. Users can specify ![][image3] to repay the entire outstanding debt6.  
  * interestRateMode (uint256): The borrowing rate mode (![][image4] for Variable, which is the standard default, or ![][image5] for Stable)6.  
  * onBehalfOf (address): The target address whose debt is being settled6.

### **Decoupling of Execution and Target Parameters**

The repayment schema separates the transaction signer (walletId) from the target account being paid off (onBehalfOf)6. The walletId specifies the Turnkey-backed MPC wallet managed by KeeperHub, which signs the transaction, pays the gas fees, and provides the underlying ERC-20 tokens5.  
The onBehalfOf parameter specifies which target address's debt is being reduced6. This separation enables automated agents to monitor and pay down debt on behalf of external addresses, such as multisig treasuries or client accounts, without needing direct ownership of those accounts6.

## **Write Operation Mechanics and Execution Credentials**

Executing write operations on the blockchain through automated workflows requires robust key management and precise execution sequencing5.

### **Credentials and Wallet Formats**

Write actions in the Aave V3 plugin require a secure execution signer6. The plugin expects a walletId formatted as a unique UUID string, which is retrieved using the get\_wallet\_integration tool10.  
This identifier maps the execution request to a secure hardware enclave managed by Para or Turnkey MPC integrations5. The private keys are generated inside these secure enclaves and never leave the hardware boundary, allowing the agent to execute transactions without exposing raw private keys5.

### **Token Approvals and Receipt Management**

Understanding the flow of token approvals and receipt tokens is critical for avoiding reverted transactions during execution6:

* **ERC-20 Approvals:** The plugin **does not** handle asset approvals automatically6. Before invoking Supply Asset or Repay Debt, the executing wallet must grant approval to the Aave V3 Pool contract to spend the underlying ERC-20 tokens6. This approval must be configured as a separate step using a generic Web3 Write Contract action prior to the Aave plugin action5.  
* **Debt Token and aToken Management:** The protocol manages receipt tokens (![][image1]) and debt obligations (![][image6]) automatically onchain12. When a Supply action executes, the Aave smart contracts mint the corresponding ![][image1] directly to the onBehalfOf address6. No additional approval or transfer steps are required to manage these receipt tokens6.

### **Multi-Chain Availability**

The KeeperHub platform and its underlying Web3 plugins are available on both **Ethereum Mainnet (Chain ID 1\)** and **Ethereum Sepolia (Chain ID 11155111\)**5. This multi-chain support allows developers to test their integration flows in a sandboxed testnet environment before deploying them to mainnet7.

## **Operational Economics and Billing Architecture**

The cost structure of executing actions through KeeperHub depends on how the integrations are triggered and billed4.

### **Rules Engine Integration**

The core Aave V3 plugin functions as a user-authored rules engine5. Developers write their own conditional rules (such as checking if a health factor drops below a threshold and then triggering a repayment)5. KeeperHub does not charge a premium or licensing fee to use these pre-built protocol actions4.

### **Billing Models and Payment Rails**

KeeperHub supports two primary billing models to accommodate different operational needs4:

* **Subscription Packages:** Users can sign up for standard platform tiers, which cover operational run limits, data logging, and concurrent workflow configurations14.  
* **Agentic Pay-Per-Call (x402 and MPP):** For fully autonomous agents that operate without human intervention, KeeperHub supports on-the-fly execution payments via the x402 and MPP protocols2. When an agent triggers an action via an API request, the platform returns an HTTP 402 Payment Required challenge2. The agent's wallet automatically settles this payment in USDC on a supported network (such as Base or Tempo), funding the transaction execution dynamically2.

## **Native Web3 Fallback Specifications**

If the pre-built Aave V3 plugin experience issues, developers can implement a fallback path using generic web3/read-contract and web3/write-contract actions5. This fallback path interacts directly with the canonical Aave V3 smart contracts16.  
The table below lists the verified contract addresses for the Aave V3 Pool and its registry provider on both supported networks17:

| Network Name | Chain ID | Contract Role | Verified Contract Address |
| :---- | :---- | :---- | :---- |
| **Ethereum Mainnet** | 1 | Aave V3 Pool Proxy | 0x87870Bca3F3fF504DD47580b5e7c5Cc535ACcd29 \[cite: 17\] |
| **Ethereum Mainnet** | 1 | Pool Addresses Provider | 0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e \[cite: 18\] |
| **Ethereum Sepolia** | 11155111 | Aave V3 Pool Proxy | 0x6Ae43d3271ffe43ae11119e5cde0c50b7efbe56b |
| **Ethereum Sepolia** | 11155111 | Pool Addresses Provider | 0x0496b66Ed0C8E247978e49b0ca6741C24eb6E374 |

*Note on Address Verification:* Some test environments reference 0x6A676b1e566c20A40C7F7f9Fd9c0fA28F9c5d5A8 for the Sepolia Pool. However, the canonical Aave V3 Pool Proxy registered under the official Addresses Provider on Sepolia is 0x6Ae43d3271ffe43ae11119e5cde0c50b7efbe56b.

### **Fallback Read Path**

The fallback read path uses getUserAccountData on the Pool proxy contract to retrieve key account metrics6.

#### **Solidity Function Signature**

Solidity  
function getUserAccountData(address user)   
    external   
    view   
    returns (  
        uint256 totalCollateralBase,  
        uint256 totalDebtBase,  
        uint256 availableBorrowsBase,  
        uint256 currentLiquidationThreshold,  
        uint256 ltv,  
        uint256 healthFactor  
    );

#### **Application Binary Interface (ABI) Specification**

JSON  
{  
  "inputs": \[  
    { "internalType": "address", "name": "user", "type": "address" }  
  \],  
  "name": "getUserAccountData",  
  "outputs": \[  
    { "internalType": "uint256", "name": "totalCollateralBase", "type": "uint256" },  
    { "internalType": "uint256", "name": "totalDebtBase", "type": "uint256" },  
    { "internalType": "uint256", "name": "availableBorrowsBase", "type": "uint256" },  
    { "internalType": "uint256", "name": "currentLiquidationThreshold", "type": "uint256" },  
    { "internalType": "uint256", "name": "ltv", "type": "uint256" },  
    { "internalType": "uint256", "name": "healthFactor", "type": "uint256" }  
  \],  
  "stateMutability": "view",  
  "type": "function"  
}

The returned variables represent different values depending on their unit scaling6:

* **Base Balances (totalCollateralBase, totalDebtBase, availableBorrowsBase):** Denominated in USD and scaled to ![][image7] decimal places (![][image8])6.  
* **Percentages (currentLiquidationThreshold, ltv):** Scaled to ![][image9] decimal places (![][image10]). For example, a liquidation threshold of ![][image11] is returned as ![][image12].  
* **Health Factor (healthFactor):** Returned with ![][image13] decimal places (![][image14])6. A health factor below ![][image15] indicates that the position is open to liquidation, while a value above ![][image16] is typically considered safe.

### **Fallback Write Paths**

The signatures for direct smart contract interaction with Aave V3 are defined below6.

#### **Supply Function Signature**

Solidity  
function supply(  
    address asset,   
    uint256 amount,   
    address onBehalfOf,   
    uint16 referralCode  
) external;

#### **Repay Function Signature**

Solidity  
function repay(  
    address asset,   
    uint256 amount,   
    uint256 interestRateMode,   
    address onBehalfOf  
) external returns (uint256);

## **Diagnostic and Account Health Verification Script**

The following Node.js script provides a test outline for verifying the read fallback path. It queries the getUserAccountData function on Ethereum Sepolia and evaluates the returned health factor against the safety threshold6.

JavaScript  
const { ethers } \= require("ethers");

// ABI configuration for direct read call fallback  
const AAVE\_POOL\_ABI \= \[  
  {  
    "inputs": \[  
      { "internalType": "address", "name": "user", "type": "address" }  
    \],  
    "name": "getUserAccountData",  
    "outputs": \[  
      { "internalType": "uint256", "name": "totalCollateralBase", "type": "uint256" },  
      { "internalType": "uint256", "name": "totalDebtBase", "type": "uint256" },  
      { "internalType": "uint256", "name": "availableBorrowsBase", "type": "uint256" },  
      { "internalType": "uint256", "name": "currentLiquidationThreshold", "type": "uint256" },  
      { "internalType": "uint256", "name": "ltv", "type": "uint256" },  
      { "internalType": "uint256", "name": "healthFactor", "type": "uint256" }  
    \],  
    "stateMutability": "view",  
    "type": "function"  
  }  
\];

const CONFIG \= {  
  sepolia: {  
    rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",  
    poolAddress: "0x6Ae43d3271ffe43ae11119e5cde0c50b7efbe56b"  
  }  
};

async function verifyAccountHealth(userAddress) {  
  console.log(\`Initializing Sepolia connection...\`);  
  const provider \= new ethers.JsonRpcProvider(CONFIG.sepolia.rpcUrl);  
  const poolContract \= new ethers.Contract(CONFIG.sepolia.poolAddress, AAVE\_POOL\_ABI, provider);

  try {  
    console.log(\`Querying account data for address: ${userAddress}\`);  
    const data \= await poolContract.getUserAccountData(userAddress);

    // Parsing returned parameters  
    const totalCollateralUSD \= ethers.formatUnits(data.totalCollateralBase, 8);  
    const totalDebtUSD \= ethers.formatUnits(data.totalDebtBase, 8);  
    const rawHealthFactor \= data.healthFactor;  
    const healthFactor \= ethers.formatUnits(rawHealthFactor, 18);

    console.log("\\n--- Aave Account Health Report \---");  
    console.log(\`Total Collateral : $${totalCollateralUSD} USD\`);  
    console.log(\`Total Debt       : $${totalDebtUSD} USD\`);  
    console.log(\`Health Factor    : ${healthFactor}\`);

    const liquidationLimit \= ethers.parseUnits("1.0", 18);  
    const safetyBuffer \= ethers.parseUnits("1.5", 18);

    if (rawHealthFactor \=== ethers.MaxUint256) {  
      console.log("Status: SECURE (No active borrows on this account)");  
    } else if (rawHealthFactor \< liquidationLimit) {  
      console.log("Status: CRITICAL (Health factor is below 1.0; position is liquidatable)");  
    } else if (rawHealthFactor \< safetyBuffer) {  
      console.log("Status: WARNING (Health factor is below the 1.5 safety threshold)");  
    } else {  
      console.log("Status: SECURE (Health factor is within the safe range)");  
    }

  } catch (error) {  
    console.error("Failed to query user account data from Aave Pool:", error);  
  }  
}

// Example execution utilizing a zero address placeholder  
const TARGET\_USER \= "0x0000000000000000000000000000000000000000";  
verifyAccountHealth(TARGET\_USER);

#### **Works cited**

1. KeeperHub \- ETHGlobal, [https://ethglobal.com/events/openagents/prizes/keeperhub](https://ethglobal.com/events/openagents/prizes/keeperhub)  
2. AI Agent Execution Layer \- MCP, x402, MPP, ERC-8004 | KeeperHub, [https://keeperhub.com/agents](https://keeperhub.com/agents)  
3. KeeperHub vs. Chainlink Automation \- Web3 Automation Platform Comparison, [https://keeperhub.com/compare/chainlink](https://keeperhub.com/compare/chainlink)  
4. KeeperHub \- The execution layer for onchain agents, [https://keeperhub.com/](https://keeperhub.com/)  
5. KeeperHub \- GitHub, [https://github.com/KeeperHub/keeperhub](https://github.com/KeeperHub/keeperhub)  
6. [https://docs.keeperhub.com/plugins/aave-v3](https://docs.keeperhub.com/plugins/aave-v3)  
7. KeeperHub Docs: Overview, [https://docs.keeperhub.com/](https://docs.keeperhub.com/)  
8. Enterprise Blockchain Automation Solutions \- KeeperHub, [https://keeperhub.com/enterprise](https://keeperhub.com/enterprise)  
9. DAO Treasury Automation \- Multi-sig Monitoring and Governance Tools | KeeperHub, [https://keeperhub.com/daos](https://keeperhub.com/daos)  
10. MeritScore | ETHGlobal, [https://ethglobal.com/showcase/meritscore-14i2e](https://ethglobal.com/showcase/meritscore-14i2e)  
11. Testing & Debugging | Aave Protocol Documentation, [https://aave.com/docs/aave-v3/smart-contracts/testing-and-debugging](https://aave.com/docs/aave-v3/smart-contracts/testing-and-debugging)  
12. View Contracts | Aave Protocol Documentation, [https://aave.com/docs/aave-v3/smart-contracts/view-contracts](https://aave.com/docs/aave-v3/smart-contracts/view-contracts)  
13. Aave Earn | Aave Protocol Documentation, [https://aave.com/docs/aave-v3/vaults/overview](https://aave.com/docs/aave-v3/vaults/overview)  
14. KeeperHub MCP: Blockchain Automated Workflow MCP Tool with Natural Language Operation Support, [https://mcp.aibase.com/server/1639703010877907351](https://mcp.aibase.com/server/1639703010877907351)  
15. KeeperHub \- GitHub, [https://github.com/KeeperHub](https://github.com/KeeperHub)  
16. Pool Addresses Provider | Aave Protocol Documentation, [https://aave.com/docs/aave-v3/smart-contracts/pool-addresses-provider](https://aave.com/docs/aave-v3/smart-contracts/pool-addresses-provider)  
17. Aave: Pool V3 | Address: 0x87870bca...50b4fa4e2 \- Etherscan, [https://etherscan.io/address/0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2](https://etherscan.io/address/0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2)  
18. Aave: Pool Address Provider V3 | Address: 0x2f39d218...34Ad94E9e | Etherscan, [https://etherscan.io/address/0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e](https://etherscan.io/address/0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e)

[image1]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAE8AAAAaCAYAAAD2dwHCAAADnklEQVR4Xu2XWajNURjFl3nMnLFclBRJHhQZHhAehIzxQCTKlOHBmEQkIh4MRWTKPETm6SrzLFNE3XgwFck8W6tv7+4++/6Pex/vzf9Xq87+9j777OEb9gFSUlJSUlJSihdDqD/UJ+oRdY9672xvqPvUE+ob9Z3qbF8rMlOph7A5p0V9JZ5j1AKqQmA7BTu8FoEth/pB1Q1sRWUsbL52cUdJpg51IbJVpL5QzyK7uBMbishOmBeXjjtKMuOoYZGtO8xL1kd2HerJyFYUylBvqW1xR3GnPDWLOk7tpeZTp6nhrr+ZGxOyGHZ4yoUhZanmka0yNRc2537qCjUhYwTQATaf/82u1C7qKtXJDwr6tM7d1CFqFVXK9fWGXd5dqiVsPnm0xl2n2rhxIVrfCmofdcCpRsaILCiHnaWOIv+A1sI20tMPSuAG9RsW0v+iPmwjm6hyztYYNv9gP4jMczaNH0GNpwZRX6kZ+cOwjHpBtQ5sl1xbe1Eelhc/p17D8qhHh6eDidlMrXSfG8FS0cj87uxoMT9hid4zHZb0qwa2kNqwg7sZd0Qod2ljWkylqO8dzLM8F2EVW5VW3iO6wMK4oWvrUHXAPoXokPpQ12AXLw+dSNWkfsE8MkSvgaTD+0htgBU5Hd5qql7GiAR0CLrZM5FdXqhNZ2MgbBNL4o4IbUzjlAZC5K2yK4SFQkQX+BnmHaNRME2IW7Bn0B5qByxsZ1LVw0GkP2z+joGtqbNNCWyec7A+6TbVPrM7mb6wL8jTPFq03nKLAluMD+secUfEcti4eDEKV9nlJWKAa+ttqLEKt6TCkXTRSayhPsDyr2cOzBvlWTG6PL0zlRt1OXkZvVnoh4KHoGQsWy9YGKjSxjyFbSQOxZilsLni5KuErod2Fdf2m/U5UcldISZGIT/3voTlp5gcqlbQ1ncPBm3xmDrsPq+DhaiKlNKHfsMzG5YvC0UT6K021LW1iAewDevzRmQ+gIUqqfpzI3sSbWG5s5trqyKq6ubBKqEn3JjQZx2wctoJWDUU8mTlxdCjdPGq4j4vat1anwqOx6eJMbBqu9XZJ8Hysd+jcrxCeLJrF4pu9Tws/2yhWsEqVi7s+SIawPKN8oFuXwvR3zBtRPYmblwSSg3Kn3pa6F/KQmR6iSrkK1joeuTxmlseGEaFPF0HqNBVvtOatUZ/uEJFRtU4Dk85wmWY1/lCWI3aTh2BzaULC6tzSkpKSkpKSkrKf8ZftzDP6/oy/EYAAAAASUVORK5CYII=>

[image2]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAaCAYAAACO5M0mAAAAz0lEQVR4Xu2RMatBYRyHj09AyqBk5y4oM4uvIIusFguTsl+fQEwiq+5wPwCDycAmZbRciyys9z4nv79eymVVnnqG9zm/zumc43mvRQonOMMFNjBwtYA47rGscxhX2LosRAfXN62KRwxa8G+/w7EFkcdfLFqIKfQtiLT6p4WsQs+C+FAfWsgpdC2IhPqXhbzCw+G9RyfVRxaeHkYVBhaEvXXbjT/47QYoeOdhyY3+n9m4Aep4wpAb/Y9+wIrOEdxi87JwyOAU57jE2tXVN//xBxjyMMcov/oxAAAAAElFTkSuQmCC>

[image3]: <data:image/png;base64,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>

[image4]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAaCAYAAACO5M0mAAAA1ElEQVR4Xu3RPwtBURzG8YOFhbKYmEwG8grcRFlkMJiMMnsJyqSMJruXYPAGbAaRBa9AKTFI/nyvc0/97uWWVXnq0+0859e5t3OV+q1UscDJebYQcE2QEuZIIIohHujJITszFMQ6hC3uSMryhh1ipiQjpU9tmyKIg1OmTUkGTtcRncqjLAsyVXrQ27uSwhUrpd/omzGOyHo3ZJo4w/L0b/lqMIc9it4NmTjWqIjOQkOsX5c+QV2WpIuaLPpKf9fSYV/LBhdkzFBE6Yv9xP7XYTP4j2+ePKUs7suvVZQAAAAASUVORK5CYII=>

[image5]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAaCAYAAACO5M0mAAAAaElEQVR4XmNgGLpAHl0AGXABsRUQbwLiLWhycJAJxK+AeCsQ/2HAoxAZ/GAYZgpBvicISFK4HV0QGwAp3IEuiA2AFO5EF0QHLED8E4gPokvAgDcQ3wXi90D8H4pfAPEdIBZEUjcKsAMAhiUd8FGUIDsAAAAASUVORK5CYII=>

[image6]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGgAAAAaCAYAAABb9hlrAAAE90lEQVR4Xu2YdahtRRTGP7sLbFGfPmzF7lZQsDEwUHzYioXdipjY3Txbsbvj2ordggHyRESxsNvvx5q5Z+7c+845/nllfvBxz6w1e+/Za2bWrH2lRqPRaDQajcb/i/WsCdY/1ouVrxvnWR9bP1gbV76Sda01K9t7iud9ln5/mNp/WR9Y71pfpfYj6Zp+mdV61vpCcY9Jh7pHJ7MpAnR67ejB2dbv1gy1IzGZ9Y11WWFbxfrEWqqwraF4/k2FbRLFdRcXtv/C59b9tXG0soMiQOvXjh68bj1WGwtWV9x3u8J2rrVR0YbjFf12qex7WvtUtn5YTHG//WrHaOU66ydrqtrRhTmsv62DakfBMYo+pB0g3TzVcQ9CSiKg81b2UzQ8PfYDY+J+C9WO0cCU1rHWo9Y91hmKXP1A2cnMZJ1k3WXdaj1hrVT4d1IEYbx1r/W8IqBMwu2Ks4T0xxnF76etya2xXFxAevzDer+yA30Zb8lq1t2KsXM+3WfNN6SH9LAijcK01pmKa24b7BGQgndPvlsUMdk1+Vis11uvKq6f27rcutl6QxM/DtZWxJL7Pa6IU98wWALFC+TdcoUi0AfkTmZhRQ6nEMiH7IaKwGfYdX9aO6f2NNbP1h6pzbN+VbxcNzZVPP/82jEC+yvOtHKhXGW9rQg2TG39Yl2i2LmcYQtaLyd7ZjpFLJ6xZkk2xvxl+n2gtY1iwhgfMZsz+TZJtmVSO0Nq/VYxmXCc9WnH3ZsLFEEdU9gOUzxs0dTmRamqqK5Y8TCXYnLK1cAEXl204Tt1JnEDxX27VXjAIqDfZrWjgnOLfvtWdhYW9sVTOz/3KOscxUTARdZe6Tew89nhY1KbfkdbV6Y2C5DdSyHExJbpd0eNPEGHWD8qih5it7c1ruzQjdkVAyJVlXDIl7O8ueLhrEqqKtIbg6ZcziyZ+jDQzALJxtYGUgCpa2IVXuYdRb8Za0fFa4pzcvrKzqLjuUun9lmK8pxAMUGMtYadxTMpxUlZjPlGRTbIOzHzliL1lVxjfa3hfSmyOHMZD6mdxZcXeU+2VFx4eGHL6YDcmjlS0W+twlZDGqMPOytDxYUtV06vWC903CNCyuAazq9ucB7S76HaodjpBHqK1GZhkfuZSNLbbxo+Sasq7kcK6kYeXxkzUvn31qWFrYTvSnZd/tYbN8TbhS0UF5ACMsw4tq0V25KSljSAjbxds2z6y4AZZAnV2QRFqiCgrOKTk48XJWXU5ELjxNpRwe4iNVOil+QyfrfUzgE9IrWXT212OqudXQKkc+x1WQ/sRL7BIKey5TruwU+SFRXfchRSQAGSCxPgjGcX56KjJ5TF7JbtU5ucSnrhYVRB461FrHkU2zP3g5kVH40HpzbpjoDxgQscqBzeK6Q25S333VaxskmV9SqGGxT91qnsI0EAWAQ5eGOtjxRVaKYMHvCXNhO5lXVoslP4sMPLD2hSEUUIKS+nLmJC0ZCfCRcqzl8gNVIYAO9fVnacqRwdLNa+oRLjm+MO61prCcUZ9KTiUM2wmwYU/QgMgeQ/ACW87IAi7TDQesdRRfEhiy8HDE5QlKksDiaZAPLCb1qndroNg0VCwBgr5yKlPe9TQnp+SZ3Kk8ByXjynqPZyGgQW6J2KMp135F2Z4BIqt9Mq28qKIorPD6q5DAtgQHGfBxW7df7C32g0Go1Go9FoNBqNgn8B7/wnQXoewA0AAAAASUVORK5CYII=>

[image7]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAaCAYAAACO5M0mAAAA60lEQVR4Xu3SsUpCYRjG8RckkqIcbElxagtz7R4cxLELyEtwEdFF94ZCbXIREhHHloi8AQPFMQJXndTFIfJ/+L7P8yqCroIP/IbvOc/hcA5H5LByhw8M8Y0CAmsLEkEfcXsOooXn1cKmjNxGd40FLnTZQFsX5Az/COuyZMs6Lm2XwacbuMQwFjP+RR49RPXIxXvruZixp4qTtQU5xzteURN/3NEjL3U01TmFiZhxWvX7Da/wh4QrbG4wxYsrbsXcGXKFyhsq7uB92BmSq8t+unjQRRYj3NvzKYr4ki0/xiMGYm74wZOYpx2zO0vn9S/CsXcuZgAAAABJRU5ErkJggg==>

[image8]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAB0AAAAZCAYAAADNAiUZAAABnUlEQVR4Xu2UzSuEURTGj5AIEQopkexE2VkpS3+BZE+UhY2liJ0NC8ROyddm5HNlLKwIUbJgTVJWyld4TufOOO8xd8xM7N6nfvXe57zdZ+a89x6iUJmrA8yBSTAF8oLl/9GKeu4Bg2qdVLXWcMoGI+AUHIJt0KjqReAWNLh1F+j/Lv9UAWgDG2DT1GLilp2BQrfuJQmpiL9BtAyewBiYB/mqFlAfuAdb4J0Sh9aAV5JfH1MWSei48lrBCXgDx6BM1bx6psSh3KZP0GT8KLh0z1Vgl+TwtIBzsOhqSeULXSAJtd87Aj5I2sjtHlC1cpLgX+UL5dZzKP8brTXn14N2sKRq3JVZtfbKF7pPsnml8fmKsN/s1kNgHcyAaVDs/KTyhUYptdCMxKHcSitfe1edH7ubGYlDd6xJMtp48zrj80Fi33sfUxGH8rG34pPJm/M91OLJdGW8tMWhe9aEqkkGR7fycsEDmFBe2soBL+DAFpx4DPLcLXHrYZKJVBp/Iw11ghvwSNJC5g5cU3BDHvij4AIckZxy+41DhQr1t/oCgb1cnOc0pgIAAAAASUVORK5CYII=>

[image9]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAaCAYAAACO5M0mAAAAlklEQVR4XmNgGLqAF4ifAbEmugQ66Abi/0Csgy6BDFSB+DsDEQo3APEiBgIK3YF4OhCXMOBRyALER4FYhIGAwjwgLoSycSoUAuLjQMwK5eNUOAWIvZH4lCnUBuItyAIMOBQWAfFbIH6BhL8wQBS+AeJLCKWYAOQUDBOxgRkMEIV66BIwEAnE94H4DwNE4XsGSLCNAvwAAPjaKTpBaVD2AAAAAElFTkSuQmCC>

[image10]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAB0AAAAZCAYAAADNAiUZAAABdklEQVR4Xu2UvyuFURjHH2HwY2AgpESyyaAk/wLZZTGSf8CIYmKzKAOZMJHfy70Gk0IpGdgUSZkUEj5P59zb8XRf7ute2/upT73v97ydb+85pyOSUDj1eGrD/2YVb234Ey028JTiJJ7hMe5iR/iBZwBnJI/SSuzDLdw2Yxnm8Ryr/fso3mFd9gs3Noe98kvpGD7gDr5L7tJmfMOhICsRV6p/lWEKGySP0pAXyV06jp/YafI0XvrnHhzxz0UpXRJXavd7Ez+wAqdxBZdxH5/9c2Y7Iokq1aXX0kaTb/i8zeR6mAr+05S4yXW/QtZ83hVkg3gobq4FrArGchJVmpb8S2OjpbqUlqjlXfd5u8ljoaV7NoRFcZO3mlwPkuZ6kP6MlurJs+hFoJN3m1xvpiuTxUZLD2wITeIujuEgK8dHnA2y2JThKx7ZAY9eg3rv1vj3CXE3Um32ixj04w0+iVtC9R6v5fuEeuHrBXCBJ+JOud3jhISE4vIFUMtalyZMTmYAAAAASUVORK5CYII=>

[image11]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADYAAAAZCAYAAAB6v90+AAADWklEQVR4Xu2WWahOURiGX7OMyTyWkIwXbkwlGVIuDCVxd4RELigkRDLecUFmjkSGhMg8HCTJmCmKRMpcpkTG9z3fXmevf529/33Ojc7F/9RT//7W+tfea69vf2sBBQoUSKAJ3UbP0ilBm89wOj0MptELNuADepsupjVyegCN6A76gb6i+2nHnB7pLKP9aEPalI6l13J6AOfoIth99SwnaV9aLWqvT2fRl7RlFMtLG3qX9oyu69IDdF1ZDxu8hE6j1ekA+pq+gf0/H3rQvwlqEo4+UaxVdN2fHqWr6DF6ih6mT+jkqE8mK+iCINaa/oC9YTGCXoibS5kEe5itQTyJ7/QxfQ57YKWTTxFsLJclyo7jZa2GVk+r6lYwk930YBCrB7uR0kYspb/o7LIeQFtYH6VlFk/DQMBU2FjKBqGJnYibUYtep129WCbLYYMWwwYUutF51wE2IfXZ5cW0mop98mJpKIXyodTWWC2ia6Xi2ri5NKP81K0Q7ek72MDPYAPcgq2IozadSJt7MfcwV7xYGhp3Pj1N79MNiF+iUHpdpXNh6ahvSgVNdKE3YKtWaTTIV8Qf9kZkD7QF1nd82JDANzou+q1xlQ3S/16awT6Ly7Dv13EGtoKVRmVU+byZbkI8uUN+p4Ae9CfdGTak4N6+wxWeMUE8pAi51Vn7mwrIdthz56WY7vOuR9H3SL+xCss9egTZq5rGUNj4eplpKO3vIK7MyoybsO1oAl0TxRPR8v+mvYN4J/qZrg/iQumikq3vriJoO3lLO3uxQbCJaY9KQ4VqtHetSfnbklLWVdFydIfdoHHYQPbCPnIf7fwqAHW8mL7HfJTA7jHQi42MYvpOkxgGOyQ4NAHtqzO8mF5wO+86B6XVF9iNQi7CltwxOIrpPw6lhaqZoybsP+4EIVS253jXQhVSE9PGH6IxtWfpkOBQpfyD3IntQZ6JCZXYF7CdXWg1lsDetDsJdIBtCSrbKtfyEexYpTOjYybsgf0NX//V+dNtrt1g//P3RB+lbtIh+CFy9zJtM6mp6NBAKgiaoE4Jesv+yqxGXC1DV3r9htCPdJ4XEzoLXoK9GI2/EOUP2ULVVntY0rHJPaOqYWbxqGpopf0iE6KMUNHQajcI2qo0rrQXKFCgwP/nH7Uhtl5gI3GZAAAAAElFTkSuQmCC>

[image12]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACkAAAAZCAYAAACsGgdbAAACzklEQVR4Xu2WWahPURjFl3nKUChDFFLmBw9kqltCeUApGZ4UebpFeJEMGZInD2bK35ghyVCGZEgic4ZCdE1lTsbIuNb9zj7nO/ve283bfTirfvXfa397nz19e/+BQoXqrvqT0+QeuUkWkQa5CKAV2Ubek5dkP+mWiwB6kHmkN2lKupJyssMHUe3ILnKVXCObSMtcRKRO5Dbpl5TV+QGyNo0A6pFzZBapT4aSV+Q1rH3QSPI34hsZ5WI0+StkK6xflXfDFqlGrSALIq8j+YFsdmPI2ay6UtNhg9DHgsrIO/KEPIStfE9XL02CtfOT65V4fjI5aRYHI685rFHbpLyU/CJz0gigMyxGWx80gpRcuTppl3RkvLSav8n6yE+1HPaxEuzcSTPJmRAAG5xidjpPqyzvo/OGo/ZBPiIVsQnr51JsBnUhb2EfVOOF5AZspYIakymkvfN0LtXmovOGkSOwRAiJONfVS1/Jg8iTNIZnseml7P6C7LBvJI1yEVW1BRarMxY0BJZQym5JZ/sNWRICqD/kvisHKQk/xGZQC3KcbIatQBjoIR8UqS/5SbZHvvrqHnmK+U46wLJZff/3IEtknyuPg2WoOpvg/CAl1R1yGLWvtrQM1tfUpFzTdmvFX8SmpEtVWTUg8nUpfyLrIl/SbXAUdk5jXSDXkX8I9DBokLrkJQ3waVadSolzOTalPrAOWscV1F6yIfJmk1OkifN0fiUNTNeUJtcsq8Zq2DemJWX1+zmrrpR2JORCFWnr1GBsXEGdJ5NduSzx1CZIr5O/NnQrDHJl6QQsKcOdGy5zf3sMTLzRzstpPiz1BydlrdJi2DMYtk1vsK6ICnI3QYdfmaw3PGg8OUbaJOWJsOM0I42wZzU8i/rdENbmpIupVupEyaDBPiZrkF+xVciyPmali5O0+vov8Bz2Z0UDjaVV3UNuJeh/gv9eoUKFCtUF/QP/4auAsHA+KQAAAABJRU5ErkJggg==>

[image13]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABUAAAAYCAYAAAAVibZIAAABM0lEQVR4Xu2SvStGYRiHbx+Dr0WSSQYpi8GiSImFkv+D3ciMUkSUyagMBpGPMhgMFpsoH4MBWWQRpbju7nO8z7nf87wb07nqGs7vvvv1nOcckYL/osMHCdU4g1d4gcfYm9lwNOAA7uKem6Us4CLWJM+D+ISdvxsBU/iC+/gl+aVN+CZ22pANnHNZGR+SX9qF39jjcj39qsvKiJU24qfY644mWT3e4FC6FCNWqsyLnVZdxxOczmxEqFSq97kppWI9dV9mI0Kl0gm8w0l8ECt+x/5wKQ8tPfAhrOCOD2FNrLzVD0K09NCHsI1LPoRusdI2PwjR0iMfwiyeY5XLh/HaZRlqxX6bUz+AFrF7XMa6JNN/9hLH0qWQcbEP8CqlL/uMt9gc7LXjFj7iPZ7hSDAvKPgLfgDGpUK0pJhpNwAAAABJRU5ErkJggg==>

[image14]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACQAAAAZCAYAAABZ5IzrAAAB2ElEQVR4Xu2Vu0seQRTFryQWCQa0MKj4QBHRQlJYBFJtY6P+A+I/oFjZWViIoFUshUSEfK0PEN+PQj8LKwsFQSy0EV+oYKsS1HOY+XT27o4a2GCzB36wc+7AHGbuzoikeh8Vgh7lVYJR8BNkQFWo+h81AmbAsfL/gM/2uwJMO7VX5Uv/AfSDbbAJFkGdO8EqkGigLdBmv8vApFOLFdP/ALNgXtVyGgY7oMCOO8EZKH6aYRRINBDn3oMxMbtVEy6H1QUuwAL4K/GBysEdaHe8PDGBBh2PCiQaqAisgUtwDr6Hy37dSHygbvAAGpWfBXvKCyQaaFVMY3M3p8BRuOyXLxC3moF0f7GBeRSfHC8AJ864XkyInLizPPqvjueVLxCPk4FKlc/mpO/2RABOnfEXMQFyodmDy8/ll+ULtC5m4RLlj1v/mx33iVnsFvwCLdZvBnPWy4AG678qX6CsvC1Q4mIgHo+W78gmrF+r/MTEQEvahH6LWbha+Wxq+m5TJyoGims4XmxcuEn5vLH3lZeoGGhFm2Kue16aHY6XD67AkOMlqo9i/o4NXbDi08F3jK851SvmpuYtnKhawSG4FnMshNf7gYQX4+M6AHbFPJb8G3VPpUqVKtW/6BFioGkvcgiSeAAAAABJRU5ErkJggg==>

[image15]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFcAAAAZCAYAAABEmrJwAAAC90lEQVR4Xu2YS6hNURjHP6U8Igm5lCTvRx5FnnWTASJlIJSSR928SSLJ3QYGFBNSnmVmwIAIEyUhxMDAxCNmQklSSPH/W2vf893P2eesdc5xitavfnXXf+063/nO3mutfUUSicT/Q1fYBgeYfAs8Bo/D7WYuEcBmeAr+hCNUPg5manwWTlLjYIbaoArL4SN4B96HCzpPN50W2N2GntBabXMXw1uwtx+fhBNK05XpCWfBK/CqmavEEvgFjvLjKfAzbO24ojl0gYPhNvgBTu08/ZuYWm1ze8Hn8A08APequYpsgO/gNfhD4pr7TNyvqLkA75rsb/NaXC2PxTWmXHNjarXNJRvhUz93TtwPGsVXCW/ueHEfxIVek/l8oMmbwR4p39zYWm1zF8Gj/u9l4p6OdaXpMGKau0pcEatNvsPn801uWQh72FAxFo62YRWKmhtbK7ORasw7XK+xS+EJNQ4iprm7xBWx0uSbfL7W5BZuEtelfIPZ2Hvy5x1VjaLmxtbKLF+bSSbueJbDJ2CFGgcR09x2cUXYD+EazpybSzX4ZW/AbiobDh/CYSoLpai5obXyNHHGZ5fgVp/z9HEanhd3VAve0DQxzc0krOBqrIeXxR3eh4hrLO/cWihqbubzemutCzaXp4YQih417qrM2bRQ+OUuwgdwspmLIW/uNJM3staaYXO5DobAQlnYGpPnm0TRAb0cg8SdIXkHRx9xFHlzp5u8kbXWDJvLNTCEMeIK22nygz5vMXkR/cXdsbPhbqlhF1bkzZ1h8kbVWhds7k0benhW5PFJw4M5F3oN3/K404fQR9whfp7KMnhIjWPImzvTTkj9tdYFN5Rv8LadEPeovhdX+ESV85Xyk5TOgHyF/g7ndFxRDF+5+b5ufzByBO6zYQD7xdU4105IfbXWDN8+XsKP4gqjb+EL2Fddx7X4FeynMsId+Im4R5t3gb4LK3FY3Fm3CP57r9WGBfBp45rN13fWzyeQtbbri6T2WhOJRCKRSCQS/w6/AOWwyYry1XorAAAAAElFTkSuQmCC>

[image16]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFcAAAAZCAYAAABEmrJwAAADY0lEQVR4Xu2YWahNURjHP5EpQqaLJJmHDEXGuoSMKQ9CKWPJPCWze0wPhAekjOXNAw9ESCmEEOHBgylKCCWkTMX/71v7nnU+Z++79+WcdNu/+j3s/9r33n2+s/Za37oiKSkpVYcacA5savKFcA/cC5eYsZQYLIAH4E/Y3su7wox3fRj29K5j08YGEYyC02FrWBt2gbvgMu+eYlMi+iz5mARvwSvwuujz58MWdxy8COu76/2we3Y4mrpwIDwFT5uxKDaLPojvU9FiF5NqsCVcDN/BPrnDvxkPP8OO7ro3/ARLy+/IYotbDz6Cz+FGuMYbi2QufAPPwB+SrLgZ0T/4At6DW2ED/4Yi8Qw+gLdFC5OvuBznjPM5Bq+ajNjiknnwvhs7IvqFJuKLJCvuetFl4X9hleQvbjeXc1Pyybi8ucltcceKLndkoujbMSs7HI+kxV0nlS/uaFjHhh5cvzvZsALCijvV5dNMvtTlI03OrIN3zRnur7ET4D7vOhZJi7sW7oAnRDeJm3BMzh3hcJM4K/kLzMJekz9nVEWEFXeFy6eYfL7LZ5qcWbA2k4xoexbAN2Cydx2LpMVdDS9Ldp0dDr/DEeV3RMMPew7W8rJ2ol9SWy+LS1hxy1xuC8L9hjk3QsJu4pDLOGEWuZzdx0F4VLRVi72h+SQtbivYyGTc4O6aLIrZ8KRo884ug4XlzK0MYcXNuLyi4hYUFpddw9/A5YEPzNYoLvxwx+EN2MuMJSEobl+Thy0L7ACY8wsuOCwu18E4cNa+grtNzmY73+yJooXojOcMTtzieATF7WdyFpX5DJMHG1rYYeKfwuJyDYzDENEHu2ByvtbMWfw4NBGdsYPgSqnELuwRFLe/yTu7fLnJ2ZczLzF5QWBxz9vQwV6R7VNAM9HTWEMvqwk/ih4t48CNkE38MC/LwG3edRKC4g6wA6KHCG5KPjyRsispONxQvsJLdkD0VX0r+uA9vJyN9SZYXfTnd4oeKeOsmzxycwnxv7AA/h720EnZIPqMQ+2A6PH3g2T7VR73v8HB5XcUAJ4+nsD3og9GX8PHktsJcC3mTG3sZSzqFvgQvhRdUvziR7FdtNcNg//eK7VhCHzbuGbz+M7n5xvIZy3zbxLtFu6ILkOcsf4bk5KSkpKSkpKSUjX4BYkNw16FHHxXAAAAAElFTkSuQmCC>