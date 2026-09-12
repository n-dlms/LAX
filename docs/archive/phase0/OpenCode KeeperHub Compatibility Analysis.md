# **Technical Evaluation of OpenCode and KeeperHub Integration: Architecture, Authentication, Skill Distribution, and Security Gating**

## **OpenCode MCP Connection and Configuration Mechanics**

Implementing on-chain agentic execution requires a robust understanding of the underlying transport mechanisms driving terminal-based developer agents. While Claude Code represents a vendor-locked ecosystem gated behind premium subscriptions, OpenCode has emerged as an open-source, model-flexible alternative capable of executing complex workflows across multiple model backends1. To establish a reliable integration with the KeeperHub on-chain execution layer, the transport capabilities of OpenCode must be mapped against established Claude Code configurations4.  
This evaluation confirms that OpenCode connects directly to remote Model Context Protocol (MCP) servers over HTTP and Server-Sent Events (SSE) transports6. The terminal runtime is not restricted to local stdio subprocesses6. It natively resolves remote endpoints such as https://app.keeperhub.com/mcp when the server definition is set to a remote configuration type6.  
Unlike Claude Code, which relies on interactive command-line operations (such as claude mcp add \--transport http) to provision and authorize external endpoints9, OpenCode uses a declarative, file-based configuration model6. The terminal runtime does not expose an exact command-line equivalent for dynamically registering remote transport configurations6. Instead, configurations must be written directly to the target settings files6. OpenCode manages these definitions across two primary locations:

* **Global Configuration:** Placed within the user's home profile at \~/.config/opencode/opencode.jsonc6.  
* **Project Configuration:** Placed directly inside the repository root at opencode.json or opencode.jsonc6.

Any project-level configurations parsed during initialization take immediate precedence over global configurations7. OpenCode does not utilize the .opencode.json or .opencode/mcp.json filenames for standard configuration; definitions must reside within the validated opencode.json or opencode.jsonc files to be recognized by the startup compiler6.

| Operational Parameter | Claude Code Framework | OpenCode Framework |
| :---- | :---- | :---- |
| **Primary Connection Types** | Stdio Subprocesses, HTTP/SSE9 | Stdio Subprocesses, HTTP/SSE6 |
| **Default Remote Transport Path** | https://app.keeperhub.com/mcp \[cite: 9\] | https://app.keeperhub.com/mcp \[cite: 6\] |
| **CLI Registration Command** | claude mcp add \--transport http ... \[cite: 9\] | No direct remote CLI command; manual edit required6 |
| **Configuration File Path** | \~/.claude.json / Vendor-managed paths | opencode.json (Project), \~/.config/opencode/opencode.jsonc (Global)6 |
| **Concurrent Server Support** | Yes (multi-transport array)9 | Yes (consecutive blocks inside "mcp" key)6 |
| **Configuration Schema Type** | Stdio client commands, HTTP headers9 | Declarative JSON configuration blocks6 |

OpenCode permits the concurrent execution of multiple local and remote MCP servers6. The core configuration engine reads the "mcp" block on startup, instantiates isolated client transport instances for each configured server, and aggregates their exposed tools into the language model's active context window6.  
Developers must exercise caution when working with project-level files10. Because OpenCode automatically executes command strings associated with local-type MCP definitions upon entering a workspace, unchecked repository configurations can lead to arbitrary code execution10. Remote HTTP configurations bypass this local command execution path, making them the preferred transport option for shared workspaces6.

## **Bearer Token Authentication and API Key Storage**

Securing communications between autonomous developer agents and on-chain infrastructure is critical11. KeeperHub requires static, scoped API keys containing a kh\_ prefix, transmitted over standard TLS paths to authorize on-chain transactions4. OpenCode natively supports passing custom authorization headers to remote MCP servers6.  
The configuration engine evaluates the "headers" parameter defined within any remote MCP server block6. This allows the agent to construct and attach the required authorization headers for every outgoing HTTP request6:

JSON  
{  
  "mcp": {  
    "keeperhub": {  
      "type": "remote",  
      "url": "https://app.keeperhub.com/mcp",  
      "enabled": true,  
      "headers": {  
        "Authorization": "Bearer {env:KEEPERHUB\_API\_KEY}"  
      }  
    }  
  }  
}

To prevent hardcoding sensitive credentials in version-controlled files, OpenCode supports dynamic environment variable referencing6. By structuring the header value as {env:KEEPERHUB\_API\_KEY}, OpenCode dynamically injects the token from the active shell environment at runtime6. This ensures that the configuration remains shareable across teams without exposing private production keys7.

| Security Parameter | Hardcoded Key Pattern | Dynamic Environment Key Pattern |
| :---- | :---- | :---- |
| **Header Configuration** | "Authorization": "Bearer kh\_prod\_..." \[cite: 6\] | "Authorization": "Bearer {env:KEEPERHUB\_API\_KEY}" \[cite: 6\] |
| **File Safety** | High risk of leakage in git history7. | Secure; key remains in active memory6. |
| **Deployment Suitability** | Local scratchpad testing only. | Production workspaces, multi-user environments7. |
| **Token Lifetime** | Static until revoked12. | Configurable via shell session lifetimes. |

For interactive, user-facing integrations, OpenCode also includes an automatic OAuth-driven authentication subsystem6. If a remote server returns an HTTP 401 Unauthorized status code, OpenCode detects the response, initiates a dynamic client registration process, and prompts the user to authenticate via an external browser session6. Once completed, OpenCode writes the retrieved session credentials directly to a dedicated, secure local file:  
![][image1]  
This storage architecture separates runtime workflow configurations from sensitive session tokens, maintaining clear isolation across local development workspaces6.

## **Skill Distribution and Directory Auto-Discovery**

To streamline developer workflows, on-chain execution instructions are bundled as reusable procedural files known as skills13. The KeeperHub agentic wallet distributes these capabilities via the @keeperhub/wallet package15. When initializing the tool via npx \-p @keeperhub/wallet keeperhub-wallet skill install, the package maps its capabilities to local agent runtimes16.  
The installation utility probes the filesystem to locate active agent directories16. The auto-discovery loop scans several hardcoded directory paths:  
![][image2]  
During installation, the utility copies the required SKILL.md file and registers the keeperhub-wallet-hook PreToolUse safety hook inside the identified directories16. The script does not natively target OpenCode-specific directories (such as .opencode/skills/ or \~/.config/opencode/skills/)13. However, OpenCode is architected to be fully backward-compatible with Claude Code skill structures3.  
On startup, OpenCode executes a comprehensive discovery loop across multiple local and global directories to find available skill sets13. This cross-compatibility ensures that skills written to Claude-compatible directories are automatically loaded by the OpenCode runtime13.

| Discovery Priority | Target Scope | Evaluated Search Path |
| :---- | :---- | :---- |
| **Priority 1** | Project-Specific OpenCode | .opencode/skills/\<name\>/SKILL.md \[cite: 13\] |
| **Priority 2** | Global Profile OpenCode | \~/.config/opencode/skills/\<name\>/SKILL.md \[cite: 13, 18\] |
| **Priority 3** | Project-Specific Claude | .claude/skills/\<name\>/SKILL.md \[cite: 13, 19\] |
| **Priority 4** | Global Profile Claude | \~/.claude/skills/\<name\>/SKILL.md \[cite: 13, 19\] |
| **Priority 5** | Project-Specific Generic | .agents/skills/\<name\>/SKILL.md \[cite: 13, 17\] |
| **Priority 6** | Global Profile Generic | \~/.agents/skills/\<name\>/SKILL.md \[cite: 13, 17\] |

Because OpenCode resolves project-level and global .claude/skills/ directories, any skills installed by the @keeperhub/wallet utility are instantly visible to OpenCode13.  
If the auto-discovery script fails to run or if a developer wants to maintain a separate OpenCode-specific configuration, the skill can be installed manually18. This is done by creating the target directory structure and creating a symbolic link or copying the files directly:

Bash  
\# Verify the existence of the global OpenCode skill path  
mkdir \-p \~/.config/opencode/skills/keeperhub-wallet

\# Create a symbolic link pointing to the keeperhub-wallet skill directory  
ln \-s \~/.claude/skills/keeperhub-wallet/SKILL.md \~/.config/opencode/skills/keeperhub-wallet/SKILL.md

Once linked, the skill is registered on startup and exposed to the central language model via the built-in skill tool13.

## **Interception Frameworks and the PreToolUse Hook Workaround**

Automated agentic wallets present an appealing target for exploitation11. If an agent operates without strict safety guardrails, prompt injections or untrusted local codebase inputs can trigger unauthorized or malicious transaction signing10. Claude Code mitigates this risk by executing the PreToolUse lifecycle hook16. This hook reads a local configuration file at \~/.keeperhub/safety.json and evaluates every transaction payload against defined rules before signing16.  
OpenCode does not natively implement a direct equivalent to the PreToolUse hook parameter3. To secure the environment, developers must implement alternative security mechanisms.

### **Evaluation of Gating Workarounds**

* **Option A: System Prompt Gating (Weaker Security):** Handled entirely through prompt engineering. This approach is highly vulnerable to jailbreaking and prompt injection, as the core language model can be coerced into ignoring its system instructions11.  
* **Option B: Thin Proxy Wrapper (Moderate Security):** Routing MCP requests through an intermediate local HTTP proxy allows external validation12. However, this adds network transport latency and complicates local setups by requiring an additional running process.  
* **Option C: AgentCash Transition (Low Security):** Migrating to AgentCash avoids the need for validation hooks but relies on storing plaintext private keys directly within the agent's workspace files, presenting an unacceptable risk of key leakage11.  
* **Option D: Native OpenCode Plugin (Optimal Security):** Utilizing OpenCode's built-in plugin architecture22. The runtime supports intercepting tool calls using tool.execute.before and tool.execute.after hooks22. A custom plugin can intercept, inspect, and gate outgoing wallet calls before they reach the remote MCP server21.

For secure, production-grade deployments, implementing a native OpenCode plugin (Option D) is the recommended approach21. When writing validation plugins, mutating the incoming arguments array inside tool.execute.before to make commands "safe" is considered an anti-pattern, as OpenCode ignores these inline modifications21. To successfully block a transaction, the plugin must throw an explicit runtime error21. This immediately halts execution and alerts the user in the terminal21.

TypeScript  
// .opencode/plugins/keeperhub-safety-interceptor.ts  
import { type Plugin } from "@opencode-ai/plugin";  
import { promises as fs } from "fs";  
import \* as path from "path";  
import os from "os";

interface SafetyManifest {  
  allowedTargets: string\[\];  
  maxTransactionValueEth: number;  
}

export const KeeperHubSafetyInterceptor: Plugin \= async (context) \=\> {  
  return {  
    "tool.execute.before": async (input) \=\> {  
      // Intercept KeeperHub execute\_transfer or generic writing actions  
      if (  
        input.tool \=== "keeperhub\_execute\_transfer" ||  
        input.tool \=== "mcp\_\_keeperhub\_\_execute\_transfer"  
      ) {  
        const safetyPath \= path.join(os.homedir(), ".keeperhub", "safety.json");  
          
        try {  
          const configContent \= await fs.readFile(safetyPath, "utf-8");  
          const config: SafetyManifest \= JSON.parse(configContent);  
            
          const targetAddress \= input.args.recipient\_address;  
          const transferValue \= parseFloat(input.args.amount);

          // Verify target against safety allowlist  
          const isAllowed \= config.allowedTargets.some(  
            (addr) \=\> addr.toLowerCase() \=== targetAddress.toLowerCase()  
          );

          if (\!isAllowed) {  
            throw new Error(  
              \`\[SAFETY SHIELD\] Blocked transaction to unauthorized address: ${targetAddress}\`  
            );  
          }

          // Verify value limits  
          if (transferValue \> config.maxTransactionValueEth) {  
            throw new Error(  
              \`\[SAFETY SHIELD\] Transaction value ${transferValue} ETH exceeds limit of ${config.maxTransactionValueEth} ETH\`  
            );  
          }

        } catch (err: any) {  
          if (err.code \=== "ENOENT") {  
            throw new Error(  
              "\[SAFETY ERROR\] Safety configuration file (\~/.keeperhub/safety.json) not found. Transaction aborted."  
            );  
          }  
          throw err;  
        }  
      }  
    }  
  };  
};

This safety plugin must be registered within the active opencode.json configuration file, ensuring it loads and runs during terminal initialization7:

JSON  
{  
  "plugin": \[  
    ".opencode/plugins/keeperhub-safety-interceptor.ts"  
  \]  
}

## **Per-Workflow MCP Registration and Multi-Round Fallbacks**

KeeperHub allows developers to deploy targeted, isolated workflows accessible via dedicated URLs:  
![][image3]  
OpenCode supports registering these endpoints directly, enabling fine-grained, workflow-specific tool integration6.

Single-Round Execution Pathway (Workflow Specific):  
┌──────────────┐          Direct HTTP/SSE Call           ┌───────────────────┐  
│              │────────────────────────────────────────\>│  Target Workflow  │  
│   OpenCode   │  (Executes immediately on endpoint)     │   \`/mcp/w/slug\`   │  
│   Terminal   │\<────────────────────────────────────────│    Destination    │  
│              │         Response in 1 Round             └───────────────────┘  
└──────────────┘

Multi-Round Fallback Pathway (Aggregate Base):  
┌──────────────┐          1\. Query Available Tools       ┌───────────────────┐  
│              │────────────────────────────────────────\>│   Aggregate MCP   │  
│              │\<────────────────────────────────────────│      Server       │  
│   OpenCode   │        2\. Discovered Tool Metadata      │     \`/mcp\`        │  
│   Terminal   │                                         └───────────────────┘  
│              │          3\. Invoke call\_workflow()                │  
│              │───────────────────────────────────────────────────┘  
└──────────────┘

For performance-critical actions, registering a workflow-specific MCP server directly inside opencode.json is highly effective6. This approach reduces network latency by connecting directly to the target workflow's schema6.

JSON  
{  
  "mcp": {  
    "direct-uniswap-swap": {  
      "type": "remote",  
      "url": "https://app.keeperhub.com/mcp/w/uniswap-swap-route",  
      "enabled": true,  
      "headers": {  
        "Authorization": "Bearer {env:KEEPERHUB\_API\_KEY}"  
      }  
    }  
  }  
}

If direct workflow registration is not feasible due to dynamic provisioning requirements, developers can use KeeperHub's aggregate MCP server as a fallback9. This base endpoint exposes a generic call\_workflow tool, allowing the agent to orchestrate executions across different workflows from a single connection12.

| Performance and Operational Metric | Single-Round Direct Path | Multi-Round Aggregate Path |
| :---- | :---- | :---- |
| **Endpoint Target Pattern** | https://app.keeperhub.com/mcp/w/\<slug\> \[cite: 15\] | https://app.keeperhub.com/mcp \[cite: 9, 12\] |
| **Integration Latency** | **![][image4]** (Optimal single-round path) | ![][image5] (Query step \+ Invoke step) |
| **Context Window Size** | Low (only loads the target workflow schema)6. | High (loads all tools inside the organization)6. |
| **Configuration Model** | File edits required for every new workflow6. | Single setup; dynamically queries workflows12. |
| **Failure Recovery** | Isolated; failures do not impact adjacent workflows. | Centralized; connection issues affect all workflows12. |

While the multi-round aggregate pathway requires additional steps, it provides high flexibility12. The core agent can dynamically query, select, and run workflows using runtime parameters, removing the need to manually update local configuration files as new on-chain workflows are deployed9.

## **Synthesis and Strategic Recommendations**

This evaluation demonstrates that OpenCode is a robust, highly compatible alternative to Claude Code for running KeeperHub on-chain workflows1. The terminal runtime successfully supports remote HTTP transports, environment variable injection, and standard skill discovery pathways6.  
To implement a secure and high-performing setup, the following practices are recommended:

* **Use Environment Variable Referencing:** Always inject API keys into opencode.json headers via {env:KEEPERHUB\_API\_KEY} references6. Avoid hardcoding sensitive keys in project files to prevent accidental leakage in shared repositories7.  
* **Implement a Local Safety Gate:** Deploy an OpenCode plugin utilizing the tool.execute.before hook21. This plugin should read rules from \~/.keeperhub/safety.json and block unauthorized transactions by throwing explicit errors16.  
* **Leverage Claude-Compatible Paths for Skills:** Store custom and automated wallet instructions in .claude/skills/ or .opencode/skills/ directories13. This takes advantage of OpenCode’s native discovery engine and ensures seamless cross-platform compatibility13.  
* **Balance Latency against Operational Flexibility:** For high-frequency transactions, configure direct per-workflow remote endpoints in opencode.json to minimize execution overhead6. For complex, multi-step tasks, use the aggregate MCP's call\_workflow tool to simplify key management and system maintenance9.

#### **Works cited**

1. Best CLI AI Tools in 2026: CLI Coding Agents Compared \- Kilo Code, [https://kilo.ai/articles/best-cli-coding-agents](https://kilo.ai/articles/best-cli-coding-agents)  
2. Deploy OpenCode CLI \+ Web App \- Railway, [https://railway.com/deploy/opencode-cli-web-app](https://railway.com/deploy/opencode-cli-web-app)  
3. OpenCode Skills: How to Use SKILL.md with the Open-Source Alternative (2026) \- Agensi, [https://www.agensi.io/learn/opencode-skills-guide](https://www.agensi.io/learn/opencode-skills-guide)  
4. KeeperHub \- ETHGlobal, [https://ethglobal.com/events/openagents/prizes/keeperhub](https://ethglobal.com/events/openagents/prizes/keeperhub)  
5. KeeperHub \- The execution layer for onchain agents, [https://keeperhub.com/](https://keeperhub.com/)  
6. MCP servers \- OpenCode, [https://opencode.ai/docs/mcp-servers/](https://opencode.ai/docs/mcp-servers/)  
7. OpenCode | Products \- Documentation \- IONOS, [https://docs.ionos.com/cloud/ai/mcp-server/connect-to-an-ai-client/opencode](https://docs.ionos.com/cloud/ai/mcp-server/connect-to-an-ai-client/opencode)  
8. OpenCode \+ Cloudflare · Agent setup docs, [https://developers.cloudflare.com/agent-setup/opencode/](https://developers.cloudflare.com/agent-setup/opencode/)  
9. KeeperHub \- GitHub, [https://github.com/KeeperHub/keeperhub](https://github.com/KeeperHub/keeperhub)  
10. The repository that runs code: A story about MCP Configuration in OpenCode, [https://dev.to/pachilo/the-repository-that-runs-code-a-story-about-mcp-configuration-in-opencode-ljp](https://dev.to/pachilo/the-repository-that-runs-code-a-story-about-mcp-configuration-in-opencode-ljp)  
11. How We Sign Your Transactions Without Holding Your Keys \- KeeperHub, [https://keeperhub.com/blog/009-turnkey-signer-integration](https://keeperhub.com/blog/009-turnkey-signer-integration)  
12. KeeperHub MCP: Blockchain Automated Workflow MCP Tool with Natural Language Operation Support, [https://mcp.aibase.com/server/1639703010877907351](https://mcp.aibase.com/server/1639703010877907351)  
13. Agent Skills | OpenCode, [https://opencode.ai/docs/skills/](https://opencode.ai/docs/skills/)  
14. The Agent Skills Directory, [https://www.skills.sh/](https://www.skills.sh/)  
15. KeeperHub \- GitHub, [https://github.com/KeeperHub](https://github.com/KeeperHub)  
16. @keeperhub/wallet \- npm, [https://www.npmjs.com/package/@keeperhub/wallet](https://www.npmjs.com/package/@keeperhub/wallet)  
17. 10 Best OpenCode Skills That Are Actually Useful in 2026 \- Composio, [https://composio.dev/content/10-best-opencode-skills-that-are-actually-useful-in-2026](https://composio.dev/content/10-best-opencode-skills-that-are-actually-useful-in-2026)  
18. skills/.opencode/INSTALL.md at main · MiniMax-AI/skills · GitHub, [https://github.com/MiniMax-AI/skills/blob/main/.opencode/INSTALL.md](https://github.com/MiniMax-AI/skills/blob/main/.opencode/INSTALL.md)  
19. Installing Skills \- Skills Directory Docs, [https://www.skillsdirectory.com/docs/installing-skills](https://www.skillsdirectory.com/docs/installing-skills)  
20. openCode as a general assistant : r/opencodeCLI \- Reddit, [https://www.reddit.com/r/opencodeCLI/comments/1swbbiw/opencode\_as\_a\_general\_assistant/](https://www.reddit.com/r/opencodeCLI/comments/1swbbiw/opencode_as_a_general_assistant/)  
21. opencode-build-plugins | Skills Mark... \- LobeHub, [https://lobehub.com/de/skills/pantheon-org-tekhne-build-plugins](https://lobehub.com/de/skills/pantheon-org-tekhne-build-plugins)  
22. Plugins \- OpenCode, [https://opencode.ai/docs/plugins/](https://opencode.ai/docs/plugins/)  
23. Plugins \- Extend OpenCode, [https://open-code.ai/en/docs/plugins](https://open-code.ai/en/docs/plugins)  
24. OpenCode Plugin \- rehydra.ai, [https://docs.rehydra.ai/guides/opencode-plugin](https://docs.rehydra.ai/guides/opencode-plugin)

[image1]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAjAAAABOCAYAAAA+Riz3AAAU7ElEQVR4Xu2dCbRlR1WGt5gIDihBRJEgTQyIJMEBFAekG4hBJGoQxZEQF9EEjbDQgAZRXmRKIIganEDIg0RligJLURHxRUhUJOAQQRHtICEiIhgRRxzq6107d9/qc+6p+/rlDbf/b61afU+dc8+pU7Vr11+76r42E0IIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGE2FW8pKRPbTP3MCeV9PQ2c4+zam20WaiDT28zN8l3l/TQNlOI3cKtS7q4pPeU9Oclvamkry3pW0o6N123l/mqkv6vJt7z3SXdVI//rR7/XUn/XfPOOvStPk4t6aklXVrSA5pz28kHS/pPm73nv5T04ZL+taR/KulXSzr55qu3htNs9rw3NOdWCQaEN7aZiTuX9MMlXVLSk5pz28X9SvrRkn6qpDOac0M8s6SHtJkDcF208VOac7uJqTY6Gvimkv7LvK2uaM5tFupUonCYa2zWN+7fnOvlTHNfzXgrNsErSnpdSbetx8ebGy2Vel5ctMfBod9Y0r1SHu+G4SE8gs8u6c9KOj/lTcG9f8v8Xmc357abO5qX4+9L+riUzwD7GnPnhujYDA8zv3/m483rjOetsoDByTyhzUycUNJzS/pYSRvzp7aNB5n3Zdp/bf7UIG8p6Zg2c4BPMBfmu13ATLXR0cJnmE9atkLA3LWkV7eZRyGfXNIj20zz/CfbkQmYnzT/PhMFsST3Na+8PLDDcSV9yFZHwDympB9v8h5r/u4YUAZHeFGTNwWRjd0gYD7FvBzXN/mAY+PcP1jfwNXymzYewbnOVlvA/Ia5sJ/iWts5AQNMQnoEDNGaF7SZC7iD7X4B09tGRwPvs60RMD9U0re3mUch9JdXtZkVol5HImCIbnEPxJBYEpaIqPw7tScKv2CrI2AI6z+iyRsTMF9Y0gubvCk+z3a/gIFYNtvfnpggBO2YgCFqtaoChsH7d9vMEf7YdlbA4AR7BMzzzCM2vdzedreAWaaNjgZusK0RMFeb+5SjnTUbFzDfaEcmYMQRgLqm8i9sTxQeZdu3B+ZWJX1im7mFXFDSfZq8MQFDpGKZ2SmcaFsrYKiPzTAlYP7d/PyBJn8RbAa80vx7YwLm7ba6Auackr6vzRzhD21nBcxtbFrAYFtvM1/+6+XTbHcLmGXaaDvIy7c7wVYIGCZlr2wzK5v1T3uBPBbRjl9jvk9yTMB8g+1uAbPKbXVocGKvCw3w2yU9vqRT5q6Yh+WVmGWyhk7oK8Nei5eV9Nfm6v33S/qKei5veMIogE2Pkff0mscG4neab0plQyId8W9LWq/ngY3HXP+nJf1eSb9T0hek8z2MCZgWRAH7G/6kpD8wf3c2BWdaAXNZPY6UN/eO1eGXl/Q35lESHMfX1X//yHxz9ZfW6xaxSMDczfzc+0s6tuYdY/5uzF5fb74E8gzzfQ/BX5ivqfNdNgXTLi9P5+Gt5gKGWT17bagr8ohm7XV4r89sM0cYEjA99gM4QPaeUd9cx96DiIz2tBP0CJgDJT2/ySPC8iLztsMP8G8WpGFXCJjzzJdr3l2vu126rqecP2azTfTfb740eWNJ35uu4b1/2fz7bzbv+0wsxhhrI/Ym0Ye4Dwm7/Zx0nr1/DPb/Yd4v2ei+UdIHzJeReZ8MSwm8G76Nfsmm6ehLv2S+F4x9Zl9p7ruoH34cQH23omaRr4Reu8Ff8m6U50rzXw0NLSEtW6drNu/fx/wTPgx/TdnuUdLl5nsCea9vPvTNecbs/LNKeof5Ejc/tGACjW3w/tzr0Xy5A+6F2OC72AW+lrbN9I5FPBN/97/mP5DgMylPhk83/85p5u3FMyn/s9M1YzzNZs9cT/knl/Rr5vazYd6ulC/Alhi/8LG8C21KuwePM7c7hBd9jBUI6uSvzPs3EcuVgRBY/vUK6V12+GZPNsjhaPbVYwyRhn1wPWYzJ4MjS0/M7nCKdGZEBtzW3DCy0eDY9te8MBquo7NQJgZOro1NsixlAEaPIwml/CPmSxzLNEwsny0SMAglBiXeKZQszukjNnsHCAETRoRgIdrxRJvf+LqoDj+ppC827yAY30/bzOlRBox1ihhorm/yaRucNQZ9asqPug9nR90jlvg5aoZBi+voWENQNt4LR03bU24cB051CjoqTqo3ne9f2zS0aaYdWDLUGx2+l1bA9NoPn+kr31mPGRyobwZB6G2nHgHz83b4bPHF5sIi4PnXpeNsVwwsQF9j4L+4HkNPOREaMXlgoOWYvkLbAn6DCcuz6jH2xGDEAD/EWBvdvaR/LOk7Ut4Pmtvp8fUYUc+7Uxb6R/gX+iO/SMwiAJ9E/4l2o19TfgYhuEtJzzG/FxEuIhjA9eQx0AVTvrLXbhAIlDMLjfBruezL1ikgTHJUfMo/IUrpy7Q5UBe0axzDIjtHLJ5kbgfkUa8RJcQ2ycuD9BhPNb/27HrM/k7K8V03X9E/FgW8MwJgiBAwtF34x3ivh8ZFI/BMRDblW0/5tBVjSIB4yZMOxix8LpFRwJ4QJ1FuAhPYBmU4aLNfOGEH2DD3WymoRBwRg87/mL84AiJm/XRWnNVF9Tjg+mjYl9m8wWKQzEr4eWnAPpRsNHC7mtcazQ3mnQJwBsw0IEJ2+R48EyHAQNtLdPRFAoYZJ/fFIDLMZHBeMRhmAUNdMXBnA4SeOgQcPkaWncfPmbfLFDHQ4NRiwKdjMYO5rKTPn116iGPNOzrlDy40f1Z+PvXKfaODttCZKDNOLugt83ZyhrmNvtN8YCNqhzgeW05BcIYj7AFHvpGOe+yHZ7/XfBYe7DMvVzjA3na6jXk7raW8DH2SwbUVbdRHG5UhGhGEXV2V8oDvvTEd95Yz+ssv1uMH2ixax/6cj9n8psaH2bj9jbURM+EQRQFigLrO/Y3ID/eO5weX1/zwgdQb7ZthkP5gOg7/tpbyEGjkZYE45St77IZEtAI7aWHid0U6XrZOv8gOj+AEY/6Je+UI0bfVPIQX9Ng5vKKkf07HQLtdby5I8zsMQSQHPxyDO2C3RHsyy4xFtHG2mczp5t/BzoOhNl8E7bheP8d3c/TqFJv9CIU65jy+LPM95jZz73qM7XDdRlxQafvsykEjxkzitTUPxcwxypBOHImB8dfNlSSd5tp6/RhD4mPMaG4wD6G14PS4HueUy8KsgEhMLz0C5h3mM7aWmBGcWo/DIeN4mLn+TM3PTNVhwHu19Xip+XdjNjZGDDTZqU6BI3qMeVTrTeaOgnvkyFGPgNlsmbcLHB+bjb/V3L4/at7h88yshfpg1tJLK2B67IdlAz4/d+6Kw+lppykBQ7+7pM00H6z43ntKeqkd/jcpwq7aMjKYtbP4nnJGf0F8tDBpYZae+wi2hT94ULouGGojnsX9GfBbcN7cP8Q2jp9rWwGDnZBPnz6+fqZf5XLR1xmUYzBnUOE6ZuBBDCQxAPX4yh67OVA/Dy1VtAJm2Tq9yOYjRplF/imLi0fWvLh/r53TZq2AASKHfP/+5u2BDeWE7QdEJC4w31qAfbD0TZ1mlhmLegTMojafIgsYhB79kO+/3Xxi8WX1HPxsPXePlAdMmHPZ413a+h7qs3uWry/pS9rMCoMSah9wNFQGynaIO5uf32jyW0L19xgNnetXmjxA1HD93dsTS3Ku+X0WCZibzI2phZkS343BLxwy+4mIvhBpacs3VYcBzgEHkyHEyncx7kUsK2Do6Bg069HMlJiZs67PPZgJBD0CZrNl3k5ixgus/98zHbfczeaFZQ/UwUY67rEfIkF8XssXNPS2E0580b1eYsP9ndkqAx5RAb5PiugIhF0xsGWI7jFABL3ljP5yTsoLqLPwO1OMtRERBO7P+7Yw4+cc34Wz63ErYBh4yWcZJ+5HlGQRDGJcl/3bcTXvafW4x1f22E1EOIZm+a2AWaZOgWgTQmuIRf7pmJTHshZ5D67HPXYOlHtIwCAG+D7vjb/hc04IG9hv/oc7Wc46oeax3YDIQ2aZsahHwCxq8ymygIGTzEUGEyzuQ/Ts0fVcjH9hvwEih/yweXwdx1N9dk9zvvkmnyFeYL5pCx5uXhljEQ5mICw5tSq3hVAh94nlIAi12hoNAiZ3wiA6S4QmN0uPgMERD4mBZ9i80YZD5p6EMOmAqP/MVB0GRyIGlhUw6+bX54E8ZnkMOPeteRFmj/Dk5Ta/XMRMYbNlxjHwzr3pB/xrtzgMFkTNlqEVMD32g4PnMzOrMdatr50WCRiWHNqZc8A+OOAaZsqvM78PjhQQOBxPOcN16ytn9BfEQwv3ZAIwZTcw1kaIU+6PbbVcbb7ESl+BMQFDFIp8IjBEePjc9umW023WrkE7mPX4yh67OVA/PzNfUGkFzDJ1ykCYxWsLfXCsr2cBE3swQsD02DmMCZhYpkKoIC4RSDnFcttBc/GXBRhRNwQMbc52BFhmLPqAzZZUWXbOonEoktO2+RTvN1/iB/zqQ+pnBBVBBva3cA0TAqL73Pvkek3w1TU/+ijvmo+Dts/uaRAwzJhwfC1vttmMgz+2c5MdHnqiklizBJQha913nZ0+BCGsMCYahkrN4TY2hg11xDEBc8D8+jY8t9/8Dy/1cq75fRYJmFD9OMQMxoyDiXrDYXMdHQliwGe2EPTUIRCi7XEQQ4TRMgPpAeHROsp4FkIMGwCiRuSFk2fT5LH1M2BDmy3zboU18xyxyfBOLDFQRxn2M22k4x77ITEDYykRBxUgJi6pn3vbiRA+eWv1OIOjbR1zcNDmI4b0V6IxDGYQjn3IGcazobecJ9a8s+OixJr5uXZpA+HfTloWtRH9DCGQod0YjHLUhjLwPPxQhpks/ixE3Ia5MGifx0yftoIzzO81NJjlup/ylT12w7vw+dVzVzgftflo0Zr11+nzbH6jf0uvfwoBE/fqsXO4wjySnUF4sfT+Xpv3Oy0htF/V5GOnf2keSWPzMSwzFhG9inpmM3duy0dYX5sDddEKZaBeXlw/7zN/z1xHLA+x74i8iAxSv5nH1fyIsEY0aarP7mkQMAyqGOQBc2Oikpjlkh9qFR5lHtKiorjmVubrkoTigDW5D5mHaKOTowpfWj/DPvN7nJnyUPtU9MtttoZKR4gw4BB8ByOPTWM0FoMq4dlemL3x3MvaEwlEBw3ONdE595s7dww3wCi5VwgW6uaguWo+IS6y6ToEZgoMBJlQ3QiURcTMEwc2FgLO4HhwpPeqxywBvMv8HsyWX1/zo2Mj+nBE7Ux0UZmnNt3tRrD71glmzjN/tyubfOrgmnTcaz/sF8AumLFhE8AgxuAKve0UDrx1wMBy7CltZuV6834az6Yv41TD3oiecN+fqMcBAgHRFvSWM+zp8fU4g71QZ4hi9jrAyea/mslOfaqN6JMftnmR9GTzQf9zUx7nKQu+JvoMs17eI9cj74RPRBhE9JHoz8U3XzHbN4NYDKJP5kF6ylcuYzdEVnK74tN5HrNs7gO9dUr7v80WR2oW9fUs7mLJKEc4puwcEDB874kp79nmUbPsJ8fgPQ/abF/SaeZ2gD3zOaIn+6xvLILXmu+xxD4YGx+ezkWkDpsJos2fk/Kob/KGJpeU7UX18z7z65g0BnwmKhpgF7TBHeoxbcpqCeIzYMLAfXIe0Gff2uTtWZ5gHvakcyAAaGgSlXXvdF2AykS9EaJj9sOAnGEWhyO4wXwvCGG/dgBjEHyLeSOs20xRRsIJoDbjGKfBgJ+h0+H86Ewoa0KEoTwXcaK5A0P85Gcys8KwMPCW48yN4LqaeBZlDnBgcT8cDEodVU/nIA8Hg2MPxuoQMXajzcqE6kexM/NgDZQ8ytjWRYBY4vnxfcLUraNpoZM/3zxEyQyActIZrjYf1GJdGej4POMqm/29CspMOeOZtPsyZd6t8K4RTRuC9ifM/aR6TH3w7lEPzKBipjVlPwEzQuyBuqP+6ZtBTztxPXXN83H29IuAAZf+OAZtiqB/g/nfeEGgRhszIDLYcl/a9KB5G/OOud3vZ33lvNRm/2kqfYQy38fmYeDlu/QRBiQGFERUZqqNANHxSvPN29QHIi5PKCAEzGPNI6Eb5gN9HkAChAeiFZtnEGBgjcEeMRV+i38pM3WKv8l1F0z5yl67oQ6o33Xze5xls7/bRArB0lOnD7DDf40WLOOfXmMzX8RkKoQZLLJzQMDQt84yjzhday7G9qdrFrHPPMKG72P/EnZyT/Oy89w73nzl9FgU0O5cx3jDhDNEX25z3nNRm/NcPiOGWogKvrB+vot5WzNZQGAyFmPDeXKO+GP8Q2zSlvzLuwTL9FmxBcRMby9ya5vNJjBsjo+pKfJiZrcIrj+2fuY7fCaPiEd0GJxlz722i71Y5h6ISMYMroe2HnjfRbPYW4L8TMpAGwSEm5+Sjpdh6L7t+/J5u9932TYaIwTMUGh/GaiX8AP8y/FQ3W0HORKyDERS8qQlM9TmY30951EX+MReQsDsFMuMRVvV5ggexNZWMVSGofbb7j4rhLiFIdSLE10lmMGd2GbuYbayjc6xrREwex0GM5YDQ3jsFETJdlLAbAcPNI8sEXlE+BClf9bcFUIIsQkutL619r0CyxJXtZl7nK1sI5YwEDBHezidQTXv2dgpWH76iK12dOACc5sj+ke9s9x/0twVQgixCVhvj1DrKsDGSTYerhJb1UbswYj9OOxhmPqJ7yrDu7e/xNpO2KvzPpvt0WAPx5lzV6wOtzffc4odX2Pzv2ASQohNcSeb33C9CrARdJlf5+12trKN2CuQ92pshSjaq7CBeSeJfRl5P03sIxRCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCiJ3i/wHKlSxXQVhT3gAAAABJRU5ErkJggg==>

[image2]: <data:image/png;base64,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>

[image3]: <data:image/png;base64,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>

[image4]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAC0AAAAXCAYAAACf+8ZRAAACL0lEQVR4Xu2WX2hPYRjHv/62Sf6W1rJSSFyI5I5Ea7UrczlNSVy5WBJJ4seVFE2EC5aUTNRsN1gpUm4UouZqKaxdKkmUse/X87w7Z89YzC+di/OpT+e87/P+3j3nfZ/zngElJSUl1WAzfUU/0h9+fU1784OKyn1Y0qtjoKjMoJ/ouxgoMhtgq3wlBorMcVjSrTFQZJ7Q73RRDPyG6XQlXR8D/4u59Bt9HgMTsJBep++9XUvf0MbREdWhKXYktsFK41QMOIfo4thJliNLeiqt0KWj0X9Hu34xdiYUUNK/eqo59HHsdJYhS7ra6DRTXpdiIDFAv9JZMUDO0/ZcW7tygx6jZ5ElvQf2Qdru7Tv0Mz1A+2EfsJn0DGxHVVpbfOw8epV20B7aRlvoM9icl+k6H/uTFbBVfpjvJHX0Av1CF3jfKjpIZ3t7E8audDfd7ffT6DBtpjthpaQHPefxethcQotw1O/30cN+X0FY6Y30Bf0AS1pXtV/CXij9QfXfSj+ATXY3116DsUnfRJa00Muth09ofv1rUHEf0PmwXdYCRCqYoDz+lBO0L9eOSXdhfNJKKqHTaW+uLWpg47SIEe1MSlrlMinWwj7zqk2h420oC49bae2W6jVxkN6jU7ytetdcqv/TaRDZ71fFO2EPdiQL/z07YLWuFdNLqhJSTe6ib+kjWO1f89ht2I4IHYsnYUnqutX7deZrnH6j1dVHSyyhT2GnSIP3VRUdUVpBJSZLxAgigHAnmuTWdAAAAABJRU5ErkJggg==>

[image5]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAKcAAAAXCAYAAABu3F+ZAAAFNklEQVR4Xu2aBYhtVRSGf1vswMBCxS4MFBNbMbAQCwNbUVAR9Yk1ttjdiYHd8cw34rMRxQZRwQ5EFAVb/8919rvn7rkzc2ccGc7M/uDn3rvOmTP37L32in2uVCgUCoVCoVAoFMYLs1k3WN9ZX1p3Wou1nVEojAJTWb3WgdbU1trWV9bX1gKt08Y3G1pvWT9af1ev71kP1k8qjDibW5My296KObg2s497HlcMzEr5gcL/wsnWH9YRNduCijkgxRcqprN+sj7NDxT6MJc1a27sAGM6EDgljnhzzcZ1sf1Qs/XHDrkhYzNrptzYRNZVDMp1+YHCFJa0XrT+tH6znlXUiZ1YztojN2ZMb+1qzVOzcT3m4fmarT/OtE7PjRU7WfdY0+QHmggphkFhsAp9oXl5wdpZ4VQzWDsqanW67XoDM611h4ZXHl2jmAecqxsut07JbNtYE60ZM3tjYeD/subNDxT+ZRm114YJHPFwRY34sHWb9bFisQ+V5a3frZvyAwPAouH8Y6rPmyqarFmmnNFwZlcU5q/nBxoO0WyF3DhMqAXny401cIYtrD2tJbJj3UBtSBR+QIPXqjmk7rusi63J1hzth5vN9opUcnZ+oGKCtVBubACkxl1y43+AKHmc9Zoi0xypSO+dwJG3zo0DcKv1kKJkGA6bWD8rvtOY4gqFc9Ld5fAE47nc2ADmtF7VyDonzSJORIRkj5Iu+x11booOUThMN1AWPKF2R7+y9n4w1lDcKwHkPo3sPY86H1q/qvO2w6XWYdV7jlNo9yjSyAGVHVazbreuVjQDt1i7K2qii6xzrPuts6yXFEX7B4o0xoRTrwETzaTTibIRnVLcPmpdm4l7WpE+aeCwEfXvteavzqcGow58RnGdVIPxna+yLlPnGrI/5rZuzI2K74uDXm+tqagbue7L6q5T3kDR9dfHnkaGXYFuoOkikqfMhoMzloxv41laETV7MzuTTCf4i2JfD6hNcQBeGUz24pIzfGStqHDGb6xVFNFrL8WWBhyqcLxFqs89iklk45lIw/nfqtWU4Yw4E8+acTQmmxqSvVjqSdIsj/4QnKhwukSv2qPI+tabtc/vK+6/G5ZS58wCOMSxiqdqfE8WC/c0GIwD90sD9XYlvhOPMHnGPhh8JyLmopmduXnS2jizN4b1rDes7xXOySufmTwGi7087ETIOitb51qnKh5zsnIZDM5NDQOROE0kEY2yAdj3o1ZLHK/29LWd4po9lUijOPSWiomHhRX/K9VmvB5snaeo2Vg8iV61O+eFivvrqcSiYX93tCCLcC+ddEbtvP4gQi6eGyto4B5TlGXjAiLPJ2pFvs+tVRWRg06fiWYwPlNEV9jWeqp6j0MT3RI4Jyk/wblEkhyiM9GYdEc0IFUneOSaNqL3V9RcKUVOUjgnE8giukB9F1thjMDeXUrROArd4W6VSNdEr/OtdapzgB+VkKKoIfn7ejd6giKaJVjt/CJnreozTrmfwuEfVURsrp9SJmmdLTDKCeB61LWnVZ8fUWztsPfHwuK6LCjKByAis7gKYwAiJtHoaEXRf4nCaVKXiKPQWH2h1iY0ZQAlApvLOPNka1lrK+tdRQlwUnUu4CykI+pdHHpmhUNTh3ENamDqMra/4CjrbkVtepCiNKF+Bf4HjwFZNPwkDVhIExVOPpSGqNBQcCi6bqIpDRFO/IpiiwOnpaPFjpPtq3DoocBuwQRFQ4STra5oioichcKAbKTYOqqDU+KcbJPwg4kEkXSozsmzY9J7gpqS7Zt6iVAYI/wD85wHpPyymLIAAAAASUVORK5CYII=>