# **Strategic Engineering and Narrative Playbook for LAX: KeeperHub Agents Onchain Hackathon**

The onchain agent landscape is transitioning from passive diagnostic observers to active execution networks1. Under the judging criteria of the KeeperHub "Agents Onchain" hackathon, projects are evaluated based on their ability to execute transactions reliably and securely1. The proactive liquidation defender LAX (Keep Your Position Safe) is positioned to demonstrate these capabilities1. This report presents an exhaustive engineering and narrative strategy to secure the Grand Prize and the Onboarding Developer Experience (DX) Bounty1.

## **Category A: Demo Experience and Judge Wow-Factor**

The live demonstration represents the single highest-leverage asset in a hackathon submission. A high-fidelity, polished, and structured presentation is essential to demonstrate production-readiness1.

### **Down-to-the-Second Demo Script and Screen Choreography**

The visual presentation is structured as a side-by-side display: the left side displays the React dashboard, while the right side displays an active terminal showcasing the local Anvil fork1 and running the Model Context Protocol (MCP) server logs1. This layout allows judges to verify that user actions on the frontend translate directly to real-time blockchain states1.

| Timestamp | Visual Screen Layout | Interactive Actions & Triggers | Narrative Theme |
| :---- | :---- | :---- | :---- |
| **00:00 \- 00:30** | Left: React Dashboard displaying a green Health Factor of ![][image1]4. Right: Active Anvil logs2. | The system starts the polling daemon scripts/hf-listener.ts1. | Proactive vs. Reactive liquidation defense: LAX protects user collateral before liquidators can trigger execution1. |
| **00:30 \- 01:00** | Left: Real-time price chart on dashboard. Right: Terminal executing scripts/drop-oracle-price.sh 35\. | The shell script drops the WETH price by ![][image2] on the local LAXMockOracle1. | Simulating market drawdowns: showing how real-world oracle fluctuations trigger automated system alerts1. |
| **01:00 \- 01:30** | Left: The Health Factor drops to ![][image3]. The dashboard transitions to a red alert state1. | The listener detects the drop (![][image4]) and initiates the KeeperHub workflow1. | Real-time monitoring and trigger dispatching: demonstrating sub-2-second detection latency1. |
| **01:30 \- 02:00** | Left: MitigationView displays active step animations for ERC-20 approval and repayment1. | The @keeperhub/wallet signs the transactions using Turnkey-custodied enclaves1. | Enclave security and reliable onchain signature generation8. |
| **02:00 \- 02:30** | Left: Transition to AuditView showing a restored Health Factor of ![][image5]1. | The dashboard polls the execution status and updates the UI with the final state1. | Onchain execution verification and final status confirmation1. |
| **02:30 \- 03:00** | Left: Clicking the audit trail link1. Right: Displaying transaction details in Otterscan9. | The browser displays the transaction details on the local Otterscan instance9. | Transparency and auditability: exploring the full onchain execution path1. |

### **Mature Dashboard UI Design Decisions**

To demonstrate high-quality frontend design, specific user interface improvements are implemented to differentiate LAX from standard submissions1:

* **Monospace CLI Console Integration:** Rather than showing raw, unformatted JSON responses from the KeeperHub API, the dashboard integrates a scrollable monospace console mimicking terminal outputs. It parses standard execution logs to display clean updates: \[12:00:02\] INFO: Health Factor evaluated at 1.045 (Threshold: 1.050) \[12:00:03\] KEEPERHUB: Webhook triggered successfully (ID: run\_0a12f) \[12:00:04\] WALLET: Signed approval payload via Turnkey Secure Enclave \[12:00:06\] ONCHAIN: Transaction 0x7a2d... confirmed on Base Mainnet Fork  
* **Interactive Health Factor Gauge:** The health factor bar features three distinct markers: a red zone (![][image6])4, a yellow intervention zone (![][image7] to ![][image8])4, and a green safe zone (![][image9])4. A dynamic needle moves across these ranges, supported by tooltips explaining the Aave V3 liquidation mechanics10.

### **Local Block Explorer Configuration via Otterscan**

* **Impact:** HIGH  
* **Effort Estimate:** 1.5 Days  
* **ROI:** High

Running a local block explorer is highly effective for visual verification during the demo9. To avoid broken transaction links that return a 404 Not Found error, a containerized Otterscan instance is connected directly to the local Anvil fork11.

#### **Erigon-Compatible Nightly Setup**

Historically, when Otterscan queries local Anvil instances for transaction details, the node can crash with thread panic errors due to missing block headers or incomplete transaction traces13: thread 'tokio-runtime-worker' panicked at 'called Option::unwrap() on a None value' inside crates/anvil/src/eth/otterscan/api.rs To prevent this issue, the local environment must use a Foundry nightly build containing commit e5ec47b (or newer) to ensure the Otterscan RPC namespace degrades safely14.

#### **Integration Steps**

1. **Container Deployment:** Execute the Otterscan container and map it to the Anvil port11:  
   Bash  
   docker run \--rm \-p 5100:80 \--name otterscan \-e ERIGON\_URL="http://anvil:8545" \-d otterscan/otterscan:latest

2. **Hosts Resolution:** Map basescan.local to the loopback address inside /etc/hosts to mimic a mainnet environment: 127.0.0.1 basescan.local  
3. **Nginx Reverse Proxy:** Route HTTP requests on port 80 for basescan.local to http://localhost:5100 to allow the dashboard to generate functional transaction links (e.g., http://basescan.local/tx/0x...) that resolve to local block details9.

### **Mid-Demo Failure Recovery Strategy**

* **Impact:** HIGH  
* **Effort Estimate:** 6 Hours  
* **ROI:** High

To handle transient network drops or local RPC disruptions during the presentation, a fallback path is integrated into the dashboard to ensure the demo remains functional.

#### **Fallback Architecture**

1. **Timeout Handling:** The React hook useExecutionPoller tracks the latency of incoming API calls. If the KeeperHub status endpoint does not respond within five seconds, the dashboard transitions into a simulated local execution mode.  
2. **Mock Runner:** The hook switches its polling target from the external API to a local script, scripts/test-pipeline.sh, which executes the raw transaction flow directly on the local fork without external dependencies1.  
3. **UI Indicators:** A subtle indicator status is displayed ("Mode: Local Execution Fallback") to keep the interface functional and allow judges to review the logical flow even during an external API outage.

## **Category B: Technical Differentiation**

Most hackathon entries are limited to basic triggers and actions. LAX distinguishes itself by incorporating advanced portfolio optimization and simulation directly into its agent loop1.

### **Counterfactual Portfolio Optimization Loop**

* **Impact:** HIGH  
* **Effort Estimate:** 2.5 Days  
* **ROI:** High

Rather than relying on basic stablecoin debt repayment, the LAX agent evaluates multiple collateral and debt assets to determine the optimal action that minimizes capital outlay5.  
The standard Aave V3 health factor calculation is defined by the following formula10:  
![][image10]  
Where ![][image11] represents the USD value of collateral asset ![][image12], ![][image13] is its liquidation threshold10, and ![][image14] is the USD value of debt asset ![][image15]15.  
To restore the position to a target health factor ![][image16] using the minimum amount of capital, the optimization loop evaluates two potential actions:

#### **Path 1: Partial Debt Repayment (![][image17])**

The capital required to repay a portion of debt asset ![][image15] to reach ![][image16] is modeled as:  
![][image18]

#### **Path 2: Collateral Supply (![][image19])**

The capital required to supply additional collateral asset ![][image12] to reach ![][image16] is modeled as:  
![][image20]  
The agent evaluates both paths. If the user holds multiple collateral types, the agent selects the asset with the highest ![][image13] (e.g., ![][image21] for WETH vs. ![][image22] for USDC on Base Aave V3) to minimize the capital required to secure the position16.

#### **Optimization Code: src/counterfactual-optimizer.ts**

TypeScript  
interface AssetData {  
  tokenAddress: string;  
  usdValue: number;  
  liquidationThreshold: number; // e.g., 0.83 for WETH  
}

export interface OptimizationResult {  
  recommendedAction: 'REPAY' | 'SUPPLY';  
  targetToken: string;  
  requiredCapitalUSD: number;  
}

export function computeOptimalMitigation(  
  collaterals: AssetData\[\],  
  debts: AssetData\[\],  
  targetHF: number  
): OptimizationResult {  
  const sumLTCollateral \= collaterals.reduce(  
    (acc, c) \=\> acc \+ c.usdValue \* c.liquidationThreshold, 0  
  );  
  const totalDebt \= debts.reduce((acc, d) \=\> acc \+ d.usdValue, 0);

  // Path 1: Calculate repayment amount on the largest debt pool  
  const largestDebt \= debts.sort((a, b) \=\> b.usdValue \- a.usdValue)\[0\];  
  const repayRequired \= (totalDebt \* targetHF \- sumLTCollateral) / targetHF;

  // Path 2: Calculate additional supply amount on the highest LT collateral asset  
  const highestLTCollateral \= collaterals.sort((a, b) \=\> b.liquidationThreshold \- a.liquidationThreshold)\[0\];  
  const supplyRequired \= (totalDebt \* targetHF \- sumLTCollateral) / highestLTCollateral.liquidationThreshold;

  if (repayRequired \<= supplyRequired && repayRequired \> 0\) {  
    return {  
      recommendedAction: 'REPAY',  
      targetToken: largestDebt.tokenAddress,  
      requiredCapitalUSD: Math.max(0, repayRequired),  
    };  
  } else {  
    return {  
      recommendedAction: 'SUPPLY',  
      targetToken: highestLTCollateral.tokenAddress,  
      requiredCapitalUSD: Math.max(0, supplyRequired),  
    };  
  }  
}

### **Pre-Flight Transaction Simulation Engine**

* **Impact:** HIGH  
* **Effort Estimate:** 1.5 Days  
* **ROI:** High

Before broadcasting execution payloads to external APIs, the agent runs local pre-flight simulations to verify transaction validity and ensure the proposed action successfully restores the position8.

#### **Simulation Execution Path**

The LAX daemon uses the cast call command line utility to simulate the transaction on the local Anvil fork before submitting the workflow to KeeperHub8. This verifies that the approval and repayment functions will succeed without reverting7.

TypeScript  
import { execSync } from 'child\_process';

export function runPreflightSimulation(  
  userAddress: string,  
  repayToken: string,  
  repayAmount: string,  
  anvilRpcUrl: string  
): boolean {  
  try {  
    // Simulate approval on local fork  
    const approveCall \= \`cast call ${repayToken} "approve(address,uint256)" 0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2 ${repayAmount} \--rpc-url ${anvilRpcUrl}\`;  
    execSync(approveCall);  
      
    // Simulate repayment on Aave V3 Pool contract  
    const repayCall \= \`cast call 0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2 "repay(address,uint256,uint256,address)" ${repayToken} ${repayAmount} 2 ${userAddress} \--rpc-url ${anvilRpcUrl}\`;  
    execSync(repayCall);  
      
    return true;  
  } catch (error) {  
    console.error("Simulation failed:", error);  
    return false;  
  }  
}

### **Real-Time Base Mainnet Gas Price Ingestion**

* **Impact:** MEDIUM  
* **Effort Estimate:** 8 Hours  
* **ROI:** Medium

While the demo runs on a local fork, incorporating real-world network conditions helps demonstrate production-readiness1.

#### **Implementation Strategy**

The system updates the local Anvil fork's base fee to match the live Base mainnet environment2:

1. Query the live Base mainnet gas price:  
   Bash  
   GAS\_PRICE=$(cast gas-price \--rpc-url https://mainnet.base.org)

2. Update the local Anvil base fee per gas using the RPC admin endpoint2:  
   Bash  
   curl \-H "Content-Type: application/json" \-X POST \--data \\  
     '{"jsonrpc":"2.0","method":"anvil\_setNextBlockBaseFeePerGas","params":\["'"$GAS\_PRICE"'"\],"id":1}' \\  
     http://localhost:8545

3. This syncs local transaction costs with live mainnet conditions, demonstrating KeeperHub's gas optimization features under realistic scenarios1.

### **Multi-Step Safety Plugin Recovery Loop**

* **Impact:** MEDIUM  
* **Effort Estimate:** 12 Hours  
* **ROI:** Medium

To handle complex execution failures, such as a successful approval followed by a failed repayment, the agent integrates multi-step recovery logic1.

#### **Execution Tracking**

The system tracks the progress of each workflow step. If the initial ERC-20 approval completes but the Aave repayment fails (e.g., due to dynamic gas spikes), the agent triggers a secondary transaction to resubmit the repayment with a ![][image23] gas multiplier1, avoiding the need to redo the approval step.

## **Category C: KeeperHub Surface Exploitation**

Maximizing the use of KeeperHub's features is critical, as surface utilization is heavily weighted under the hackathon's judging criteria1.

### **Autonomous Telemetry Payments via x402 / MPP**

* **Impact:** HIGH  
* **Effort Estimate:** 3 Days  
* **ROI:** High

The agent can demonstrate advanced integration by incorporating autonomous, machine-to-machine payments1. Rather than relying on traditional subscriptions or manual API keys, the LAX daemon uses the @keeperhub/wallet package to pay for its own data feeds using the x402 protocol or Stripe's Machine Payments Protocol (MPP)19.

                     \+---------------------------------------+  
                     |             LAX Client               |  
                     |          (Dashboard/Daemon)           |  
                     \+-------------------+-------------------+  
                                         |  
                                         | 1\. HTTP GET /api/telemetry  
                                         v  
                     \+-------------------+-------------------+  
                     |          Telemetry Server             |  
                     |           (Express/Hono)              |  
                     \+-------------------+-------------------+  
                                         |  
                                         | 2\. HTTP 402 Payment Required  
                                         |    \- Challenge: 0.10 USDC  
                                         v  
                     \+-------------------+-------------------+  
                     |         KeeperHub Agentic Wallet      |  
                     |          (@keeperhub/wallet)          |  
                     \+-------------------+-------------------+  
                                         |  
                                         | 3\. Signs & Settles Onchain  
                                         |    Payment (Base USDC)  
                                         v  
                     \+-------------------+-------------------+  
                     |          Telemetry Server             |  
                     |       (Verifies & Serves Data)        |  
                     \+---------------------------------------+

#### **Protocol Comparisons**

To support multiple integration options, the system is designed to handle both payment protocol specifications22:

| Feature | x402 Protocol Specification | Machine Payments Protocol (MPP) |
| :---- | :---- | :---- |
| **HTTP Trigger Header** | PAYMENT-REQUIRED \[cite: 24\] | WWW-Authenticate: Payment \[cite: 24\] |
| **HTTP Response Header** | PAYMENT-SIGNATURE \[cite: 24, 26\] | Authorization: Payment \[cite: 24\] |
| **HTTP Receipt Header** | PAYMENT-RESPONSE \[cite: 24\] | Payment-Receipt \[cite: 24\] |
| **Settlement Method** | Direct Onchain Transaction (EVM/Solana)23 | Session-Based Off-chain Vouchers25 |
| **Supported Assets** | Base USDC, Polygon/Solana Stablecoins22 | USDC on Tempo L1 & Fiat Integration25 |

#### **Technical Implementation**

1. **The Telemetry Server:** An Express/Hono route, /api/telemetry, requires a payment of ![][image24] USDC on Base mainnet to access the premium data feed28:  
   TypeScript  
   import { Hono } from 'hono';  
   const app \= new Hono();

   app.get('/api/telemetry', (c) \=\> {  
     const authHeader \= c.req.header('Authorization');  
     if (\!authHeader || \!verifyMppPayment(authHeader)) {  
       c.header('WWW-Authenticate', 'Payment realm="LAX Telemetry", price="0.10", asset="USDC", network="8453"');  
       return c.text('Payment Required', 402);  
     }  
     return c.json({ oraclePrices: { WETH: 3100.25 }, congestionIndex: 1.12 });  
   });

2. **The Client Agent Interceptor:** The LAX daemon intercepts the 402 challenge, uses the @keeperhub/wallet package to sign and broadcast the USDC payment on Base, and retries the request with the signed payment credentials in the headers19.  
3. **Dashboard Logs:** Display a log entry on the dashboard highlighting this autonomous exchange: "Telemetry unlocked: Paid 0.10 USDC via x402 on Base mainnet"28.

### **Designing an Expressive Visual Workflow**

* **Impact:** MEDIUM  
* **Effort Estimate:** 1.5 Days  
* **ROI:** Medium

When judges evaluate the project's transaction history on the KeeperHub interface, the run dashboard should present a clear, easy-to-follow sequence1.

* **Visual Node Labelling:** The workflow inside the visual builder must avoid generic labels (e.g., "Step 1", "HTTP Request"). Instead, name nodes according to their precise functional roles:  
  * Webhook Trigger ![][image25] Aave Position Health Drop Monitor  
    \[cite: 32, 33\]  
  * Read Contract ![][image25] Query Pool Account Data  
    \[cite: 32\]  
  * Condition Node ![][image25] Is Health Factor \<= 1.05?  
    \[cite: 32\]  
  * Write Contract (Approve) ![][image25] Authorize USDC Debt Repayment  
    \[cite: 32\]  
  * Write Contract (Repay) ![][image25] Execute Aave Repayment  
    \[cite: 7, 32\]  
  * Read Contract (Verify) ![][image25] Confirm Health Factor Restored  
    \[cite: 32\]  
* **Self-Contained Run Details:** When a judge clicks the run link (app.keeperhub.com/runs/\<id\>), they should see a structured execution path with green checkmarks on each node8. The logs for the final verification step must print the pre-execution health factor alongside the post-execution health factor, demonstrating a successful recovery.

### **Terminal Output Tracking inside the Dashboard**

* **Impact:** MEDIUM  
* **Effort Estimate:** 1 Day  
* **ROI:** Medium

The dashboard can run the KeeperHub CLI (kh version 0.10.0) in the background and stream the execution logs directly to the user interface19.

#### **Backend Architecture**

1. **Execution Hook:** Expose a local endpoint, /api/cli-logs, that executes kh run logs \<run\_id\>19:  
   TypeScript  
   import { exec } from 'child\_process';  
   app.get('/api/cli-logs/:id', (req, res) \=\> {  
     exec(\`kh run logs ${req.params.id} \--json\`, (error, stdout) \=\> {  
       if (error) return res.status(500).json({ error: error.message });  
       res.json(JSON.parse(stdout));  
     });  
   });

2. **Dynamic UI Rendering:** The frontend polls this endpoint and displays the raw CLI outputs inside a terminal emulator component, allowing judges to review the output of standard terminal tools without leaving the dashboard browser window.

## **Category D: Developer Experience (DX) Bounty**

Winning the Onboarding DX Bounty requires delivering resources that simplify the setup and deployment process for new developers joining the KeeperHub ecosystem1.

### **Containerized Setup Wizard**

* **Impact:** HIGH  
* **Effort Estimate:** 2 Days  
* **ROI:** High

To eliminate local environment and dependency issues, developers can boot the entire LAX environment using a single command9.

#### **Unified Setup: docker-compose.yml**

YAML  
version: '3.8'

services:  
  anvil:  
    image: ghcr.io/foundry-rs/foundry:latest  
    ports:  
      \- "8545:8545"  
    entrypoint: \[  
      "anvil",  
      "--fork-url",  
      "https://mainnet.base.org",  
      "--host",  
      "0.0.0.0",  
      "--ots"  
    \]

  otterscan:  
    image: otterscan/otterscan:latest  
    ports:  
      \- "5100:80"  
    environment:  
      \- ERIGON\_URL=http://anvil:8545  
    depends\_on:  
      \- anvil

  dashboard:  
    build:  
      context: .  
      dockerfile: Dockerfile.dashboard  
    ports:  
      \- "5173:5173"  
    environment:  
      \- VITE\_RPC\_URL=http://localhost:8545  
    depends\_on:  
      \- anvil

  agent-daemon:  
    build:  
      context: .  
      dockerfile: Dockerfile.agent  
    environment:  
      \- RPC\_URL=http://anvil:8545  
      \- KEEPERHUB\_API\_KEY=${KEEPERHUB\_API\_KEY}  
    depends\_on:  
      \- anvil

### **Comprehensive Integration Friction Log (FEEDBACK.md)**

* **Impact:** HIGH  
* **Effort Estimate:** 1.5 Days  
* **ROI:** High

Judges evaluating developer experience value honest, highly technical, and actionable feedback1. A structured FEEDBACK.md file must be included in the repository's root directory, detailing real hurdles encountered during integration and proposing concrete technical solutions34.

#### **Example Friction Log Content**

1. **SDK Parameter Typing and Serialization Constraints:**  
   * *The Friction:* The @keeperhub/sdk direct execution function executeContractCall requires arguments passed to functionArgs to be formatted as a string-serialized JSON array rather than a standard native JavaScript array36. This nuance is undocumented, leading to runtime encoding errors and failed calls during initial integration.  
   * *Proposed Solution:* Implement client-side schema validation inside the SDK using a TypeScript guard to auto-serialize parameters if passed as a native array:  
     TypeScript  
     if (Array.isArray(args.functionArgs)) {  
       args.functionArgs \= JSON.stringify(args.functionArgs);  
     }

2. **Para-Enclave Local Development Network Incompatibility:**  
   * *The Friction:* When running integrations against an isolated local Anvil fork, the Para-integrated enclaves cannot easily query or sign for local transactions without a public TLS endpoint8.  
   * *Proposed Solution:* Provide a mock signature bypass flag in the local development configurations of @keeperhub/wallet to allow developers to verify their execution flows locally before deploying to mainnet19.

### **Pull Request Submission for SDK Parameter Serialization**

* **Impact:** MEDIUM  
* **Effort Estimate:** 1 Day  
* **ROI:** Medium

Submitting a direct contribution to the core codebase is highly effective for securing the Onboarding DX Bounty1.

#### **Proposed Contribution**

The developer should submit a pull request to the official @keeperhub/sdk repository19 to automatically serialize direct execution arguments. This patch intercepts incoming transaction payloads and formats the arguments correctly, eliminating serialization errors for new developers.

## **Category E: Offline and Reliability Engineering**

A robust project demonstrates how it handles infrastructure degradation, proving its reliability within the judging window1.

### **Degraded State Machine with Offline Cache Fallback**

* **Impact:** HIGH  
* **Effort Estimate:** 1 Day  
* **ROI:** High

If the local Anvil fork crashes or network connectivity is lost during the demo, the dashboard should degrade gracefully rather than displaying broken elements.

#### **Logic Flow**

* The hook usePositionPoller tracks the connection status to the RPC node. If two consecutive JSON-RPC requests fail, the dashboard transitions to an "OFFLINE" state.  
* Rather than clearing the interface, the UI displays cached position details from localStorage (representing the last known healthy state of the position), accompanied by a yellow warning badge: "Displaying Cached Position Data (Offline Mode)".  
* When connection is re-established, the dashboard automatically syncs and resumes active tracking.

### **SQLite State Transition Ledger**

* **Impact:** MEDIUM  
* **Effort Estimate:** 12 Hours  
* **ROI:** Medium

To maintain a durable local record of all monitoring states and actions, the daemon should write every state transition to a local database.

#### **Implementation**

1. Initialize a lightweight SQLite database (src/database/ledger.db).  
2. Write records containing standard system variables on every block update:  
   TypeScript  
   import Database from 'better-sqlite3';  
   const db \= new Database('src/database/ledger.db');

   export function recordStateTransition(  
     blockNumber: number,  
     healthFactor: number,  
     totalCollateral: number,  
     totalDebt: number,  
     status: string  
   ) {  
     const insert \= db.prepare(\`  
       INSERT INTO ledger (block, health\_factor, collateral, debt, status, timestamp)  
       VALUES (?, ?, ?, ?, ?, STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW'))  
     \`);  
     insert.run(blockNumber, healthFactor, totalCollateral, totalDebt, status);  
   }

3. During the demo, display this ledger as a clean history panel, allowing the judge to verify the continuity and historical performance of the monitoring loop.

## **Category F: Narrative and Project Positioning**

The project's messaging must be clear, concise, and structured to highlight its technical merits to judges who evaluate dozens of submissions1.

### **The Core Vision**

"LAX is an autonomous, self-preservational execution agent that bridges real-time risk modeling and guaranteed onchain debt management to shield DeFi positions before liquidators can extract value."

### **Conceptual Analogy**

To ensure the project's value is immediately clear to judges, LAX is presented as:  
"An automated heart monitor and defibrillator for your lending position. It continuously monitors the position's vitals, and if it detects a dangerous drop, it automatically administers a precise corrective dose of capital to stabilize the position."

### **Presentation Video Rules**

* **Avoid Marketing Hype:** The recording should focus on clear technical demonstrations rather than cinematic animations1.  
* **Show Continuous Execution:** The transit from the oracle price drop to the KeeperHub transaction confirmation must be shown in a single, un-cut sequence to prove the automation works in real time1.  
* **Maintain Professionalism:** Focus the voiceover on technical details such as gas efficiency, enclave safety, and optimization math1.

## **Category G: Timeline and Prioritization**

To maximize the five-week window leading to the submission deadline, resources must be allocated to high-impact improvements while avoiding features that are already functional.

\+=============================================================================+  
|                               PROJECT TIMELINE                              |  
\+=============================================================================+  
 \[Week 1\] Create local dev setup & Friction Log documentation.  
 \[Week 2\] Integrate Otterscan local block explorer.  
 \[Week 3\] Build Counterfactual Optimizer & Simulation Engine.  
 \[Week 4\] Implement x402/MPP telemetry payment loop.  
 \[Week 5\] Polish dashboard UI and record final demo video.

### **Weekly Execution Plan**

#### **Week 1: July 6 \- July 12**

* **Focus Area:** DX Foundations & Setup Wizard1.  
* **Key Tasks:** Build the standard container configurations using docker-compose11. Initiate FEEDBACK.md to document early integration challenges1.  
* **Time Allocation:** 25 Hours.

#### **Week 2: July 13 \- July 19**

* **Focus Area:** Otterscan & Gas Integration9.  
* **Key Tasks:** Configure Otterscan locally and resolve the ots\_getBlockTransactions timestamp bug11. Implement real-time gas fee injection from Base mainnet2.  
* **Time Allocation:** 25 Hours.

#### **Week 3: July 20 \- July 26**

* **Focus Area:** Portfolio Math & Simulation5.  
* **Key Tasks:** Write the counterfactual optimization logic5 inside src/counterfactual-optimizer.ts. Write the cast call simulation routine inside hf-listener.ts17.  
* **Time Allocation:** 25 Hours.

#### **Week 4: July 27 \- August 2 (Hackathon Opens)**

* **Focus Area:** x402/MPP Payments & KeeperHub Workflows1.  
* **Key Tasks:** Connect @keeperhub/wallet to handle autonomous 402 challenge-response loops for premium telemetry feeds19. Refine visual labeling within the visual builder interface.  
* **Time Allocation:** 25 Hours.

#### **Week 5: August 3 \- August 9**

* **Focus Area:** Visual Polishing & Stress Testing.  
* **Key Tasks:** Style the dashboard's simulated terminal and add tick marks to the health factor bar. Run the dry-run.sh script to verify system stability across fifty consecutive simulated market drops.  
* **Time Allocation:** 25 Hours.

#### **Final Days: August 10 \- August 13**

* **Focus Area:** Video Production & Submission1.  
* **Key Tasks:** Record and verify the live execution demo video1. Finalize the DoraHacks portal fields, code repositories, and feedback documents1.  
* **Time Allocation:** 15 Hours.

### **Features to Freeze (Stop Doing)**

* **No Mainnet Deployments:** Do not attempt to run live transactions on mainnet with real funds. The Anvil mainnet fork is fully accepted and provides a safe, reproducible testing environment1.  
* **No Multi-Protocol Expansions:** Avoid expanding to additional lending protocols (e.g., Morpho, Compound V3)7. Focus on delivering a flawless, high-fidelity experience specifically optimized for Aave V31.

## **Category H: Risks to Avoid**

Developing a highly automated system involves technical risk. The table below lists critical challenges and their corresponding mitigation strategies.

| Risk Event | Likelihood | Impact | Practical Mitigation Strategy |
| :---- | :---- | :---- | :---- |
| **Anvil Thread Panic (Otterscan)** | High13 | Severe | Enforce a strict nightly Foundry build (commit e5ec47b) inside the Docker environment to ensure compatible error handling14. |
| **KeeperHub API Outage** | Medium1 | Severe | Integrate a client-side timeout fallback that redirects execution to local scripts when the API is unreachable37. |
| **RPC Rate Limiting** | High9 | Medium | Cache network states using anvil\_dumpState2. This allows the developer to load pre-seeded states offline and avoids spamming public endpoints1. |
| **Disqualification for Pre-Built Work** | Low1 | Severe | Explicitly declare Phase 0-3 work in the README. Focus the build phase on major new updates, such as the Counterfactual Optimizer5 and x402 payments20. |
| **OpenCode Connection Drop** | Medium1 | High | Provide a local manual override button on the dashboard interface to trigger the workflow without relying on LLM parsing during connectivity issues1. |

#### **Works cited**

1. Agents Onchain Hackathon \- KeeperHub \- DoraHacks, [https://dorahacks.io/hackathon/agents-onchain](https://dorahacks.io/hackathon/agents-onchain)  
2. Anvil – foundry \- Ethereum Development Framework, [https://www.getfoundry.sh/anvil](https://www.getfoundry.sh/anvil)  
3. KeeperHub MCP: Blockchain Automated Workflow MCP Tool with Natural Language Operation Support, [https://mcp.aibase.com/server/1639703010877907351](https://mcp.aibase.com/server/1639703010877907351)  
4. Health Factor — Definition, Formula & Why It Matters \- Otomato, [https://otomato.xyz/learn/health-factor](https://otomato.xyz/learn/health-factor)  
5. From Risk to Rescue: An Agentic Survival Analysis Framework for Liquidation Prevention \- arXiv, [https://arxiv.org/pdf/2604.14583](https://arxiv.org/pdf/2604.14583)  
6. 0xnavarro/Aave-Liquiditor: An Aave Loan Liquidator bot. \- GitHub, [https://github.com/0xnavarro/Aave-Liquiditor](https://github.com/0xnavarro/Aave-Liquiditor)  
7. Aave V3 Lending | Cobo Agentic Wallet, [https://www.cobo.com/agentic-wallet/recipes/aave-v3-lending](https://www.cobo.com/agentic-wallet/recipes/aave-v3-lending)  
8. KeeperHub Docs: Overview, [https://docs.keeperhub.com/](https://docs.keeperhub.com/)  
9. Quickstart \- CoW Protocol Services, [https://cowprotocol-services.mintlify.app/quickstart](https://cowprotocol-services.mintlify.app/quickstart)  
10. Health Factor & Liquidations \- Aave, [https://aave.com/help/borrowing/liquidations](https://aave.com/help/borrowing/liquidations)  
11. Start an anvil and otterscan with bun \- GitHub Gist, [https://gist.github.com/dalechyn/003757568c354512de2850047732d58e](https://gist.github.com/dalechyn/003757568c354512de2850047732d58e)  
12. support for local testnets ? · Issue \#1730 · otterscan/otterscan \- GitHub, [https://github.com/otterscan/otterscan/issues/1730](https://github.com/otterscan/otterscan/issues/1730)  
13. Otterscan fails to load wallet history and block transactions with anvil local fork \#7881, [https://github.com/foundry-rs/foundry/issues/7881](https://github.com/foundry-rs/foundry/issues/7881)  
14. blockscout/scoutup: Dev tool for running local blockscouts \- GitHub, [https://github.com/blockscout/scoutup](https://github.com/blockscout/scoutup)  
15. Contract Architecture \- Health Factor \- Aave V3 Protocol Development \- Video, [https://updraft.cyfrin.io/courses/aave-v3/contract-architecture/health-factor](https://updraft.cyfrin.io/courses/aave-v3/contract-architecture/health-factor)  
16. Aave v3 Core \- DeFi Saver, [https://app.defisaver.com/aave](https://app.defisaver.com/aave)  
17. anvil Reference \- Foundry Book, [https://learnblockchain.cn/docs/foundry/i18n/en/reference/anvil/](https://learnblockchain.cn/docs/foundry/i18n/en/reference/anvil/)  
18. KeeperHub \- The execution layer for onchain agents, [https://keeperhub.com/](https://keeperhub.com/)  
19. KeeperHub \- GitHub, [https://github.com/KeeperHub](https://github.com/KeeperHub)  
20. x402 and Agentic Commerce: Redefining Autonomous Payments in Financial Services | AWS for Industries, [https://aws.amazon.com/blogs/industries/x402-and-agentic-commerce-redefining-autonomous-payments-in-financial-services/](https://aws.amazon.com/blogs/industries/x402-and-agentic-commerce-redefining-autonomous-payments-in-financial-services/)  
21. Introducing the Machine Payments Protocol \- Stripe, [https://stripe.com/blog/machine-payments-protocol](https://stripe.com/blog/machine-payments-protocol)  
22. Understanding x402 and MPP in One Article: Two Routes for Agent Payments \- RootData, [https://www.rootdata.com/news/584290](https://www.rootdata.com/news/584290)  
23. What Is x402? The HTTP Payment Protocol for Agents \- Fireblocks, [https://www.fireblocks.com/glossary/x402](https://www.fireblocks.com/glossary/x402)  
24. Use MPP with x402 \- Machine Payments Protocol, [https://mpp.dev/guides/use-mpp-with-x402](https://mpp.dev/guides/use-mpp-with-x402)  
25. Agentic payments protocols compared: Which is best for your AI agents? (MPP, ACP, AP2, x402) \- Crossmint, [https://www.crossmint.com/learn/agentic-payments-protocols-compared](https://www.crossmint.com/learn/agentic-payments-protocols-compared)  
26. A Comprehensive Understanding of x402 and MPP: The Two Routes of Agent Payments | 链捕手ChainCatcher on Binance Square, [https://www.binance.com/en/square/post/304164006996706](https://www.binance.com/en/square/post/304164006996706)  
27. Building on Privy with Tempo's Machine Payments Protocol (MPP), [https://privy.io/blog/building-on-privy-with-tempo-machine-payments-protocol](https://privy.io/blog/building-on-privy-with-tempo-machine-payments-protocol)  
28. Agentic payments with x402 protocol | Platform \- Apify Documentation, [https://docs.apify.com/platform/integrations/x402](https://docs.apify.com/platform/integrations/x402)  
29. Inside x402: 100M Agentic Payments on Base \- Chainalysis, [https://www.chainalysis.com/blog/x402-agentic-payments-adoption/](https://www.chainalysis.com/blog/x402-agentic-payments-adoption/)  
30. x402 payments \- Stripe Documentation, [https://docs.stripe.com/payments/machine/x402](https://docs.stripe.com/payments/machine/x402)  
31. Paradigm | ETHGlobal, [https://ethglobal.com/showcase/paradigm-rsjym](https://ethglobal.com/showcase/paradigm-rsjym)  
32. KeeperHub \- GitHub, [https://github.com/KeeperHub/keeperhub](https://github.com/KeeperHub/keeperhub)  
33. Webhook Workflow | Vercel Academy, [https://vercel.com/academy/visual-workflow-builder-on-vercel/webhook-workflow](https://vercel.com/academy/visual-workflow-builder-on-vercel/webhook-workflow)  
34. KeeperHub \- ETHGlobal, [https://ethglobal.com/events/openagents/prizes/keeperhub](https://ethglobal.com/events/openagents/prizes/keeperhub)  
35. Open Agents \- ETHGlobal, [https://ethglobal.com/events/openagents/prizes](https://ethglobal.com/events/openagents/prizes)  
36. Edgent | ETHGlobal, [https://ethglobal.com/showcase/edgent-9qnxb](https://ethglobal.com/showcase/edgent-9qnxb)  
37. sbo3l\_mcp \- Rust \- Docs.rs, [https://docs.rs/sbo3l-mcp](https://docs.rs/sbo3l-mcp)

[image1]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAWCAYAAAChWZ5EAAABxklEQVR4Xu2VyytFURjFP3kk5ZUyIEyUJJIMREmhPEbKH3ANTWVAKHnMkEz8AcYmHnmVPAZigjIhj5QQA0WJKNZqn+Pu+517rk6G7qpf3b3OOvt85+69vyMSV1zRVaSNGGoBIVAAUkEpmAI9VoYaBTUgHeSADrBvB9JALVgAS/aFX8SJvxSXYgpylRglQwbdQDd4AMvgU4IVMAyuwQ04BuMg0w44egOnYrKLoDnyclgMBilgSMwS/KYLbfgpaAH8G0PajKJzbfgpaAEDYALMg11wANoiEkZXoA+sgxMwCzIiEo6CFtAPdiS87k3gQ7xr/Ao6nd/JYNPBo6AF5INs5XGjHSmvXI27xJwEj1gAT8NfxKXg5Hn6gqVGiVHAijZ9xLe/AzPK51/LyaudMY8mj3nxT0KkXmIUsKpNHzWImWRD+dyI9FkgteWM69yAmI3qW8CaNh2VgVZrnCum62VZXgp4BnuWNw16rTHFE+EpIAm8g219AUoAj2JuqrB89v0RMe2W90+CF1BpZQrBIShxxvxe3IM5N9AuplM9SbhPM8DmYe9w7g2+MT8mrvjgMXAGbsUsn12gqyoxx5X9gM9i/+C9cf1zfQOp62vxE4JtsAAAAABJRU5ErkJggg==>

[image2]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACEAAAAWCAYAAABOm/V6AAACi0lEQVR4Xu2VWahPURTGP2RO15RkqL9CyAN5MLy4iAciQyQPyoPc0r3y4gUlYx5IKQnpypSEyDx1zTKUKGQohKKURIS433fX3v+zzu4oiif3q9/prLXXOWfttfdeB2jUf6Bp5BTZTXomY1HNyQ7SwjsnkavkFrlPlpJmPoCqIhNIZ9KWjCCHyHAXU0nekPbh/j2pJp2yEAwmdWS182EMuUM6Bnsc+Um2liNMl4Lfcwz52Rwhm52tiswn+8lxchKW+GPSysWhFvbCOcFuQj6R78gSk+rIQ/KSXCbzSFM3Lj0jK5y9ngx1tnSUjE58WAVLYrrzfSY/YGWPOkdKzi7SK7Lc2WkSM8l2Z5elmXdx9kBYUmedT5JdSnypTpNNztYSxP3QgdxFvrqFqoA9+Jr0TsbOkAXkBLkJi+uXiwDGkxewD1aSfW5sG5nl7ELtIs9hO3pYMiZpk6m8cR+shCXbrRxhUskvkAPIKjwSlvRvS7P5RmoS/wDkN2Iv2LJtcL4itSS3kS1lD7IHtrw68r/URdjGLKpIlPqIkniUDiTSRl0Y7vXMPTIDdkTVmxo0BNZAvGphH1gXbGX8AfawlxL9mPi8+pMryBrfRPIFWUWn6NId1g++kq5hQFLLVRIbg70s2ItjANUm+NR4iqRTd54Mcr4l5K2z++iiD+tF72Avjboe/A2ZUpPJYeRbuZZKMWucz2suWZv4tDQ+ib7xRsdoJ6zfS2NhZVYL1mwklU9dUuWUFKsToP9Mu+Dz0qm4QVonfi2nliNOZmocUO9Xhk/IU/KALIL96bz04r2wOLVunXv9zIqk4z4qdcI2o56fHe6v5Yf/ntSmt6ROpxI5CDuB+nv/E6my6g2N+iPVA7M5gsoHGqSMAAAAAElFTkSuQmCC>

[image3]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAWCAYAAAChWZ5EAAABm0lEQVR4Xu2VyysGYRSHj6JkoaSwU5IUiSIlZSEhZaVQSmTjnmTt21j5C7CwtfoWIped5JayZIO1KNcIKX6n98x453wzzajZmV89NfOcmTPnm8v7ESVJ4p9SLULSC07BPjgCHd6ybzbAqC3yQBNYl2LUdINXUCH7deAFtLhHZKYLfIMJR/Akt2ATfNHfBjgHS8qtgQPlnOSAC1ID2Hmn6ANUkWk0qXxKfLHynFmwSjENMECm0aDyM+LblS8ic2caKaYB5sg06ld+XPyw8sugDdRTTAPMk2nUpzy/U+ynLVcL0rId2wApij7ALiiX7dAB+GuIkqBHMCZ+RPZ7wOJvOXyALS0DwhfmRkPKOy8hL0i54BjkW/XQAba1DEglmUb8adlZEF8CGsAjuLG4l/qzc4IdHmBHSwl/953K8UK0ohyvpofK2eFH4nsHssEH2NMFJAvckTmxxvK8FD+Batnn5fwTNLtHZIZfWu4z5Qhem6/AgxQYvlWXoMA5iMy7cQ0KLcfhhmfghMwvb/WW3ZSRuQ7/d/A13rzlJP8xP0feclMbWEqHAAAAAElFTkSuQmCC>

[image4]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFcAAAAXCAYAAAB+kNMAAAACIklEQVR4Xu2XTYhOURzGnwihxAIle2F8j82UZCwoOyuZpGwtJCuzZDfZUDJbMSufMyNlQUlSEmnS+ChJPkoy8pFJvp5n/ud6r6dM92Wm3lvnV7+69zzn3nr/nft/zwEymUwmk8lkmmETHaaf6E/6jj6i21J+k75M2Tf6hJ5IWcE8xDveIuZ9QLzjIX2MxvNyZ3rmf1lCN/pgq3IF8eOXe0B2IbIeD4xuxLw9HiDeq6J3eNAkq+kZep4utawlmYZYuU89SJxCFE2rfDyu0e90gQeJ63S+D1ZkHb2YXGNZS7MBUbzjHpApiM/9M51uWZmZdBTRRsocLV2fLl1XZT0dQKzUWhW14BCiuEWfLaPPWNllD4wtiHkHS2M7EIX5F4qinqWrLKsVt+gP+pw+M98jirZ/bObfOYKYpz+yIfom3e8rT6qAPn8V9RxdaVntmIvYBdzwIKHPXEVq88C4T0cQbUTMoi/ost8zqqH+fgc1X60F2xHFO+wBmU2/0tceGAsRK99bwD27r0o7vYTos9od1JZeRHE7PSBbEZlW03h0IeYdsPFFdt8s6ruDqHGRtf36Qmd4gNjXqmi7PTBOIuapX04GWsn99AJqtGPQJlxFuepBQp+18sUelFCPVdvQPnmqZRPNWsQqVpF13ZJsRhxXdWJS8T7SB4g2oALdxp9HVh1jj4092WAOvUtfoTFPR2ON6Tg8maygfXSvB5lMJpPJZCaAX1osfQzcBo5jAAAAAElFTkSuQmCC>

[image5]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAWCAYAAAChWZ5EAAABb0lEQVR4Xu2VOy8FQRiGP7dGonCJgkIrkShUotCLTuE/6AlKfoNGokQkOnFNNFoUEg2JS6hcIiJCSNze18w44z2X7Ca2sk/yJOe838zud87OzJrl5JSmQ4OE1MNWDT0tcB7uwX04CxviAZzcB1fgalxIQBMcgodwVGqkBu7COVjlvy/A7TBgBN7ANfhm6RrghS7NXezTSjcwbK7WFmWdPivixdI1EOi18g0swzvJ+C+8S/ZNFg2cwHMNwYMGJIsGnuCxhuBWA5JFAx/wSENwrQH56wa46pmnaoC7IS2hgTEtWPlHwJ1XBBvY0DABoYFxLZi7+YWGVmERbmqYgNDAhBbAEnyUrM4qnANbGnq64ICGntDApBascBC1R1mPz35RC1/hjhbMLSZuG07qlhrpN1eb0gKotsJRzM+8Dxf6zw8dhKfw3txF6JW5A6QxDDK3Ns5gc5RN++zZ3Dyebnze69EYwjmL8MA7Y+79k/PP+QKy2GL7/PGnLQAAAABJRU5ErkJggg==>

[image6]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAZCAYAAAB3oa15AAAB0UlEQVR4Xu2WyysFURzHf56JbFDEzkJWkshrIQp/gceerBQ2smJpZyVR7JCSBSmRhSyQR1mJklc2XiGRhdf315lTM7/M3DnXdVfnU5+68/1NM/M7d845Q2SxWOJBHkyTYQA5cBruwX04ATM9Z8SBBJgPe+A9LPeWfUmCu3CS1DX4eAauu0+KhkTYBlco3GhewCN4AL8pfAOtpM7n5jXFTtboykKTCjvhNhyCWd5yRAbIrIF5+CAy/hc+4ZjIA8mAfaQevNc5jgbTBk7huQzBM6lniQiP8CDcgh0wxVs2xrSBV3giQ3AHr2TopgCOwE3YQuqdjwWmDXzBYxmCG/goQ00dfINdshADTBrgVYfPNW6A4Rm+Bqdgkaj9Bd1AhSz44PcK3cJrGf5GDVyCc7BU1KJBN1ApCz7ww1/KkNQk3pFhECWkNpBFWCtqJugGqmTBBx64F5HxQsLXGBd5KApJrb+rsFnUwqAbqJYFkAzbSX1qaPRGxouKpszJmlyZMblwmNQ8SRe1IHhJ5pvXywLoJlVbcGW8+ulPCf7NTS6TGsCYEHZf4Bvyu/xB6iHf4Rmp3VzTAJ9gvytjsuEsPHQcJbNBs8QdnmAbITWdAxaL5R/5AbAvaDh5Wsz1AAAAAElFTkSuQmCC>

[image7]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABoAAAAZCAYAAAAv3j5gAAABRElEQVR4Xu2UTytEURiHX2VlJwuzs5sUTdlqahYWQ8oWpUSzQdM0ydps5kPIF7AWYSkhKUsrrDWz0CSFFL+3c0zn/enOzMmK7lPP4j7ndt47c/+IpPxVRjh0YR5ewzN4CaftsmUATsJ9eEBrnZiDLzDrjyfgMyy0zwhYgw14CD8kbtAt3KG2B8+p/eBVeh80Bj9hmXrN92HqhphBS+I2XKZe9b1I3RAzaEvchovUN3xfpW6IGbQtbsMF6nrPtVeoG2IG1eSXg/Tp64Wkv27d9xJ1gw464piADtANV6h/PwwdX1wddMwxgVFxG25Sr/ueoW7QQSccPfrezFDTF3aXmn5dLqgZ+uEbPOUF0Aeb4q40F3T9BLXguD/Wz9g7zLfPCJiF9/BJ3EbqI7yDg8F5eu8e4FDQFH3qbuCVuF8yZZdTUv41X2PDTaNmtoGcAAAAAElFTkSuQmCC>

[image8]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACUAAAAZCAYAAAC2JufVAAAB7ElEQVR4Xu2VTShlYRjHHxkbRWkWrNjIRzOjWAmxmDSGkilllBLZGElCKYrS7O00LG1m7SPGQj5CkxqbaUr5yE4sNImQ4v943nt67uPc456N1fnVr877f5973ufee877EkVEvA55NniBFrgLN+EOrIuffmIClsMM+BZ+gb/jKnxIhxVwDi6YuSAa4RUscONSeAlrvAqiVPjg46iqeUY3PIOL8J7CNfUP/jDZT7hlshu4D0/gPKyNnw6GP5xsU+9IvnGvycddnq2yQ3UdmjBNtZEs3m7yfpd/UtmBug5NmKaGSBZvNXmPyztVdgyH4Qr8C6dgppoPJExTYySLfzU5P6Oc96nsGja76zS46kzxKgII09Q4Jd/UB3XNdJDUNJncF26K38JkSPT3fXN5l8k1H0lqpu2EH9zUkg0TwM3wjflba2IPemwT/U6y5eR7FUTVJDVJ/Svc1LINE1BEcuMBk3MTnOe48ZobV8YKQL3LZlSWEG7qlw0dvC99NhlvnvbGfCpsq/EkHFRjht9EbkpvG768gbdw3U6QvCXnJDcqUTkfM//hezfmo+oOVnkVRLlwDxa6cTE8hbNehQ8NJDvuBcmiLH+IN7wsVcfP2hHJgarht+8PyQHLvxA/xJYyuEGyX/FaIyRnYkREREQQj9H7dJ4qIi9jAAAAAElFTkSuQmCC>

[image9]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADoAAAAZCAYAAABggz2wAAACPElEQVR4Xu2WTahNURiGX3/5HRDyk3JJkhKFUAb3GjExU8ToTigiExmIm6IMGCoyYcbtDtR1Q8kpIUmUkoFulwETyoD8hvf17X1b+zvbsfY9dxtoPfUMzvutszrfOnuvtYBEIpEA5tJJPoykwwcZ42gPfUzv0gG6NBzwrxhD59MD9C1dUyy3ZAJdRs/Q966Wc5o+odOyz3voGzp7eEQJXfQiXeULbTBEn9FH9CfiG11B39H79BX9UCz/ZgH9SncEmRZWjZ4IslKW00u0n3YWS21xGNUaDbmO8kb3wubUooQ0YIsbRQc9S2/TrbCVaoc6Gr0Am3Ohy6/SH3Syy1syh56i9+guOr5YjqaORq/B5pzn8t4sX+zyKKbTI/QB3U0nFst/pY5G9bRpTu3mIZezfKXLKzEFNtEQqh0VdTTaQE2NbqG36HlUfyzyRtf6QgRq9KMP8edH90qWL3F5S8bSbfQO7MzSmTgS8kbX+UIEavSTD8k52JyLXK7NSHnUZqTDuhu2CfXQmYVqdfJG1/tCBGr0sw9hlwPNudrluiE9d1kTWoX9sMEH6dRiecTkjW7wBdhOvh3N71qOGv3iQ9jT9Z3uDDL9QbqBnQyyJjbCXnD9k/rCaHIU1qhuX559sFqfL2RoX/iG8t+k10n3XJ0KQguqm9GM4REl6ILc7sXAc4O+hK28mtEjOEiPBWM2we6yh4JsFn1BX8O+JzVG2eZgnH7zcfqUPoTd6Pw7m/jv0UbRiPQm7PKQSCQSo8YvIe+EdCOUDkAAAAAASUVORK5CYII=>

[image10]: <data:image/png;base64,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>

[image11]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAAAaCAYAAABByvnlAAAEqklEQVR4Xu2YBailRRiGX7u7sbsDsTBXERUMFFtRUQwUG8XuFmtRbAwUFLuwW2xFsQNcA10U7G7fZ78Zzuy4Z/ecu5d7BeeBF87/zf/PmTPz1X+kRqPRaDQajcbQMYt1oPWE9aH1lvWytWcaP9faKH3uhfmsV63PrdGFfXPrHetL66bC3i/rW+vUxiHmRGuU9Z21/9hDEwebzgbdbq1lTZrsU1gXWs9av1jTJnuvTGJ9Yd1W2Zez/lY4wECYzPrKuqweGAY4CH7LCvXAQGDD+FF/WLtXYxkO5TPrgXqgB5ZRLHafyr5fsi9Z2XsFp+H5HeqBYYAoZ38GhdMVP+yIeqDiQeug2tgDhyjmX6iy36lIiwPlWOsva/Z6YIjJkXpNZR8Qq1l/Wh8pomB8EEUL10azq/WQIiU9bV1kTV2M36+oFyV8Fzn30soOc1tXKFLnvdZeivUtlsZvVcz3m/V9+vxkGstw71WKe2+x7lbn4DZVrPdda710H85GSp4n3ZNZWeE4RMBd1gGKulqyhgYxUm9WTHZoPdADk1s3KIr2nMmGt7xnXZyuOZifrAvSdYaN4Hu3rOyLWJ9Yx6VrDu4163drunyToo5Rz84pbJmtrZ+t7QrbGYrNnNJ6VFEfP7V+VGxojuJt8gOKxuMHa4N0vYD1q+LgSk5QOPVslX1AfKNYyEr1QA+crUgZy1d2PJsiDnRkzL9JZ3gMpEk8fIbCRi17SXGguaGA+6znimvI8+LtJYsrNu3ywrai9aK1lLWuwvlwIJ4/M92zlSJSpk/XdIffWlema8DZiMj8TOYZ/Xt9cLD6TGN4H4tiY/iy8bGTNX9xPYfih9epAl63vk6faZPx1mk6w2Oglaa1LtlMsZ7jCxtRSGrDw0vOUkRNeaBwvmKORxTRS7oiijioEqKH+4iOccEzjHOAmdWTbePCNrOiGTqpsGWWtZaojROCsMXLy3RQM6PiB+LBmS0UizuysAH5n/nI3fCGIj+XcJjcc3Rlz5vJD8+snWz1uw+RVKcOoAsklU2oHhJBZIdujviKIl2V4zQRdeokxbG+NQvbRHGKYsLt64EENYCCtmplJ1XwXF0DjlFEBO8Y8yruOUwRXfwg2DnZV1E8n9MZdYaDmipdw8kKDySVHK4osjMpcvZp6R6c4Lr0+Ubr4/S5hAgt2+sPFKm1G9RFUlEJ2SCnpusVh0XzkQ/2VEXjMKt1nqLB6buusFCKHC+EO6rjWUTDCOsORQGu4TmKLweaYWNp/7ZN17xBs/E8TxrK+Z6CzSZTJ+5RRAzkqMudzoaKdDVKkboeUzxD+slOxHpJTTgAMAdeTAHOkDbo1kak6wUVz/Me1A02tOwMyQQ4wdXWouo4AJmDdZFFHk62oxROQ/bh3r7BI/e1nldM8oIizfBewsTdIEdyHy0lB3ettXQxTkfDGJ5SdkMsks6JYr1LYQei4HHFfDQN5Pg3FamozN2XKNLKuKJ3b+spRdpE/MtQ1j/qwmhFBHeDtMTms0acZg9rN+vtdJ3noxN7X9Ea58aIv5/4S4e02viPwGHyl1DfKasx+FBP6DLn0tgdY2MYoa6MVLzoNhqNRqPR+D/xDxYmBlYKe146AAAAAElFTkSuQmCC>

[image12]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAcAAAAaCAYAAAB7GkaWAAAAfUlEQVR4XmNgGMrAHojfAHEgugQIeAPxSSBWR5cgD7gB8XYgvgnEnsgS0kC8BYiZgfgsEK9DlswGYhsgVgDif0CcjywJA61A/AOIhdAlWID4ORAvQZcAgWAg/g/EtkCsBMQtyJL9QPwEyp4NxNpIcgwmDBBvbADiEGSJkQAA9EAS9Xxtj/4AAAAASUVORK5CYII=>

[image13]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAaCAYAAADWm14/AAABl0lEQVR4Xu2USytGURSGV7kbkEsupYgwUH4BAyVzpcRPMMCQiZKJDJQSBsTczIgoSozcL0mRIqUMROR+eZe1P21vvuNSZHCeejp979prn++cvc8WCQkJeU8V3IQX8Nldd+CEP8hRLzbmCu7CLXjuslO4DffgLbyDldb2NabEJirngsck7IIJXjYj1lfqZfnwHmZ5WSBx8BIeccEjEy5Qlgiv4SHlyjoHQVSIPcUIFzyaYCNl1WJ9w5TrH5umLJBOsYkauOBRCOMp6xbr073hEwuLKQtkET7JN9bMsSzWp8vzY1LhA1zlwidkiN18hQserXCMQ6ZW7DX2cMHRBvM4BHUS3KeUwRIOmUGxiWq4AFLgPIeOIYne9y32xQ6OZC6AftjCoUP7bmASF0A67BX7bHWpoqKHhz7FHOU5cEDsBjoZozv8o74I7WJ76xgWUe0VPSLX4JnYRHrV3xvwAD66fDzSAHLFNqqOO3F1fXN6/Gpe8DZSJE3siF/ysj9nFDbLJ0vwW8SIvdVs2EG1P2MW9omdoCEh/4sXvZZYtKxFrpsAAAAASUVORK5CYII=>

[image14]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADMAAAAaCAYAAAAaAmTUAAACqUlEQVR4Xu2WS8hOURSGX5dcc09yyUAiA4WEgYQSA5KSooSBQn4DRmKihCIlI0UxcCmXKIVy+WXgkkQuEeVSiIE7GRDv27tO7bPzff/v/0bf3/fUW2etdc7eZ++91joHaNCgQYP2yBTqIfWZ+kO9px6HnlNfqRPUuOKBVtKFuky9pr5TvcvhEsuo4bmzFk7Dixmd+YdR5+FFaeH/yx3qRu5MmADPuzgPtJWO1AfqZR4I+lAfqet5oAX6U7+pzXkgYRO8mMF5oK1MhAfcnwcSmuF7qqVLziL4Ge1+JS5S93NnLWyEJ9XkldCp6J5RiU8nthVO0eNwjUxK4geob9Q+6gx1C04nbYjq9Bk85ju4Rnf5sdrQSygdBuSBoBNcM5q4R/i0qDfUHjhNxWzqZFyLV3BDGR/2dOoXNSbsmfCYc8OuGb3cT+p2HkiYCk9apIMW95R6RHUOn3JeC1kathqJnlketlBHlK8p7G3w4qqlrrJGG9Yq5sATaOBK7IXvWR32/LC1uKNwiqneZkRcrI171A0LVoRvTdg3Q9XQBozMnZXYDU+QvkjKEDjFlO/FKRQ1Nq246R8cgesgRQvXc2PhetOpbC/dUSMqxB9U1zxAelFX4Y/n0MS/Cn6pEYmvoKiPc3DRFyiVvlCnwp4HjzErsdfFtVAjUXO5BL9Hi+irqwEvZP6e1ELqBdw6B5WiXphOK/3Q9YW71oawt1D3qA7wiSoV71L9Ir4Snltj6/TPwvMK/T3sjOsn8KejIpOpB9QneED9ysiWVNRv4V3VblVCTaEZ3mn97hxG+Q+hO3UQ/nvQ6artpjusRcmvzTpEDUxi3cLWR1fNSXbdo82s9itUV+yAG1S74Bq1IHfWI2oC6rJpLdUdS+BOqE55JYvVHevhDncM5W9bg7riL6mQkh8zsSMNAAAAAElFTkSuQmCC>

[image15]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAZCAYAAAAIcL+IAAAAnUlEQVR4XmNgGAUIoAbET4G4BF0CHZgA8QUgdkaXoB1IAeJ1QHwTiLPR5OAgCog7oOzJQPwSSQ4FHABiNij7EBCfR0hhB05A/B+IA9Al0EELEP8DYiF0CXRwDIjPoQuiAx4g/g3E3egS6MCTAeI+D3QJEPAGYgsoewIQfwJiLoQ0AoBM2AbEukD8BYhzUKUR4AQDxAOHgTgUTW5IAQBAKBmkXjz29QAAAABJRU5ErkJggg==>

[image16]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEgAAAAaCAYAAAAUqxq7AAADOUlEQVR4Xu2XWahPURTGP2TOVKbwcKWU4UFRptQ1ZEh5MGeIeBTCgyEzmZJ5jJJ4oUQeRKEk4wNJMhWSoczzlOn7rHXcc1d38nLdP+dXX3fvtfb/3LP3WWvtvYGMjIyMjIx/hZ7Udeod9YN6Qd2kBrr/DPXQfV+p29RW9yU0gD3jGWzcG9gzblC3UPB7aZT/Juc4BptAu+ggY2G+VdERmAMbNyE6YM/VwnWLjlygKiyC7kSHswc2cUVbSZykvlGNo8M5RTWKxlygB2wBNkcHqQxLnfdUteBLU5P6BEvJNOtT7b2pdk6xGLZASd1Jo5SQ70h0BPrBxs1O2UZSh1P9nOUc9Z26T90LegWb+LRfI4tnNWycivNV6on3p6YH5SL1YbvT6ehwlDKaaPvoCFyhXsJSUtSiHlBtf48walCjg628GENVj8bSGAxbgCXRQWpTX6jH0RFoAovAmE6XQ1/o/6mYlzcNYXX0jxdoG2yBekUH6Q/zaRcrCUWExs0I9mahLzZQ86KxHNCHORGNZUFb+0cUvbI692ji46IjsBs2rmN0pMiD7WIfYJE23e06ZOojLYAt3gG3t6J2el/vcYga5j7RidpFrfMxSdrqvKWD7FJqOyzVd1B3qQveLjNtYBMrbmWVIvK3iI4UqjlKQZ2jqgRfRPUu/TH0W9W+od5fAVskoZ01j/rsf/WOyYdqCdtA6npf7a5u1wdXyleitnhbaC753i6V3rCrgU62WoC31DVYSmmSF1H4eqArQ/LiCXq5S9QjFIzTNUQ2RUVR6BiRPicNop7DJiMOUiO8rQPlEBTUq6T4C0XsJm8rQlRbVPwVTVqIRbCa2sXH6F31YTS2QrOSWu7t5rDU0aIILdJTtyvShCY839tpdL9Loq4PLHXEUWqKt9MMgB1lhJ5fYTkOi5oOsJoxi1rrPkWvorE17O4nFI353k5znuru7aQOCUXVZG8LHVRVHuZSa6g6sFpXYZkE2xFnel9b735qGewgqrvaRlgqKKVUWJU6kb7UPtikVQqGu127puwLXYou0Rl2E1AE13Pbf4Hq5WtU8LQpbybCjgVCZ5uzKV8GGQ8rxirwStemhbwZGX+dn/TquNUImaOmAAAAAElFTkSuQmCC>

[image17]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADwAAAAfCAYAAAC7xK7qAAACgElEQVR4Xu2YWahNURjH/0jGCJkeTGUoSR5MIYTc8kB50eXFdIuMKSTyYCZT4cFYJIVwUaYyPciUkOJBCuUqIi9K5v+/79vtfZbbMaTT2bf1q1+t/X3r3nPXWt9ae90DRCKRSCR/tKLz6XX6nD6m9+hMz2+hY72dezSod/QUHUrre7wh3UFv0k+0qcdzSz26m36l04JcggZdQy+GiTyyjv6gS8NEwCW6IAzmjYH0G30BW8ViqAq6hcG8cRy2uovCRF3lA2zA/cJEXUQlrMF+pg2CXMhk2ikM5pFX9DttFiYytKCXYad57lkNW+VJYcJpTI/RAZnYEnqeroS9n5PJUJXopN9MN9ApHtvmfWbRtfQE7QyjL91H19DDdLHH+9Pt9Kw/iwe0Xeb5n2hCr8AuHJVIT2oNYCStpiM8JvSBOuD2uMPpM1h//YHrvV8PupGO8z736XTPLYf17UhfIh38LTrR2/rZ3rAKFN3pe/ynKmtEZ9PbsA+4A3vnarVaZvoJTVBz+gg2EKEbWVv6Bbaaq+hC2I2stff/iHTb7IRN1lZ60mMaiCa9vT+3QVpBYgY95+2So0FoAJqohMGwFagNTcyNzLMmaypsYpOLTB/6FPY7tY3EXTrG2wfpCm+XnPH0WhDrQF8jLTlVRvIPhyrlgLeH0YewgV2gEzyuPX+EVtEuHtNVVhcd9VXpj/J4ydEAaruozIOV6jJXp7s4Tc/ADqa9sMkRg+hRugm20ldRuIr6HB1kh2DbpdibpKx4g3Rv/im96BBvz8WvFVW29ER60v4N++kuWDk/oaML0+VJV9gXCW/pnMLUb9HrSa8u7f2KIFe26ABLvkSIRCKRSKQIPwEblHIH72IZ+wAAAABJRU5ErkJggg==>

[image18]: <data:image/png;base64,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>

[image19]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEMAAAAfCAYAAAC8hnD/AAAC5ElEQVR4Xu2XaahNURTH/+Z5JkNJZqH4YooMmb6LhJBCkciQeSizZAoZk+kpQ4aSmVKGiJI5RSRSKCEk0//fWqd72vWuD+59973r/OrX22+vc+57Z529114XSEhISEhIyBa16GR6mT6nD+ltOtbja+gAH+c1euD39BjtTkv7fDm6kV6n32hln89LStFt9AcdE8QilJDX9GwYyDeW0990VhgIOEenhJP5RGf6k76Avf10aPU0DSfzicOwVTEtDPyPfIAlo2MYKCZMpW/pkDCQabQtlIjvtEwQCxlOG4eTRUBZ+ok2CgPZ4BX9RauEgRjV6UXYqVPUdKOPw8lssQS2OoaGAaciPUQ7BfMt6VY6n87zudG0AKlTqQm9EhvvoAfpHLqC7oWtzun0JJ1EV9EDdKDdhrl0i49r0rX0Kq3jc5voIB//M5XoJVizNQypE0WroDc9Tnv5XJwTtCttC+s91LnOphPpfr9mPD3q40W0IWxLtva583QELHnrYMkRavjuxK6J6oUSo4S8gb0M8ZJ28HFGqEAn0BuwbXMT1lPon6wRuy7OEVgC9eD1YZ9RFZbYwX6NYtEpVY/2h73ViPt0FK3m84oL3f8E9mI+w+4VWg096T3/vTn9iL/Xu6zSgLag4+gtutrnVVu+INWuP4P1MVFCF9JlPq4L63ib0fKwh4ruU+u/m/aAPbgSHX010N9a6mN1yxd8nDPOINWJ6uhTUkQrWPMm2sASo1WjmiBOw1aCWACrOaILLHGiNn0K2wYz6Wb/qeQJ1ZPoK4Nq2WIf5wxtqQ2wIqi9Hq8zqhFq71UjlLTtsAdR7B2sGOq+lUjdp4Reg33WTlhyRB/Ydo2SKfrSU7AV8hWpQluiaEcfhZOOuuDCTrM42oZRPWoPqyfpWoJii06WgnDSUdGOTod0jKQPfLwPVoNKHFrKOh3u0n5BbA+sz4l6iXTo9NhF19MZQazEoJOgsO41p8diQkJCQkJC5vgDhliHqRo/y68AAAAASUVORK5CYII=>

[image20]: <data:image/png;base64,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>

[image21]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACYAAAAZCAYAAABdEVzWAAACtElEQVR4Xu2WWaiNURTH/8icWWZ1SxQZn3ggFy8ic0kePPEkDx4MSZSpeJBkTroyRKZIZjKEUmae0L0pD4YHY0iG/7+19/nWt51zuA88nX/9unutvc737W/ttfa+QEUVldU0cpbsIz2TuajGZDdpkk6kGkAukMfkLllGGuUigHZkJ7lHHpAzZFAuAqgmL0nbMH5L5pEOWQiGkMtkjfMVVTfYi/oHuxk5RDYVIkxXyOww1qKvkU+kTyECOEG2OVuZmwt73inYxxwjT2DvKavVZEni60q+klbBriI/SV2wpYXBt9756shKZ2tuqLOlk2R04isq1cKRxNcC9tK4Bfr7jjwqRACLYTHrnO8FWeHsdGEzyC5nl9Uq2AtqSOvgm0MuxYCgNsin/zDsdyOc7xzZ4mxtX/w41ahKpn02XV7qnNewl9SSpeQO6e6DEo0n35DPljSOPIctopocdHNqnJnO/iupKz/CFidUwGrpVCPJfVjsHhSP0XapUVQenYJPv1P26qWW5DTZQbYjW5y6p5Sak4uwrVGjlFNTchvWQFIPsh92PCnzJVWDfMonkjewxU12/lTqLMX8KRNqhvlhrGPmIZkOq9cbpHOYy6kj+U4GJv5e5D3ZHGxldRIsU1FVsIX9QNY0qfqS68gO6wnkC2kY7ClkQRjn1A/2cHVcqgNkaxir5hS3MZtG7+AT/mSPagDr7MHOp8Z65Ww9Q03xm3RefYB1UyoVsApZigtblE1jbPCpGYpJR87axKdt9QvTrVF0YZJSqRaPB6GKdTnsPotboK/WHTgGlgnVx3nymQwPMV7qxlvIb72k2tJWxudORYmtjNIdqKLUAp+RDbBseg2D3X2KqSXHkd8mr71kVOqEfdBTMiuMb5IuuYh/KGVeR08pVZGj5CrsBPhv0v9YKoeKKqqovvoFRq2KDcGltUUAAAAASUVORK5CYII=>

[image22]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACYAAAAZCAYAAABdEVzWAAAChElEQVR4Xu2WS+hNURTGP+QVA488BtS/RAwUE1LKZYCIQiTJjJQMFJkwoTwiRJ6JlEfIMwkhlGdIJPJK8ogRJTHi+6y93XW2c47/Vf/Z+epXZ629zt37rL322heoVKlU08h5coD0Tcai2pJ9pF064DWP7MI/gqjWZBl5Qu6TC2RoJgKokY+kS3j+TBaS7vWQ3+9cIaucL1dryM8SBoW4tWQ9aRPskeQD6Rds6TTZ4WxlbgE5Ss6Sc+QEeU46uLhcHSbfySfyjrwNfCWnQkxn8gWWNa+dZLWzX5OVzt5AhjtbOkPGJL5c3YKl3kupv0t6BLs/LHuD/0SYlMUtztaHrXB2urCZZI+zS7U1dcBSP9bZncgP2NaNC76OsC0ZFYNgdbfN2dq+WF9dyUPSrT7cmGaTTakT2VrU5JfI4kwEMIG8gS2iBiuTqN1klrMbkn5Q9ZX3VaqvvagvTtkblokwabuukmOkZ/Apq8ref0v1cTJ1Bk0iL8l8WFa0uG9khA/KUXtyjzQFuw85SC6SicFXKjU9ncyl6QA1EHZKY/HrsByBLe5BDCqQPnZReFareURmwNrFDdIrjBVqPGyi6ekAtZkcT52wg6N34ulNpR54HfXep6yrNcW2M4UsCc+FWgebpJb4JWVnY+qEZVLv5H11K3KZDHE+3RzalSi1IR2KUqk4NUnaEKXl5DZsMq/R5Gnii5oL63Ne2la/sAFoxsJ0/2lh6f0nqRep4NVG4lWiensMK4FUOo13YL3OS7WlrYxbOxXN2Mrt5Bn+vgWi9E/hEHlPXsFqp+hq2Q/LZip91AsyJzzfJL0zES0olYL+rRSpCXaQrpHJ2aGWlf4+qXdVqlSpUf0CxnOAFlEEkLAAAAAASUVORK5CYII=>

[image23]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACoAAAAZCAYAAABHLbxYAAABy0lEQVR4Xu2VSyhEYRTHjwjJM2XhEVkoKVnIwkp55FEWFrK0tWUhoeSRDRYWs7eWlAgp8ihFiq1QSoiFIkUU/9O5M/PdY2b6boao+6vfYs755t5zv++ce4l8fP4nxToQg2bYDYtgKiyHM7DXWBNX0mAtXILLKheLMfihvCApPO70wDu4At/JW6Ej8BJewRM4AbPMBT/FC3krdJjk6H8dr4UOkX2hHTqgaCJpQSu8FjoIp+AC3IUHsNW1IswkSWtEopPkGok6EQ2vhQ7AHQr3ZQN8g42hFW4CcFTF2uEayVvDGq+FFsAcFePhOlaxIAlwDvY7v/mBtmB6aIUlXChP/3fgFuDXVL5OOPDxzsNZuAez3Wk7uNBVHYwC7+YNyQ1NNkkKrVZxE26RZ9inE7ZwodwvNtSRFLSh4jxQHOcHiUQNPISFcBF2udN2cKHrOuhQAVuM33kkXyHz6JLhI9w3YiaV8IikSCaFZCZ4oKxJgq9wWydIhuCeZKf4ZkH4u85TzH3H/5+GT7DKWBOkjGQnS1Sc3518KvUq/oU2eA4fKPy9voVn5J5o7l3ewVwjxgWOw1N4TdI25oOY8M6V6qBDBsn1M3XCx8fH5w/zCUqUWj+Z+xMpAAAAAElFTkSuQmCC>

[image24]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACUAAAAZCAYAAAC2JufVAAAB9klEQVR4Xu2Vz0sVURiGv6w2ghhZQiqts0AqCFzZ3Si4dSFtom0bN2lY0EY39QeEFARimAghLRIjEHQRFBolCJIoStaiH5RG1K7yfTln7j3z3ntGW9zdPPDAnfecOfPdmW/OmOXkVI+zcA6+gG9gPzyQmrE3tbBRQ88xOA4X4Wt4H9alZggn4Xd42R8fhSvwVnFGNpzfA5fhgIyRg3ABPjD3R3n8CM6Gk5QR+E6yq/AXrJdc4eJb5i7wzyoX1WturCnITvmsM8iKsPLPcErygrmTuOB+aLd4UY/hN8l4t/6YuyFltJhbbFTycz6/LXmMrKLW4aaG4Ad8qSG5YG4xNl7IGZ8/lDxGVlFsg1UNwVdzj76Mi+YWuyd5q8+fSB4jq6i/Vt6zhG2zrSEpWHWLYs8y/6+iYo/vtM+5t+yHpKjrOmDxx/cFftSQnDC32JjkSaPfkTxGUtSgDpgr6L2G5hr9lYYJn+BTybh/8CKXJI+RFHVDB8Ak/CnZYavcNkW4V6xJdg3+hkeCjG9kd3AckhR1UwestHk2B9l5n3UFWQruVTvwij8+Dj9Y+gJsWL7CXKgtyBM6zI0N6QCosdJnhr8PwWn4PJxUCVY+b+7kt7AvNep4BjdgQ5AN+4x3lUVxl2b/zARzCM+ZgEveu+Y+4Dk5OTlZ7AKxQnrR5XFuTQAAAABJRU5ErkJggg==>

[image25]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABUAAAAYCAYAAAAVibZIAAAAY0lEQVR4XmNgGAWjYPiCJHQBaoDtQCyGLkgpCATiDnRBaoCVQOyELogMlgHxETLwTSD+B8TNDFQCqgwQg43RJcgF7EB8FIgV0MQpArlAnIEuSCk4AMSc6IKUAhN0gVEwCiAAACBLE8KU5AMmAAAAAElFTkSuQmCC>