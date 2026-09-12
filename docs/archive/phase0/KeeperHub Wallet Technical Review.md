# **On-Chain Agentic Payments: Architectural Assessment and Deployment Strategy**

The emergence of autonomous AI agents capable of transacting assets on-chain requires robust, programmatically accessible cryptographic custody and payment interfaces1. In multi-agent systems, integrating execution and settlement layers must balance developer friction, security guarantees, and platform costs2. This report evaluates the architectural features, configuration profiles, and lifecycle integration vectors of the first-party @keeperhub/wallet against third-party alternatives like agentcash4.

## **Installation Mechanics and Protocol Initialization**

The installation of the first-party agentic wallet establishes the local credentials and security profiles of the agent4. The initialization command triggers a series of interactive prompts to configure the local workspace4:

Bash  
npx \-p @keeperhub/wallet keeperhub-wallet add

### **The Initialization Walkthrough**

Executing this command initiates an interactive wizard that performs four key configuration steps:

1. **AI Client Target Selection:** The CLI scans the local environment for supported coding environments (such as Claude Code, Cursor, or standard MCP clients) and prompts the developer to select the target integration path6.  
2. **Organization Handshake and Authentication:** The CLI prompts the developer to input an organization-scoped API key or execute a browser-based OAuth flow8. This binds the local CLI instance to the developer's KeeperHub cloud dashboard2.  
3. **Workspace Configuration Routing:** The developer is prompted to confirm directory paths for writing local settings10. By default, the installer targets the user's home directory to write administrative configurations4.  
4. **Safety Policy Initialization:** The CLI asks the developer to approve the creation of a local safety ruleset4. Once confirmed, the utility initializes local JSON files with standard restrictive caps4.

A companion command is also available to write the markdown reference guides used by language models to understand and execute wallet tools4:

Bash  
npx \-p @keeperhub/wallet keeperhub-wallet skill install

### **Coinbase Developer Platform Isolation**

The installation process for @keeperhub/wallet is completely isolated from the Coinbase Developer Platform (CDP)2. While Coinbase’s proprietary awal CLI and companion agentic-wallet-skills require active CDP credentials, email-based OTP authentication, and registration on the Coinbase portal, the first-party KeeperHub wallet operates independently2.  
The mention of "CDP" in the documentation relates to alternative configurations14. Developers can deploy the first-party @keeperhub/wallet with a hard $0 budget, without registering a CDP account or subscribing to a paid platform plan2.

## **Cryptographic Custody and Turnkey Sub-Organizations**

The first-party wallet utilizes a delegated-custody architecture powered by Turnkey's secure hardware enclaves2. This approach isolates private keys from the local execution environment2.

### **The Turnkey Delegated Custody Model**

When a developer provisions a wallet through KeeperHub, the orchestrator calls Turnkey to generate a dedicated sub-organization scoped strictly to that specific organization2. This sub-organization acts as an isolated cryptographic tenant within Turnkey's secure enclave (TEE)2. The private key is generated within the HSM boundary on a standard derivation path and is never exposed to the host application, the local disk, or KeeperHub platform administrators2.  
The KeeperHub database stores only the public wallet address, the Turnkey sub-organization ID, and the unique wallet ID2. Signing requests are evaluated against active policies inside the enclave before a cryptographic signature is generated and returned to the network2.

\+----------------------------------------------------------------------------+  
|                          KEEPERHUB CLOUD GATEWAY                           |  
|                                                                            |  
|  1\. Evaluates incoming transaction or /sign request                        |  
|  2\. Confirms organization authentication metadata                          |  
|  3\. Forwards serialized payload to Turnkey API                             |  
\+---------------------+------------------------------------------------------+  
                      |  
                      | Cryptographically Signed Channel  
                      v  
\+---------------------+------------------------------------------------------+  
|                     TURNKEY SECURE ENCLAVE (TEE)                           |  
|                                                                            |  
|  \- Sub-organization isolates the cryptographic tenant                      |  
|  \- Evaluates request against enclave-enforced policies                     |  
|  \- Signs transaction inside HSM, returning \*only\* the raw signature        |  
\+----------------------------------------------------------------------------+

### **Turnkey Fee Structure for Hackathon Users**

The Turnkey enclave infrastructure is fully managed and subsidized under KeeperHub's parent platform tenant2. Hackathon users and developers do not need to register for a Turnkey account, generate individual API credentials, or pay platform fees2. Enclave-backed, non-custodial wallets can be provisioned at no cost, satisfying the hard $0 budget constraint2.

## **Local Configuration Schema and Security Gateways**

Upon execution of the setup commands, the local file system creates a protected directory structure under \~/.keeperhub/ to manage configuration and safety parameters4.

### **Structure of \~/.keeperhub/wallet.json**

The wallet.json file serves as the local configuration reference4. Because private keys remain within Turnkey's cloud HSMs, this file stores only the metadata required to route signing requests2. If this file is missing, the local server provisions a new wallet automatically on the first tool call4.

| JSON Key | Data Type | Modifiability | Functional Description |
| :---- | :---- | :---- | :---- |
| address | String (Hex) | Read-Only | The public EVM address associated with the Turnkey-backed wallet2. |
| subOrgId | String | Read-Only | The Turnkey sub-organization ID pinning the wallet to the user's tenant2. |
| walletId | String | Read-Only | The Turnkey wallet ID referencing the active key inside the enclave2. |
| apiPublicKey | String | Read-Only | The PEM-encoded public key used to verify local signature requests2. |
| organizationId | String | Read-Only | The KeeperHub organization identifier linking the CLI to the cloud dashboard2. |
| environment | String | Editable | Scopes the signing destination (e.g., testnet or mainnet)9. |

### **Configuration and Modification of \~/.keeperhub/safety.json**

The safety.json file acts as a local security gateway4. The local MCP server evaluates transactions against this ruleset before forwarding them to the cloud signer, preventing unauthorized executions4.

JSON  
{  
  "block\_threshold\_usd": 1.00,  
  "daily\_limit\_usd": 5.00,  
  "enforce\_limits": true,  
  "allowed\_domains": \[  
    "https://api.keeperhub.com",  
    "https://app.keeperhub.com"  
  \],  
  "denied\_selectors": \[  
    "0x095ea7b3"  
  \]  
}

The keys within safety.json can be modified by the developer to adjust the agent's spending limits:

* **block\_threshold\_usd:** Dictates the maximum USD-equivalent fee permitted for a single transaction4. Transactions exceeding this cap are blocked locally by the MCP server, returning an error code without calling the signer4.  
* **daily\_limit\_usd:** A rolling 24-hour spending limit that restricts cumulative expenditures across autonomous sessions.  
* **enforce\_limits:** A boolean toggle to enable or disable local policy checks.  
* **allowed\_domains:** An array of domain origins the agent is permitted to pay.  
* **denied\_selectors:** An array of smart contract function signatures (e.g., approve) blocked from execution.

## **Lifecycle Hooks and Cross-Client Integration Dynamics**

Integrating an agentic wallet requires evaluating how it interfaces with the agent's execution loop, especially when using development environments outside of Claude Code9.

### **The PreToolUse Hook Mechanics**

The PreToolUse hook is an event specific to Anthropic's Claude Code CLI7. It intercepts terminal execution before permissions are evaluated7.  
The hook configuration is added to Claude Code's settings:

JSON  
{  
  "hooks": {  
    "PreToolUse": \[  
      {  
        "matcher": "Bash",  
        "hooks": \[  
          {  
            "type": "command",  
            "command": "keeperhub-wallet pre-execution-check"  
          }  
        \]  
      }  
    \]  
  }  
}

The hook script receives details about the pending tool execution via standard input (stdin)7. If the transaction violates local safety policies (such as exceeding the block\_threshold\_usd), the hook script exits with code 2, blocking the execution and returning the error details to the model for retry or logical correction10.  
Because PreToolUse is a proprietary lifecycle event within Claude Code, other development environments (such as Cursor, Zed, or custom scripts) cannot execute it natively3. Alternative clients use different hooks (e.g., Cursor's beforeShellExecution) or must integrate safety checks directly into the agent's execution loop18.

### **Autonomous Payments in Non-Standard Agents**

For systems that do not run inside Claude Code, @keeperhub/wallet can still resolve payments3. The wallet acts as an independent Model Context Protocol (MCP) server or a standalone executable20.  
The agent does not require the markdown skill file to make payments, as the skill file is merely a reference document used to guide the LLM's tool calling13. Instead, the agent can handle the payment flow programmatically3:

1. The agent makes an HTTP request to an on-chain resource and receives an HTTP 402 Payment Required challenge3.  
2. The agent parses the challenge headers to extract the payee address, network, and payment amount22.  
3. The custom script reads the \~/.keeperhub/wallet.json configuration and makes a POST request to KeeperHub's remote /sign (or /execute) endpoint to sign the transaction2.  
4. The backend evaluates the request, signs the payload using the Turnkey enclave, and returns the verified cryptographic signature2.  
5. The local client appends the payment signature to the X-Payment or Authorization header and retries the original API request, completing the transaction loop22.

## **Comparative Analysis: First-Party Wallet vs. AgentCash**

Selecting a payment integration requires analyzing the security, operational overhead, and client compatibility of each system1.

| Architectural Vector | KeeperHub First-Party Wallet (@keeperhub/wallet) | AgentCash (agentcash) |
| :---- | :---- | :---- |
| **Custody Model** | TEE-backed server-side Turnkey secure enclave2. | Local self-custody with on-disk cryptographic keys23. |
| **On-Disk Private Key Exposure** | None; credentials authorize proxy signing requests2. | High; the plaintext private key resides in \~/.agentcash/wallet.json23. |
| **Installation Friction** | \~30 seconds; automates Turnkey sub-org provisioning on first run2. | \~10 seconds; generates a local wallet address upon package installation5. |
| **Funding Requirement** | Abstracted via KeeperHub workflows or funded natively20. | Requires manual Base or Solana deposit of USDC5. |
| **Claude PreToolUse Support** | Yes; registers hooks to intercept execution8. | No; operates primarily as a standard MCP server5. |
| **Platform Dependencies** | Independent of Coinbase CDP; uses Turnkey enclaves2. | Independent of CDP; uses standard x402 payment rails5. |
| **API Coverage Scope** | Multi-chain DeFi, smart contracts, and custom workflows20. | Over 250 premium aggregated APIs (search, scrape, email)26. |

### **Analyzing Local Key Exposure in Low-Value Environments**

For hackathons or live demonstrations where wallets hold minimal balances (under $5.00 USD), storing plaintext private keys on disk introduces minimal financial risk23. However, in production environments or systems with auto-funding APIs, on-disk key storage is a significant vulnerability1. An unmanaged subprocess or shell escape could read \~/.agentcash/wallet.json and drain the wallet's funds2.

## **The Skip-Wallet Path: get\_wallet\_integration & Free Workflows**

Developers can bypass local wallet management by utilizing KeeperHub's remote execution architecture28.

### **Using Integrated Organization Wallets**

Using the standard workflow engine, an agent can call the get\_wallet\_integration function to resolve the primary organization wallet28. This allows the agent to execute actions directly on-chain through the KeeperHub transaction relay, entirely bypassing local wallet setup and key management20.

### **Classification of Paid vs. Free KeeperHub Workflows**

When using KeeperHub's remote execution framework, charges are determined by the type of on-chain interaction20:

| Workflow Category | Cost Profile | Supported Scenarios | Execution Mechanism |
| :---- | :---- | :---- | :---- |
| **Read Operations** | Free | Tracking wallet balances, contract views, event triggers9. | Direct node query9. |
| **Testnet Operations** | Free | Sepolia or holesky testing9. | Subsidized RPC routing9. |
| **Sponsered Mainnet** | Free | Gas-sponsored actions24. | KeeperHub gas sponsorship24. |
| **On-Chain Writes** | Paid (402) | DeFi strategy execution, swaps, token transfers3. | Per-call payment settled in USDC3. |
| **Marketplace Executes** | Paid (402) | Pre-configured DeFi workflows3. | Settled via x402/MPP3. |

## **Deployment Recommendation and Implementation Paths**

### **Go/No-Go Decision Matrix**

The technical evaluation yields a conditional deployment strategy based on the developer's choice of agent client:

               \[Select Agent Client Environment\]  
                               |  
                               |  
        \+----------------------+----------------------+  
        |                                             |  
  \[Claude Code\]                               \[Non-Claude Agent\]  
        |                                             |  
        v                                             v  
 \[RECOMMENDED PATH\]                            \[DECISION POINT\]  
   GO: First-Party                              Select Pathway:  
   @keeperhub/wallet                                  |  
                                \+---------------------+---------------------+  
                                |                                           |  
                                v                                           v  
                        \[Programmatic Link\]                        \[No-Wallet Strategy\]  
                          GO: First-Party                            GO: Org Wallet  
                         Direct REST /sign                         get\_wallet\_integration

* **GO (First-Party @keeperhub/wallet):** Highly recommended if the agent is built on Claude Code, as it enables hardware-secured enclaves, local safety policy enforcement, and native PreToolUse hook execution with zero private key exposure2.  
* **GO (Programmatic Integration of First-Party @keeperhub/wallet):** Recommended if building a custom agent script3. The developer can bypass the CLI skill files and query KeeperHub's remote /sign endpoint directly, resolving payment challenges programmatically while maintaining Turnkey-secured custody2.  
* **GO (No-Wallet Strategy):** Recommended if the project only requires standard DeFi workflows, as the agent can leverage the organization's main wallet via get\_wallet\_integration and utilize free or gas-sponsored workflows to bypass local wallet management entirely24.

## **Execution Manual**

### **Pathway A: Deploying the First-Party @keeperhub/wallet**

To deploy the first-party wallet, execute the following commands in the agent's root directory:

Bash  
\# Install the wallet CLI and configure the organization credentials  
npx \-p @keeperhub/wallet keeperhub-wallet add

\# Generate local safety configuration templates  
npx \-p @keeperhub/wallet keeperhub-wallet safety init \--yes

\# Write the reference skill files to guide the AI model's tools  
npx \-p @keeperhub/wallet keeperhub-wallet skill install

Verify that the local safety parameters are correctly initialized in the file system:

Bash  
cat \~/.keeperhub/safety.json

### **Pathway B: Deploying the agentcash Fallback**

If using a third-party framework (such as OpenClaw) that natively integrates agentcash for automated x402 payments, use this implementation path23:

Bash  
\# Install the agentcash CLI package  
npx agentcash@latest install \-y

\# Register the target KeeperHub organization endpoint  
npx agentcash add https://app.keeperhub.com

\# Fetch the payment address and deposit details  
npx agentcash@latest accounts

Once the CLI prints the address, fund the wallet with less than $5.00 USDC on Base23. If a promotional code is available, redeem it directly via the CLI:

Bash  
npx agentcash@latest redeem HACKATHON\_CODE\_2026

#### **Works cited**

1. What is an agentic wallet, and why does it need its own security stack? \- MetaMask, [https://metamask.io/news/what-is-an-agentic-wallet](https://metamask.io/news/what-is-an-agentic-wallet)  
2. How We Sign Your Transactions Without Holding Your Keys \- KeeperHub, [https://keeperhub.com/blog/009-turnkey-signer-integration](https://keeperhub.com/blog/009-turnkey-signer-integration)  
3. AI Agent Execution Layer \- MCP, x402, MPP, ERC-8004 | KeeperHub, [https://keeperhub.com/agents](https://keeperhub.com/agents)  
4. @keeperhub/wallet \- npm, [https://www.npmjs.com/package/@keeperhub/wallet](https://www.npmjs.com/package/@keeperhub/wallet)  
5. agentcash \- NPM, [https://www.npmjs.com/package/agentcash](https://www.npmjs.com/package/agentcash)  
6. Agent Skills | Trust Developers, [https://developer.trustwallet.com/developer/claude-code-skills](https://developer.trustwallet.com/developer/claude-code-skills)  
7. Automate actions with hooks \- Claude Code Docs, [https://code.claude.com/docs/en/hooks-guide](https://code.claude.com/docs/en/hooks-guide)  
8. KeeperHub \- GitHub, [https://github.com/KeeperHub](https://github.com/KeeperHub)  
9. KeeperHub \- GitHub, [https://github.com/KeeperHub/keeperhub](https://github.com/KeeperHub/keeperhub)  
10. How To Use Claude Code Hooks To Enforce The Right CLI \- AI Hero, [https://www.aihero.dev/how-to-use-claude-code-hooks-to-enforce-the-right-cli](https://www.aihero.dev/how-to-use-claude-code-hooks-to-enforce-the-right-cli)  
11. Claude Code Hooks: Automate Your AI Coding Workflow \- Kyle Redelinghuys, [https://www.ksred.com/claude-code-hooks-a-complete-guide-to-automating-your-ai-coding-workflow/](https://www.ksred.com/claude-code-hooks-a-complete-guide-to-automating-your-ai-coding-workflow/)  
12. bvelasquez/schwab-api-cli \- GitHub, [https://github.com/bvelasquez/schwab-api-cli](https://github.com/bvelasquez/schwab-api-cli)  
13. ETHGlobal Skills, [https://ethglobal.com/showcase/ethglobal-skills-e3xff](https://ethglobal.com/showcase/ethglobal-skills-e3xff)  
14. Agentic Wallet CLI \- Coinbase Developer Documentation, [https://docs.cdp.coinbase.com/agentic-wallet/cli/welcome](https://docs.cdp.coinbase.com/agentic-wallet/cli/welcome)  
15. npx skills add coinbase/agentic-wallet-skills \- GitHub, [https://github.com/coinbase/agentic-wallet-skills](https://github.com/coinbase/agentic-wallet-skills)  
16. End-User Delegated Agent Signing \- Turnkey Docs, [https://docs.turnkey.com/features/policies/delegated-access/agentic-wallets](https://docs.turnkey.com/features/policies/delegated-access/agentic-wallets)  
17. Agentic Wallet | Overview | Onchain OS Docs, [https://web3.okx.com/onchainos/dev-docs/home/agentic-wallet-overview](https://web3.okx.com/onchainos/dev-docs/home/agentic-wallet-overview)  
18. Introducing Agent Governance: Using Hooks to Bring Visibility to AI Coding Agents | Blog, [https://www.endorlabs.com/learn/introducing-agent-governance-using-hooks-to-bring-visibility-to-ai-coding-agents](https://www.endorlabs.com/learn/introducing-agent-governance-using-hooks-to-bring-visibility-to-ai-coding-agents)  
19. Claude Code Hooks Explained: The Deterministic Layer Around Your Agent \- Blake Crosley, [https://blakecrosley.com/blog/claude-code-hooks-explained](https://blakecrosley.com/blog/claude-code-hooks-explained)  
20. KeeperHub \- The execution layer for onchain agents, [https://keeperhub.com/](https://keeperhub.com/)  
21. sovereign-swarm-os | ETHGlobal, [https://ethglobal.com/showcase/sovereign-swarm-os-n7zat](https://ethglobal.com/showcase/sovereign-swarm-os-n7zat)  
22. x402: The HTTP Payment Protocol for AI Agents (Explained) \- AgentCash, [https://agentcash.dev/learn/what-is-x402](https://agentcash.dev/learn/what-is-x402)  
23. GitHub \- moltlaunch/cashclaw: An autonomous agent that takes work, does work, gets paid, and gets better at it., [https://github.com/moltlaunch/cashclaw](https://github.com/moltlaunch/cashclaw)  
24. Agents Onchain Hackathon \- KeeperHub \- DoraHacks, [https://dorahacks.io/hackathon/agents-onchain](https://dorahacks.io/hackathon/agents-onchain)  
25. dadang11/cryptoiz-mcp \- GitHub, [https://github.com/dadang11/cryptoiz-mcp](https://github.com/dadang11/cryptoiz-mcp)  
26. Show HN: AgentCash – access 280 paid APIs with no API keys \- Hacker News, [https://news.ycombinator.com/item?id=47325628](https://news.ycombinator.com/item?id=47325628)  
27. AgentCash \- one balance, every API, [https://agentcash.dev/](https://agentcash.dev/)  
28. MeritScore | ETHGlobal, [https://ethglobal.com/showcase/meritscore-14i2e](https://ethglobal.com/showcase/meritscore-14i2e)  
29. Aaether \- ETHGlobal, [https://ethglobal.com/showcase/aaether-yc764](https://ethglobal.com/showcase/aaether-yc764)  
30. Merit-Systems/agentcash-skills \- GitHub, [https://github.com/Merit-Systems/agentcash-skills](https://github.com/Merit-Systems/agentcash-skills)