# **System Architecture and API Surface Integration Report: Routing Engine, CLI Command Parsing, and High-Performance Keepers for Project LAX via KeeperHub**

The execution of automated, high-frequency liquidation operations in decentralized finance represents a highly competitive, zero-sum environment1. Within the context of onchain autonomous agent ecosystems, protocols such as Project LAX (Liquidation Autopilot) compete directly with highly specialized active defense systems, automated exit vaults, and liquidity monitoring swarms3. To secure priority block space and preserve liquidation margins during volatile market sell-offs, Project LAX must bypass traditional user-triggered transaction models and employ a hardened, SLA-backed transaction routing and execution infrastructure1.

                                ┌───────────────────────────────────┐  
                                │       Project LAX CLI             │  
                                │   (React 19 / Tailwind 4 UI)      │  
                                └─────────────────┬─────────────────┘  
                                                  │ Command Parsing  
                                                  ▼  
                                ┌───────────────────────────────────┐  
                                │      Zod Schema Validation        │  
                                └─────────────────┬─────────────────┘  
                                                  │  
                         ┌────────────────────────┴────────────────────────┐  
                         │ HTTP REST Client                                │ MCP Client (SSE / Stdio)  
                         ▼                                                 ▼  
        ┌───────────────────────────────────┐             ┌───────────────────────────────────┐  
        │   KeeperHub REST API Endpoint     │             │    KeeperHub MCP Server Engine    │  
        │    https://app.keeperhub.com/api  │             │   (techops-services/keeperhub-mcp)│  
        └────────────────┬──────────────────┘             └────────────────┬──────────────────┘  
                         │                                                 │  
                         └────────────────────────┬────────────────────────┘  
                                                  ▼  
                                ┌───────────────────────────────────┐  
                                │        Shared SQS Queue           │  
                                └─────────────────┬─────────────────┘  
                                                  │ Block Dispatcher Event  
                                                  ▼  
                                ┌───────────────────────────────────┐  
                                │    Kubernetes Job Executor        │  
                                │ (EXECUTION\_MODE \= isolated/complex)│  
                                └─────────────────┬─────────────────┘  
                                                  │ Transaction Signing Payload  
                                                  ▼  
                                ┌───────────────────────────────────┐  
                                │    Turnkey HSM / Secure Enclave   │  
                                │  (Hardware Isolated Custody/TEEs) │  
                                └─────────────────┬─────────────────┘  
                                                  │ Private Signed Payload  
                                                  ▼  
                                ┌───────────────────────────────────┐  
                                │     Private Block Builders        │  
                                │     (Flashbots / Beaverbuild)     │  
                                └───────────────────────────────────┘

KeeperHub serves as the execution layer for autonomous onchain systems1. Developed by engineers with experience operating infrastructure for major protocols including MakerDAO and Sky Protocol, the platform automates transaction retry logic, manages base fee fluctuations, and handles execution simulation to guarantee onchain transaction delivery1. The integration of KeeperHub as Project LAX’s exclusive onchain execution layer provides the infrastructure necessary to automate liquidations across multiple EVM-compatible chains4.

## **Architectural Configuration of the KeeperHub Automation Platform**

KeeperHub is built on a containerized, high-throughput software architecture designed to handle transaction spikes under heavy congestion1. The core web and administration interface utilizes a Next.js 16 (App Router) framework running React 19, TypeScript 5, and Tailwind CSS 4, backed by a PostgreSQL database managed via the Drizzle ORM7. This stack ensures a responsive interface for the Project LAX dashboard while maintaining data persistence7.  
To handle high transaction volumes without head-of-line blocking or execution delays, KeeperHub isolates workflow triggers from the execution workers7. The infrastructure is divided into decoupled components:

### **Trigger Services**

The scheduling dispatchers, blockchain event trackers, and incoming webhook listeners operate as stateless microservices7. When an event occurs—such as a smart contract log indicating a loan has breached its collateralization threshold—the trigger service serializes the event payload and dispatches a message to a shared Amazon Simple Queue Service (SQS) queue7.

### **Execution Workers**

The core execution engine consumes tasks from the SQS queue and routes them to isolated runtime environments7. To prevent resource starvation, memory leakage, and cross-tenant execution interference, KeeperHub runs executions in containerized Kubernetes (K8s) Jobs using a specialized runner image7. The execution isolation level is controlled by the system-level EXECUTION\_MODE environment variable, which can be tuned to balance transaction latency and security7:

* isolated: The default production mode7. Every triggered execution spawns a clean, isolated Kubernetes Job container7. This ensures security but introduces container cold-start overhead7.  
* complex: An optimized hybrid mode7. State-changing Web3 smart contract writes are executed inside isolated K8s Jobs to protect signing keys, while read-only queries and external integrations (such as Discord alerts) are handled in-process7.  
* process: An ultra-low-latency mode where all tasks run directly in-process7. This minimizes execution delay but removes execution container isolation boundaries7.

To maintain performance, KeeperHub uses system-level cron jobs to clean up stalled processes7. A cleanup daemon running deploy/scripts/reaper.sh executes every ten minutes to reclaim hung, incomplete, or orphaned K8s execution jobs7. Additionally, a daily cron job running deploy/scripts/digest-cron.sh processes daily logs and sends performance metrics to integrated operators7.  
To monitor performance under heavy loads, KeeperHub exposes a Prometheus-compatible metrics endpoint at /api/metrics7. This allows operators to track workflow execution delays, API routing latencies, and plugin action performance7. To prevent Out-Of-Memory (OOM) failures when decoding large arrays or multi-pool DeFi state data, the execution environment raises the V8 engine heap limit9, while the underlying contract decoders preserve nested tuple structures during contract reads9.

## **Exhaustive KeeperHub API and Model Context Protocol Surface**

To build a reliable CLI router for Project LAX, developers must understand both the HTTP REST API and the Model Context Protocol (MCP) server configurations1. Standardizing execution through these endpoints ensures that every terminal command maps directly to a validated infrastructure call7.

### **Authentication**

All programmatic calls to the KeeperHub API must be authenticated using Bearer tokens passed via the standard Authorization header10. These API keys must be generated via the organization settings pane on the platform and are prefixed with kh\_10.

HTTP  
Authorization: Bearer kh\_live\_7x9028a3f9024c...  
Content-Type: application/json

### **HTTP REST API Specification**

The primary REST API endpoints available at the base URL https://app.keeperhub.com/api are detailed in the table below7:

| Endpoint Method & Path | URL Parameters | Request Payload / Query Params | JSON Response Structure (Success) |
| :---- | :---- | :---- | :---- |
| **GET** /api/workflows \[cite: 7\] | None | limit (Query, optional) offset (Query, optional) project\_id (Query, optional) tag\_id (Query, optional)10 | \[ { "id": "wf\_1", "name": "M-1", "active": true, "trigger": "cron" } \] \[cite: 10\] |
| **POST** /api/workflows \[cite: 7\] | None | prompt (Body, required): Natural language instructions10. existing\_workflow\_id (Body, optional)10 | { "id": "wf\_2", "structure": { "nodes": \[...\] }, "compiled": true } \[cite: 10\] |
| **GET** /api/workflows/{id} \[cite: 10\] | id: Workflow UUID10 | None | { "id": "wf\_2", "name": "Liquidation Base", "steps": \[...\] } \[cite: 8, 10\] |
| **DELETE** /api/workflows/{id} \[cite: 10\] | id: Workflow UUID10 | None | { "success": true, "deleted\_workflow\_id": "wf\_2" } \[cite: 10\] |
| **POST** /api/workflows/{id}/execute \[cite: 7\] | id: Workflow UUID7 | input (Body, optional): Dynamic key-value pairs mapping to defined variables10. | { "execution\_id": "exec\_88a", "status": "queued", "timestamp": 1782390 } \[cite: 10\] |
| **GET** /api/workflows/{id}/executions \[cite: 7\] | id: Workflow UUID7 | limit (Query, optional) offset (Query, optional) | \[ { "execution\_id": "exec\_88a", "status": "succeeded" } \] \[cite: 5, 7\] |
| **GET** /api/executions/{execution\_id} \[cite: 10\] | execution\_id: Run UUID | None | { "id": "exec\_88a", "outcome": "succeeded", "gas\_used": 62000, "submitted\_transaction": { "hash": "0xabc..." } } \[cite: 1\] |
| **GET** /api/executions/{execution\_id}/logs \[cite: 10\] | execution\_id: Run UUID | None | A text output containing step-by-step console logs from the Kubernetes worker container7. |
| **GET** /api/chains \[cite: 7\] | None | None | \[ { "chain\_id": 8453, "name": "base", "rpc\_url": "https://..." } \] \[cite: 7, 8\] |
| **GET** /api/metrics \[cite: 7\] | None | None | Prometheus-formatted metrics detailing execution performance, database latencies, and plugin action rates7. |

### **Model Context Protocol (MCP) Server Specification**

For CLI operations running locally or interfacing with autonomous agents, KeeperHub provides a Model Context Protocol (MCP) server named techops-services/keeperhub-mcp8. This server supports two transport modes: Stdio (using standard system input/output for local execution) and HTTP/SSE (Server-Sent Events) for remote setups10.  
The server exposes the following HTTP endpoints10:

* GET /health: System check endpoint to verify connection status10.  
* GET /sse: Server-Sent Events channel used to maintain a persistent connection with the client10.  
* POST /message: Message gateway where clients submit JSON-RPC 2.0 requests to invoke tools10.

The MCP server exposes eight core workflow tools13. These tools are mapped directly to execution patterns and are detailed in the table below10:

| MCP Tool Name | Required Parameters | Optional Parameters | Operational Action |
| :---- | :---- | :---- | :---- |
| execute\_contract\_call \[cite: 13\] | contract\_address, network, function\_name \[cite: 10\] | function\_args (JSON array), abi \[cite: 10\] | Executes a write contract call using the organization's Turnkey-backed wallet10. |
| transfer\_funds | network, recipient\_address, amount \[cite: 10\] | token\_address (for ERC-20 transfers)10 | Executes a native or ERC-20 token transfer from the organization's secure wallet10. |
| create\_workflow \[cite: 13\] | prompt (Natural language prompt)10 | existing\_workflow\_id \[cite: 10\] | Generates a multi-step automation workflow configuration using the Vercel AI SDK7. |
| execute\_workflow \[cite: 13\] | workflow\_id \[cite: 10\] | input (JSON object of parameters)10 | Triggers a manual execution of a pre-configured workflow10. |
| get\_execution\_status \[cite: 13\] | execution\_id \[cite: 10\] | None | Retrieves the execution state of a specific transaction or workflow run10. |
| get\_execution\_logs \[cite: 13\] | execution\_id \[cite: 10\] | None | Retrieves console logs generated during execution10. |
| list\_workflows | None | limit, offset, project\_id, tag\_id \[cite: 10\] | Lists workflows scoped to the organization10. |
| delete\_workflow | workflow\_id \[cite: 10\] | None | Deletes a workflow and cancels its active schedules10. |

## **Project LAX Command Routing and CLI Parser Architecture**

Project LAX’s interactive CLI dashboard allows liquidators to manage and trigger actions from a single terminal interface. Since all onchain state transitions must route through KeeperHub, the CLI parses commands into validated payloads before executing them via KeeperHub’s API or MCP endpoints1.

### **Command Parsing and Formatting**

Commands in the Project LAX interface must adhere to the standard format:

Bash  
lax \<verb\> \<noun\> \[flags\]

To ensure reliable executions, Project LAX uses a Zod schema parser to validate all parameters—such as verifying Ethereum address checksums and validating target networks—before sending requests to the API10. The table below outlines how CLI commands are parsed and routed7:

| CLI Syntax | Target API Type | Route & Payload | Handled parameters |
| :---- | :---- | :---- | :---- |
| lax run liquidation \--vault \<0x...\> | REST Execution7 | **POST** /api/workflows/wf\_lax\_liq/execute { "input": { "vault\_address": "\<0x...\>" } } | Map dynamic inputs directly to execution variables10. |
| lax call write \<0x...\> \<func\> \[args...\] \--network \<net\> | REST Direct Write7 | **POST** /api/workflows/direct-call { "contract\_address": "\<0x...\>", "network": "\<net\>", "function\_name": "\<func\>", "function\_args": "\[args...\]" } | Direct execution without creating a persistent workflow10. |
| lax status execution \--id \<exec\_id\> | REST Get Status10 | **GET** /api/executions/\<exec\_id\> | Polls execution outcome status10. |
| lax logs execution \--id \<exec\_id\> | REST Get Logs10 | **GET** /api/executions/\<exec\_id\>/logs | Fetches system logs from the isolated container runner7. |
| lax list workflows | REST List7 | **GET** /api/workflows | Displays registered automation configurations7. |
| lax fund transfer \<to\_address\> \<amount\> \--token \<0x...\> | REST Transfer10 | **POST** /api/workflows/transfer { "recipient\_address": "\<to\_address\>", "amount": "\<amount\>", "token\_address": "\<0x...\>" } | Handles token transfers using secure hardware keys10. |

### **Operational Implementation of the Routing Engine**

To integrate this routing engine into the Project LAX React 19 dashboard, the CLI uses the @ethglobal-openagent/langchain-keeperhub SDK or the TypeScript @keeperhub/sdk to manage API requests and handle execution polling7. This integration manages the asynchronous lifecycle of each command and renders the progress in the terminal output:

TypeScript  
import { useState } from 'react';  
import { z } from 'zod';

// Zod Schema to validate inputs before making API calls  
const LiquidationSchema \= z.object({  
  vault: z.string().regex(/^0x\[a-fA-F0-9\]{40}$/, { message: "Invalid EVM Address format." }),  
  network: z.enum(\["ethereum", "base", "arbitrum", "polygon", "sepolia"\])  
});

export function useLaxCliRouter(apiKey: string) {  
  const \[terminalHistory, setTerminalHistory\] \= useState\<string\[\]\>(\[\]);  
  const \[loading, setLoading\] \= useState\<boolean\>(false);

  const parseAndRoute \= async (rawInput: string) \=\> {  
    const tokens \= rawInput.trim().split(/\\s+/);  
    if (tokens\[0\] \!== 'lax') {  
      appendLine('Error: Command must start with the "lax" namespace prefix.');  
      return;  
    }

    const verb \= tokens\[1\];  
    const noun \= tokens\[2\];

    if (verb \=== 'run' && noun \=== 'liquidation') {  
      const vaultFlagIdx \= tokens.indexOf('--vault');  
      const networkFlagIdx \= tokens.indexOf('--network');  
      const rawVault \= vaultFlagIdx \!== \-1 ? tokens\[vaultFlagIdx \+ 1\] : null;  
      const rawNetwork \= networkFlagIdx \!== \-1 ? tokens\[networkFlagIdx \+ 1\] : 'base';

      // Perform schema validation before sending transaction payloads  
      const validationResult \= LiquidationSchema.safeParse({ vault: rawVault, network: rawNetwork });  
      if (\!validationResult.success) {  
        appendLine(\`Validation Error: ${validationResult.error.issues\[0\].message}\`);  
        return;  
      }

      await dispatchLiquidation(validationResult.data.vault, validationResult.data.network);  
    } else if (verb \=== 'status' && noun \=== 'execution') {  
      const idFlagIdx \= tokens.indexOf('--id');  
      const execId \= idFlagIdx \!== \-1 ? tokens\[idFlagIdx \+ 1\] : null;  
      if (\!execId) {  
        appendLine('Error: Missing execution parameter "--id \<execution\_id\>"');  
        return;  
      }  
      await pollStatus(execId);  
    } else {  
      appendLine(\`Error: Command combination "${verb} ${noun}" is not recognized.\`);  
    }  
  };

  const dispatchLiquidation \= async (vault: string, network: string) \=\> {  
    setLoading(true);  
    appendLine(\`\[LAX CLI\] Validated target vault ${vault}. Compiling execution payload...\`);

    try {  
      // Execute the workflow via KeeperHub's trigger endpoint  
      const response \= await fetch('https://app.keeperhub.com/api/workflows/wf\_lax\_liquidation/execute', {  
        method: 'POST',  
        headers: {  
          'Authorization': \`Bearer ${apiKey}\`,  
          'Content-Type': 'application/json'  
        },  
        body: JSON.stringify({  
          input: {  
            vault\_address: vault,  
            target\_network: network  
          }  
        })  
      });

      if (\!response.ok) {  
        throw new Error(\`API returned HTTP status ${response.status}\`);  
      }

      const result \= await response.json();  
      const executionId \= result.execution\_id;

      appendLine(\`\[KeeperHub\] Request received. Execution ID: ${executionId}\`);  
      appendLine(\`\[LAX CLI\] Monitoring onchain transaction inclusion...\`);

      // Start the status monitoring loop  
      await monitorExecution(executionId);

    } catch (error: any) {  
      appendLine(\`\[LAX CLI\] System execution failure: ${error.message}\`);  
    } finally {  
      setLoading(false);  
    }  
  };

  const monitorExecution \= async (executionId: string) \=\> {  
    let complete \= false;  
    let cycles \= 0;  
    const maxCycles \= 24; // 2 minutes with 5s polling interval

    const interval \= setInterval(async () \=\> {  
      cycles++;  
      if (cycles \> maxCycles) {  
        clearInterval(interval);  
        appendLine(\`\[LAX CLI\] Polling timed out. Check status manually with: lax status execution \--id ${executionId}\`);  
        return;  
      }

      try {  
        const pollRes \= await fetch(\`https://app.keeperhub.com/api/executions/${executionId}\`, {  
          method: 'GET',  
          headers: { 'Authorization': \`Bearer ${apiKey}\` }  
        });

        if (\!pollRes.ok) return;

        const record \= await pollRes.json();  
        const outcome \= record.outcome;

        if (outcome \=== 'running') {  
          appendLine(\`\[KeeperHub\] Transaction simulated successfully. Broadcasting to network...\`);  
        } else if (outcome \=== 'succeeded') {  
          clearInterval(interval);  
          appendLine(\`\[KeeperHub\] SUCCESS: Transaction confirmed in block\!\`);  
          appendLine(\`\[KeeperHub\] Tx Hash: ${record.submitted\_transaction.hash}\`);  
          appendLine(\`\[KeeperHub\] Gas Used: ${record.gas\_used} units\`);  
        } else if (outcome \=== 'failed') {  
          clearInterval(interval);  
          appendLine(\`\[KeeperHub\] REVERTED: Execution failed onchain.\`);  
          await pullExecutionLogs(executionId);  
        }  
      } catch (e) {  
        // Suppress temporary network errors  
      }  
    }, 5000);  
  };

  const pullExecutionLogs \= async (executionId: string) \=\> {  
    try {  
      const logsRes \= await fetch(\`https://app.keeperhub.com/api/executions/${executionId}/logs\`, {  
        method: 'GET',  
        headers: { 'Authorization': \`Bearer ${apiKey}\` }  
      });  
      if (logsRes.ok) {  
        const text \= await logsRes.text();  
        appendLine(\`\[KeeperHub Logs\]: ${text.slice(-400)}\`);  
      }  
    } catch (err) {  
      appendLine('\[LAX CLI\] Could not fetch execution logs.');  
    }  
  };

  const pollStatus \= async (execId: string) \=\> {  
    try {  
      const res \= await fetch(\`https://app.keeperhub.com/api/executions/${execId}\`, {  
        method: 'GET',  
        headers: { 'Authorization': \`Bearer ${apiKey}\` }  
      });  
      if (\!res.ok) throw new Error(\`HTTP status ${res.status}\`);  
      const data \= await res.json();  
      appendLine(\`\[KeeperHub\] Status: ${data.outcome} | Timestamp: ${data.timestamp}\`);  
    } catch (e: any) {  
      appendLine(\`Error: ${e.message}\`);  
    }  
  };

  const appendLine \= (line: string) \=\> {  
    setTerminalHistory(prev \=\> \[...prev, line\]);  
  };

  return { parseAndRoute, terminalHistory, loading };  
}

## **Hardware Enclave Cryptography and Custody Architecture**

A primary risk for automated liquidation systems is securing active hot signing keys14. If a node or server is compromised, attackers can scan the file system, memory, or configuration databases for private keys14. To mitigate this vulnerability, KeeperHub uses a delegated custody architecture built on Turnkey8.

  ┌─────────────────────────────────────────────────────────────┐  
  │                 Project LAX React Dashboard                 │  
  └──────────────┬──────────────────────────────────────────────┘  
                 │ 1\. Initiates Key Export Request  
                 ▼  
  ┌─────────────────────────────────────────────────────────────┐  
  │                 KeeperHub Backend Server                    │  
  │     \- Generates Ephemeral P256 Key pair                     │  
  │     \- Sends Email OTP Validation Code to Admin             │  
  └──────────────┬──────────────────────────────────────────────┘  
                 │ 2\. Hands ephemeral public key \+ validated OTP  
                 ▼  
  ┌─────────────────────────────────────────────────────────────┐  
  │                    Turnkey HSM Enclave                      │  
  │     \- Attested secure boundary                              │  
  │     \- Generates encrypted bundle using ephemeral public key │  
  └──────────────┬──────────────────────────────────────────────┘  
                 │ 3\. Returns encrypted bundle  
                 ▼  
  ┌─────────────────────────────────────────────────────────────┐  
  │                 Project LAX Dashboard / Browser             │  
  │     \- Decrypts bundle locally with ephemeral private key    │  
  └─────────────────────────────────────────────────────────────┘

The system uses Hardware Security Modules (HSMs) running within Trusted Execution Environments (TEEs)14. These secure enclaves isolate cryptographic key operations from the underlying operating system and server administrators14. When a new user organization is provisioned, KeeperHub initiates a secure handshake with Turnkey to create a dedicated sub-organization14. This sub-organization has its own API credentials, administrative policies, and cryptographic keys generated on-enclave using standard derivation paths14. The platform databases store only the resulting public wallet addresses, sub-organization IDs, and wallet IDs14. The raw private keys remain within the HSM boundary14.  
For secure key management and system portability, KeeperHub provides a self-service browser export mechanism designed to prevent session hijacking from exporting raw keys14:

1. The administrator initiates an export request from the organization settings dashboard14.  
2. The server generates a one-time ephemeral NIST P256 key pair in temporary memory14.  
3. The platform sends a dynamic six-digit authentication code to the administrator's verified email address14. This code expires in five minutes and is limited to five verification attempts14.  
4. The administrator enters the verification code in the browser14.  
5. After validation, the server sends the ephemeral public key to the Turnkey enclave along with the export authorization14.  
6. The enclave retrieves the raw private key from the HSM, encrypts it using the ephemeral public key, and returns the encrypted payload14.  
7. The server receives this encrypted bundle and passes it to the browser, which decrypts it locally using the ephemeral private key14.

Because the key is encrypted for the ephemeral public key, the unencrypted private key is never exposed to database records, application servers, or system logs14.

## **High-Performance Automation Patterns for DeFi Keepers**

In highly competitive liquidation markets, execution latency and transaction reliability are the primary drivers of profitability1. Project LAX can leverage several advanced engineering patterns supported by the KeeperHub infrastructure to optimize its execution pipeline:

### **Private Transaction Routing and MEV Mitigation**

When a liquidation transaction is broadcast to public mempools, generalized frontrunning bots can simulate the transaction, copy the payload, and submit it with a higher tip to capture the liquidation bounty1.  
To protect transactions, KeeperHub routes execution payloads through private RPC networks, including Flashbots, Builder0x69, and Beaverbuild1. This bypasses the public mempool entirely1. Transactions are sent directly to block builders, ensuring they are either included atomically in a block or discarded without exposing the liquidation parameters to frontrunning bots1.

### **Latency and Gas Optimization Engine**

Under high network congestion, transaction fees fluctuate rapidly1. KeeperHub utilizes a predictive gas estimation engine that tracks historical block inclusion fees and current gas prices to compute optimal priority fees1. If a transaction is not included in the immediate block, the platform adjusts fees dynamically using an exponential step backoff model1:  
![][image1]  
Where:

* ![][image2] is the target gas price for the resubmission attempt1.  
* ![][image3] is the base fee of the current network block1.  
* ![][image4] is a multiplier configured to adjust resubmission speed (e.g., ![][image5] for a ![][image6] step increment)1.  
* ![][image7] is the current resubmission attempt index1.  
* ![][image8] is the miner incentive fee routed directly to the block builder1.

To minimize block propagation latency, KeeperHub maintains simultaneous connections to multiple high-performance node endpoints (such as Alchemy, QuickNode, and Infura)4. If an endpoint experiences latency spikes or network timeouts, the system failover mechanism switches RPC providers instantly to maintain a continuous polling state4.

  ┌─────────────────────────────────────────────────────────────────┐  
  │                    Project LAX Autopilot                        │  
  └────────────────────────────────┬────────────────────────────────┘  
                                   │ 1\. Direct Web3 / MCP Call  
                                   ▼  
  ┌─────────────────────────────────────────────────────────────────┐  
  │                 KeeperHub Transaction Signer                    │  
  └────────────────────────────────┬────────────────────────────────┘  
                                   │ 2\. Dual-Protocol Settle (USDC)  
         ┌─────────────────────────┴─────────────────────────┐  
         ▼ (Tempo Network)                                   ▼ (Coinbase Router)  
  ┌───────────────────────────────┐                 ┌───────────────────────────────┐  
  │              MPP              │                 │             x402              │  
  │  (Machine Payment Protocol)   │                 │      (HTTP Payment Rail)      │  
  └──────────────┬────────────────┘                 └──────────────┬────────────────┘  
                 │                                                 │  
                 └────────────────────────┬────────────────────────┘  
                                          ▼  
  ┌─────────────────────────────────────────────────────────────────┐  
  │                    Smart Contract Execution                     │  
  └─────────────────────────────────────────────────────────────────┘

Additionally, the platform supports automated stablecoin settlement using dual-protocol routing via Coinbase’s x402 and the Machine Payments Protocol (MPP) co-authored by Stripe and Tempo1. This integration enables automated, machine-to-machine micropayments1:

* **x402**: Processes pay-per-execution HTTP payments in USD Coin (USDC) directly on EVM networks1.  
* **MPP**: Utilizes off-chain payment rails backed by Stripe to settle execution fees automatically without requiring manual authorization or maintaining pre-funded native gas wallets across twelve distinct chains1.

### **Automated Keeper Delegation Pattern**

A common challenge for automated keepers is securing the operational capital used to perform liquidations20. Depositing significant capital directly into hot wallet addresses exposes the system to compromise if those keys are leaked14.  
To mitigate this risk, Project LAX can use the Delegated Execution pattern utilized by protocols like Reckon20. In this model, the liquidation contract uses a delegator configuration mapping to separate the funding wallet from the execution wallet20:

Solidity  
// Defines the authorized delegate for each owner  
mapping(address \=\> address) public agentDelegate;

This configuration allows cold wallets or multi-signature Safe accounts to register a hot, Turnkey-backed KeeperHub address as their active delegate (agentDelegate) on-chain8.  
Instead of granting open-ended token approvals to the liquidator contract, the asset owner signs a Uniswap Permit2 voucher20. This voucher defines the maximum token allowance, the allowed spender contract (Challenger.sol), and an expiration timestamp20.  
When a liquidation opportunity is detected, the automated keeper triggers execution via KeeperHub20. The Turnkey-backed wallet calls the submit function on the liquidation contract, presenting the signed Permit2 voucher20:

Solidity  
function submit(  
    address owner,  
    address collateralAsset,  
    uint256 liquidateAmount,  
    uint256 nonce,  
    uint256 deadline,  
    bytes calldata signature  
) external {  
    // 1\. Ensure caller is the registered KeeperHub delegate  
    require(agentDelegate\[owner\] \== msg.sender, "Caller is not authorized execution delegate");

    // 2\. Pull operational collateral from owner's vault via Permit2  
    permit2.permitTransferFrom(  
        IPermit2.PermitTransferFrom({  
            permitted: IPermit2.TokenPermissions({  
                token: collateralAsset,  
                amount: liquidateAmount  
            }),  
            nonce: nonce,  
            deadline: deadline  
        }),  
        IPermit2.TransferDetails({  
            to: address(this),  
            requestedAmount: liquidateAmount  
        }),  
        owner,  
        signature  
    );

    // 3\. Execute liquidation logic on-chain  
    executeVaultLiquidation(owner, collateralAsset, liquidateAmount);  
}

To protect the system from oracle manipulation during high market volatility, the smart contract calculates valuation benchmarks on-chain using an equal-weighted geometric mean across multiple independent liquidity pools20:  
![][image9]  
Computing this benchmark on-chain requires approximately 50,000 to 80,000 gas20. This approach prevents a single manipulated liquidity pool from skewing the oracle price by more than ![][image10], shielding the liquidation engine from flash loan price manipulation attacks20.

## **Architectural Conclusions and Implementation Roadmap**

Integrating KeeperHub as Project LAX's primary execution layer provides several infrastructure and security advantages:

1. **Standardized SDK Integration**: Utilizing the @ethglobal-openagent/langchain-keeperhub SDK provides access to 30+ structured execution tools across multiple EVM chains17. This unifies command routing across the terminal UI, autonomous agents, and background cron schedules17.  
2. **Mitigation of Hot Wallet Risks**: Implementing the Delegated Execution pattern allows Project LAX to separate funding capital from hot transaction signers20. The cold storage wallets hold the primary assets and authorize execution via Turnkey enclaves and signed Permit2 allowances14.  
3. **Optimized Transaction Execution**: Routing through KeeperHub’s private RPC connections protects transactions from public frontrunning bots1. Additionally, the platform's smart gas estimation and multi-RPC failover engines help ensure that liquidation transactions execute during periods of high network congestion1.

#### **Works cited**

1. Agents Onchain Hackathon \- KeeperHub \- DoraHacks, [https://dorahacks.io/hackathon/agents-onchain](https://dorahacks.io/hackathon/agents-onchain)  
2. KeeperHub \- ETHGlobal, [https://ethglobal.com/events/openagents/prizes/keeperhub](https://ethglobal.com/events/openagents/prizes/keeperhub)  
3. Find a Project \- ETHGlobal, [https://ethglobal.com/showcase?events=openagents\&page=13](https://ethglobal.com/showcase?events=openagents&page=13)  
4. AI Agent Execution Layer \- MCP, x402, MPP, ERC-8004 | KeeperHub, [https://keeperhub.com/agents](https://keeperhub.com/agents)  
5. KeeperHub \- The execution layer for onchain agents, [https://keeperhub.com/](https://keeperhub.com/)  
6. KeeperHub: Onchain Agent Execution Layer I Luca Malpiedi \- YouTube, [https://www.youtube.com/watch?v=wmrclPXB-tM](https://www.youtube.com/watch?v=wmrclPXB-tM)  
7. KeeperHub \- GitHub, [https://github.com/KeeperHub/keeperhub](https://github.com/KeeperHub/keeperhub)  
8. KeeperHub Docs: Overview, [https://docs.keeperhub.com/](https://docs.keeperhub.com/)  
9. Releases · KeeperHub/keeperhub \- GitHub, [https://github.com/KeeperHub/keeperhub/releases](https://github.com/KeeperHub/keeperhub/releases)  
10. KeeperHub MCP: Blockchain Automated Workflow MCP Tool with Natural Language Operation Support, [https://mcp.aibase.com/server/1639703010877907351](https://mcp.aibase.com/server/1639703010877907351)  
11. langchain-keeperhub 0.5.2 on PyPI \- Libraries.io \- security, [https://libraries.io/pypi/langchain-keeperhub](https://libraries.io/pypi/langchain-keeperhub)  
12. sbo3l\_mcp \- Rust \- Docs.rs, [https://docs.rs/sbo3l-mcp](https://docs.rs/sbo3l-mcp)  
13. MeritScore | ETHGlobal, [https://ethglobal.com/showcase/meritscore-14i2e](https://ethglobal.com/showcase/meritscore-14i2e)  
14. How We Sign Your Transactions Without Holding Your Keys \- KeeperHub, [https://keeperhub.com/blog/009-turnkey-signer-integration](https://keeperhub.com/blog/009-turnkey-signer-integration)  
15. Krump Protocol \- ETHGlobal, [https://ethglobal.com/showcase/krump-protocol-y852t](https://ethglobal.com/showcase/krump-protocol-y852t)  
16. KeeperHub \- GitHub, [https://github.com/KeeperHub](https://github.com/KeeperHub)  
17. KeeperHub Agent SDK \- ETHGlobal, [https://ethglobal.com/showcase/keeperhub-agent-sdk-msiws](https://ethglobal.com/showcase/keeperhub-agent-sdk-msiws)  
18. Blog | KeeperHub, [https://keeperhub.com/blog](https://keeperhub.com/blog)  
19. Standards \- Agent-Native Protocols KeeperHub Speaks, [https://keeperhub.com/standards](https://keeperhub.com/standards)  
20. SakshiShah29/Reckon \- GitHub, [https://github.com/SakshiShah29/Reckon](https://github.com/SakshiShah29/Reckon)  
21. creditmesh \- ETHGlobal, [https://ethglobal.com/showcase/creditmesh-mmm3b](https://ethglobal.com/showcase/creditmesh-mmm3b)

[image1]: <data:image/png;base64,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>

[image2]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFoAAAAZCAYAAACxZDnAAAAEZklEQVR4Xu2YZ4hlRRCFj3HNriIqZgQVMf0xiwlzDpgxrIoJ8w8xwo66IIIBRVAxrigYEAOYMI2ioqIYMeOaQEXMCbPno7rf62nuOm/GK7Mj98Dhva6qvt23uruq+kodOnTo0GEyYXXzSvN981fzY/NCc0FzI/PivmkruNv8yfwrkf9fm9+ZP5pPmnv0rAfDCYr+u9aKOQXHmb+YD5qbmPOY85sHmk+Ys8yretbtYS7zdYWj1yzki5jTk/zcQj4arlf0Ob1WzAmYppjcDYoXr7G9Qv9fOBq8oHj+KpUc5EVYt1bMBkua+5gL1IqJxjLm9+aX5kKVrsQjmhhH36PQsbsnNfLxHM2Jp2p0m/Hinxz9gEI3VMmbMLe5lCIErVDpJhzPKl7kyFpRYSVzm0p2hDmscMZz5s3mcqWBsbZ5l2JnDpt3mheVBpq9owljH5h/muspTt+r5qfmM+Y5itDytMLBR5m/q3lhljdvNd9V2JNoNy30U8wZ5ivm4+bDijFbAyGDie1WK0bBvOZv5iepjVOI8bwISTSDCmaLoo2TryjaoMnRi5rnJ/lZScaYa5kvmz+YF5hnJJs9k80aqT2U2oDF/8y8WpHkieNUVTg1gwroUUWFBc42v1IsYCvIjt6pVgwASq/SiVsrnrVDarMDae/bs5DWMc8r2iA7+k2FE+F75n3mjoVdBicHe8LDVPNgc76ko1qpHc1O/lmxeIAFu0WxSID3oE85FracJMrFVpBDxyG1QvFC7Fhq22/S7/MjLKRdzJmKo8gO4Vn7JR2758Mke0mxkzdOuhLZ0YSZQcC8vq2FCST00tGcLnb/i9mgAdcq+rDA+CPzI8XObgXTFYNcXisKnKSwuamQkXhuVyzAQYoYt3my27+w46izCOwOdMTQwwo9GI+jidNNoKwrHU1spj2c2k3Ilc1qtaJNLKtY8c/Vj081DldMpKw6piXZMYWMMJIdTd27mPphhCO+u/m2Il6W9fp4HJ1zQw3eoXQ0bS5ib2SDBlym6LNZrWgbRysGulHNFxaSUe3oS5OsdM5eSXaAYpeQtbnGl89kMbhqNzma+D0IxuJowFz+MFcuZIBPCoSWrRR96tyxpeKGyU6/zrzDPFRR7XBKB53vCJyiyMSUahuq7whuhSQpYlzp6OzUY1ObZHSv4oWOV1xwmCA2lF0Z/L+/aDPOaxrbjmKcLxQ5oMbiimfNKGR8w6GC4PNCTojbaWQoJE7zjYTwBziBDylCD9UPlQtVVk7+5JvT0v8xg0Kfj0rvKAYlGZCxV1VkcyZX4kSF7W3mNeb6ivKNSoZsvaL5mHmJYgFxMLuCyQNqasbBMZD4jUPo1wTkJMFsz8lg7AwuVfRHR5VRLiiLTj3PSaDm5z0XLvQs+MmKTfWWYt4bJN0S5t6K8i/jKY29JP7fgDCQdzmOI0G3BYqFofR/aUURwEKxCB1aBOUp9wRAccBJ2tnctmfR4V+DUnaW+l8ESZJc0c/sWXTo0KFDh0mJvwFggBnGSxZNmwAAAABJRU5ErkJggg==>

[image3]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAG0AAAAZCAYAAAA7S6CBAAAFCklEQVR4Xu2YdaitRRTFl90tKDaCilj/2B3YLTaK1+5CbPFdAwxsfZj4TCyeBRbWfWKjmNjYoiJ2Ybt+7Jl75g3nea6Hq+9w3rdgcc7Mnq9m7dl7z0gNGjRo0KBB/2JJ81LzXfNX8yPzLHMmcxXz3NbQUcGd5k/mX4n8/9r8zvzRfMzcenj0yHCI4votakM/4kDzF/N+czVzGnN6cxdzgvmeednw6NHDVOarCtGWLvpnNcek/lOK/k64WnHNsbWh3zCg+NBxikmssZHC/l+IBp5T3H+xqh9kQZevDZPA3Ob25oy1oZ8wn/m9+aU5c2Ur8ZAmj2h3KWysugYJOQR1EuRIdR7TLf5JtPsUtsGqvx2mNudVhNmFKltf4WnFpOxdGyosYm5Q9e1lDikm9hnzBnOBcoCxrHmHYsUMmePNc8oBmrRohOr3zT/NFRRR4WXzU/NJ8yRF+HxCIda+5u9qL/KC5s3m24rxFDmrF/YZzNPNl8xHzQcVz+xJEBb5yC1rQwdMa/5mfpzaTDA5kUmhgMmgEl27aCPYJUUbtBNtNvO01H9C6uOZy5gvmj+YZ5jHpTHbpDFLpfZgagMc6TPzckWBRd6jOkagDCrZhxWVMjjR/ErhDD2HLNqmtWEEoBwvBVlPca+NU5uVQXuH4RHScuapRRtk0V5XCALfMe8xNynGZbCiGU8InNPczZwu2ag6a9FYYT8rHAEg/o0KwQHfwTXlsxjLCmcLwSpdUT0kYA6Pu9cGxeSwktg7fZN+n51ohLS5ea0i3OC53GvHZMOrP0h9LyhW2KrJViKLRigdCXivb+vOBIqpUjRWPavy+TygDa5SXIOzMB+ZHypW3IDCufNqnuwYo3jhi2pDgcMUY64r+kj6tyrE3FWRE9ZK43YqxhHOEBSvxUbO2aOwg25EI6+1A6V+KRqrhPZQardDrlCXqA0FHlEPiTa/whM/Vyue19hT8VFl9TiQ+vYv+giVWTT2VbOrFSoJY1uZbyryS7kf7Ea0nEtr8A2laLQ5NHgtD2iDCxXXrFEbCpDvekY0sJ/ipa9R+801hUAt2vmpr5zobVPfzgrvpfriKKy8J8JyXNVONPLdSPBvRAO8yx/mokUf4FiO8Lmu4po6166j1skKol1vHq84dRlM/YD7XGxeoUgB5EywmaIiPUaRViiAeN555tmKvLp+GtsVjlBUVJTvK6s1qZyGUCCQE0rRskAHpDaFwN2KyTlYsRkn3DCGUjyD//cWbZ7zijp7egme84UiZ9aYQ3EvJiuDM1UqQY7ocjGyoSYO9+Q1ziwJ8YDI8IAivAJE46gv43G16oCxauVqwmguvJ5SVLMA4eZSpCMEBlS1n6T/XYNNKQfGbyk+gERM5bW4oirjQ0scqhh7i3mlosKipCdpU3UtrPgIPAtnQKzb1JqI8YrnMMmQfMfkcl070E8BksezYnl2BgcAXI+NarF0DhyI/SIrlD0l3zlLYcd5Dlc46BuK916psOOERJAMIk1+NlUyYrAFwQGpAQB9vMcEtQSm2MHpBhNxBuZ2igWhJ68+RKA4Gi3UouGION08itWSczchD/GpYlnha5onK5yJ/1TRRKIG/wMQLU82DsGJzHaKvSmRJYOVQ6ohPPM/HzSQL0kphEnCdE4/RxdjGowyWFX7KDbk48yjUj+5/CbzAvMgRdFGOOSw4nZFZcpxG1sqxGGrdKbiBIZfNvYNGjRo0KDBFIe/AYN3RH+Ifh0XAAAAAElFTkSuQmCC>

[image4]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA0AAAAbCAYAAACnZAX6AAAAxElEQVR4XmNgGAUjBngD8X4oPgvEjUDMhCTPiMQGgxogfgrEmlC+CBC/AuJaKL8MiD2hbDAIBeL/DBCbkMFsIH4NxMxAvBeI2WASIIEHQPwQJoAEQLaADIsA4snIEmRpMoNKzEQWhIICBojcVSAWQ5YIh0okIwtCQQ4DRC4PXcIKKhGALgEEdQwQOZBrUAAoHs4D8SwkMXEGiB9WMyAMDAFiBSQ1DLJAvAGIjwDxDiBeDsTWULlJQHwLiBcxYIncUTB4AQBczSfTPPQZ5QAAAABJRU5ErkJggg==>

[image5]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACUAAAAZCAYAAAC2JufVAAAB9klEQVR4Xu2Vz0sVURiGv6w2ghhZQiqts0AqCFzZ3Si4dSFtom0bN2lY0EY39QeEFARimAghLRIjEHQRFBolCJIoStaiH5RG1K7yfTln7j3z3ntGW9zdPPDAnfecOfPdmW/OmOXkVI+zcA6+gG9gPzyQmrE3tbBRQ88xOA4X4Wt4H9alZggn4Xd42R8fhSvwVnFGNpzfA5fhgIyRg3ABPjD3R3n8CM6Gk5QR+E6yq/AXrJdc4eJb5i7wzyoX1WturCnITvmsM8iKsPLPcErygrmTuOB+aLd4UY/hN8l4t/6YuyFltJhbbFTycz6/LXmMrKLW4aaG4Ad8qSG5YG4xNl7IGZ8/lDxGVlFsg1UNwVdzj76Mi+YWuyd5q8+fSB4jq6i/Vt6zhG2zrSEpWHWLYs8y/6+iYo/vtM+5t+yHpKjrOmDxx/cFftSQnDC32JjkSaPfkTxGUtSgDpgr6L2G5hr9lYYJn+BTybh/8CKXJI+RFHVDB8Ak/CnZYavcNkW4V6xJdg3+hkeCjG9kd3AckhR1UwestHk2B9l5n3UFWQruVTvwij8+Dj9Y+gJsWL7CXKgtyBM6zI0N6QCosdJnhr8PwWn4PJxUCVY+b+7kt7AvNep4BjdgQ5AN+4x3lUVxl2b/zARzCM+ZgEveu+Y+4Dk5OTlZ7AKxQnrR5XFuTQAAAABJRU5ErkJggg==>

[image6]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACYAAAAZCAYAAABdEVzWAAACX0lEQVR4Xu2WT0hUURTGT3+taJGFZVGkYUGLKGkRtMlcFgUWhBW4C4xo0SJw0SISgxa1lAoRBBMqVIrSjKgpSEGJIiGCDCKISoRapkj6fZ77muNx3psxcPc++ME7330z73tz7z13RFKlStRx0AfugC1uLNIy0AaW+4EkbfVG0BJwGbwFr0EP2GFvgKrAT7AmXP8G58G67C1SCTLgqvFitQrsBw/BIzcW6Tp4B1aHuh58ByX/7tDP3zQ1f7lz4L7oizwB3eATWGHuy6mzYBQ8BpOSO9hmMAFOGm+RaLAm430Bjaa+AfaZmuL3Vzsvr/5I7mB86ymwy/kZ8MHU38AVU/tgtaDV1AUrLliLaDC//h6Av2BlqJ+C5uzwzPRF66sYvAdrs8OFKy4Yp5nBNjqfa4f+tlAfAl9FQ1SBu8Gn+HKnTD0vxQV7IRqg1Pl8MP3dxuN0vQSdYH3wDoj+ev+tuGAZKTyYVxF4A8pCzY3UAZ6Bw8HLKwbjtHnFTeW94Fc434qb4UK4Zi8cBidE20U/2BDGEsVgvd6EbokGKHc+Fz/9aPF77RRtxgxEHRF9xuJQ14CL4TpR/BCboBebKQPsdT4f+tF5kdjnnoM9xrsk2jMjbRfdFHnFYOzWXptEm+9p4/G8G5P4o+UMuOY8TqsNxiMtb7ClYFx0R+USjySekzwHqQbRzs/W4MXdOChzp5hriy8fTe0xSZhK7ozP4JfodJEfYERmP5Rfxjfm4h0S3b1+zUVqBwe9Kbrg+b114XpA5u70BROPoNveNCoDXeAVODp7aGHF/1jsXalSpZqvpgFb5X1bKiFuLAAAAABJRU5ErkJggg==>

[image7]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAwAAAAbCAYAAABIpm7EAAAAo0lEQVR4XmNgGAUjC9QB8WEg3g7EwkDcDMTLoWKbgZgPoZSBwRCIpwKxMhD/B+KbQGwBleOBihVA+WBQAsSmQOwHlQxFkpOBilGmAQYmAfFXIGZDEktkgGgAORsDXGeAeBoZ7AHiG2hiYACzughN7C8QlwIxOxCvQpJjiGeAaNBGEguBiqkBcR4QpyHJMVQD8TFkASAQBOKTQLyDASI/CgYRAAAc4yIKCs7YsgAAAABJRU5ErkJggg==>

[image8]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGcAAAAZCAYAAAAsaTBIAAAE1ElEQVR4Xu2YV6gsRRCGf3NOiBERwSwiBlBR1KtcxISCAfRFFBUDZsQrKCYUjPhgQlBMYMCIiGJeAxgRxYD5IqYrXHPO1md1sb29uzOzZ3cPPswHP+d0VW/P9FRPdU1LLS0tLS0ts8dppu9N/yT9bvrG9J3pV9Prqc8S8YMGbGf6ynRh6RiTFUzvmp4tHWOyiOlP+fy/NH1gWpDaf5s+NM03/ZRsN/33K+cO02emdTLbxLlGfuFjM9vipv3lN/WYmgfoUPlYD5eOMVnP9JfpR9NivS7tbVq9sDVlZfm4zDXYXD6HNzLbMqZbTA9mto/k/ViQU+My+UUOK+xwtdx3YukYwqLyia5VOibAzqYtS6N8IfBAZ8L6pmcK26byOb9W2Nc1vZC1NzLtkbWnQlVwTpH7niod/xNWMX2tmQdnW9OVhW1YcOCV0jBtqoIzT+7rFPZhrCRfjZuUjjFZVr5yt8lsq5rukd9fGZwl5fsJkAZp53be8KVMc0zHJ19QFZz701/SPNlhC9OKXffkqQrOzXLfCal9tnzTpGjARkr53HScaTPTL6l/J/UPljddLp/w83L/Tpm/alz4WD4uCt6S70HYKGQWmu5MPq4VPgodxocHkg1dmmwlVcEJ2H9inDnJdq68ePjBdL7pevk8uC+KhzVTv5EYFBxWxoHyh/2QupvwGvLCgf5UKrTpExNhZfIgO6kNrFBy9XXyFQs7yicRObtuXLg9+XNY9djKNweooqjEWGAB98fDqtrEeevrggNHqzc4+Ryo8ggyrG361PSOablka0wE5xP5DSHKVlY4KzceaLCBvD8rA3ZV70ZNXu5k7bPkZSlpKOc2eSAIHtSNG/eZUxUcYOXyVsU12MTv6roH0jQ4+6g3OED2wHZyZoMjkv30wl5LTLrMvcOIh0ixMIiX1Buct+UpqoRUwzhzU7tu3Es0enAOkfsPSO3zTPt23QNpGpy91B8cgj8oOKQ07I8X9lpmGhxe60GQwjpZm32EVFdyhnycw1O7btyLNHpw+D7h+vel9ouq/2ZrGhxSchmcmEMZHLIPdjLSSMw0OEeWjgQPoJO12bgXZu2AUwTGiX2nbtyL1R8c0i42qia4VV7Z5ZAmf5OnoWsL3yCaBmdPNQ8O+xH2Gb85UZHVUfcQy+BQudB/tcwG98qDtnRq1407KDhHJVvsTY+o/81g76LPAnkhUsckgnNqZgOyA3YKhpGIU4AzS8cQtpb3P6l0JF41PZe1+Q7gnO5G+bEQ7CKvxmIvgLpxr5D7YwyI3xwjDzJHTSV811DszE//17G9fMz31B/onP3k/eZmtgjO++qekmD7wvS0eu+9EqLL1zWDhb41HZx3KuBr+g95XyowDjnjw3AHefUVPs6e+IIH/vJw30x60rRb8kHVuJTxPNg4oKS4iFQIFBa8FUyeexgE2eGC0lhA4cL8OWuL58EBMM+IQiKH76mf5X2oBs9J9ggO17tB/hnCPkMxM3IZPUlYFbHSWKGUr01WahN4K2IsrtN4BSbuNm1YGseA+4lPDP7y/QQRnHLPack4yPSE/DiJE+tHe91TY2O1wanlKnka5JyPam33XvfU2EoenHmlo6ULFRdV48vqr5ymBftMnOexf9ZVey2zCPtt7EPsj7EPtbS0zAr/AkdcXotvoswhAAAAAElFTkSuQmCC>

[image9]: <data:image/png;base64,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>

[image10]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAZCAYAAAB3oa15AAACrUlEQVR4Xu2WWahOURiGX2OGjBkzFqVwY0jiSqYiJMl4SJmnckESLkSuXEkppVNIciMZowxFlAu54AIXUqYSJRnD+55v7az/O3vvf+/jOFHnqafTfvc+/ftba31rbaCZRqMbHUenFPCfowVdSQ/RXXR7FRuVVvS0D0vSn+6gk/yNhjLIBzlMo/t9WAINwBK6BraMxGx6m96jD2Gzoudy6UAn0LP0nLuXx1E6yoclGEw34/fankzv0+7hWgP0kx4J16mso2/oefodxQtoS+/6sAQt6Ty6lvYIWS3shVeEa/XHR9h7JUXl8hnFC5hD9/iwBH3pejoryvbBCpgfZZ/oD9oxyjIpU8BJOsKHBdHoT6eraK8o14jH1yNhBV2NslyKFqCe+ZPlo9FfBlvjWXShF+gLOtTdy6RoAQvpTh9GaNfo48OARllNq70/a10fp8/oezre3culaAFnkD0qnelqutvfCGiJLIf1UDVm0G+wnaoQKkC7UR6a2ls+DAygm+g1+oQOq7xdh7brDcieIc9NWBMXmgkVcNGHDm1xW30Y0KzoRFURH1B/l9J2WYPKnSdmDOqfK7WwRj7g8lRUwCUfOlTgQB8G2oW/Q+gDWKPHz+qDTb3TM8oS+sH2+6+onJ0TsAIORlkmKuCyDyM0gtd9mEIn2CfAa7olZPrfRXQxrJE9emm96FvYLpdwJ+RzoyyV1vQLveFvROibRcujGtrnh8P6QP3Sm46FNXba6Cecosdo13A9Fbb+9YmTVnQdM+lT+g5WqXwF+/HkAyvhCoo3n2ZBJ+tLWM8sReUJm4Y+T9Q3+m290yO6jbaJH2ooGsW85eXRiI2mz2Evs5e2r3iiidkIO3zKoNk6TB+j2L7/V9Hy8UuqGuqribCTNW7MJkcjqdP3v2UB7Nu9mWYifgFg0HyPB/LjhgAAAABJRU5ErkJggg==>