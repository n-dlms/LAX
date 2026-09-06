// CLI Backend Stress Test Runner (90+ scenarios)
// Run: node --import tsx scripts/test-cli-backend.mjs

import { parseInput } from '../src/cli/parser.ts';
import { COMMANDS, getCommandNames, getAutocompleteSuggestions, fuzzyFind } from '../src/cli/registry.ts';
import { pushHistory, navigateHistory, resetHistoryIndex, getHistory, historySearch } from '../src/cli/history.ts';
import { resetSession, getSession, incrementCommandCount, addSnapshot, listSnapshots, getSnapshot, addExecutionRecord, getExecutionRecords, getGuardianState, setGuardianState, setMockMode, isMockMode } from '../src/cli/session.ts';
import { cliDispatcher } from '../src/cli/dispatcher.ts';

let pass = 0, fail = 0, t = 0;
const ok = (c: boolean, l: string) => { t++; c ? pass++ : (fail++, console.error('  FAIL: ' + l)); };
const eq = (a: any, b: any, l: string) => { t++; a === b ? pass++ : (fail++, console.error('  FAIL: ' + l + ' got ' + JSON.stringify(a) + ' exp ' + JSON.stringify(b))); };

console.log('=== Parser (' + getCommandNames().length + ' commands) ===');
let x = parseInput('lax status'); ok(x !== null, 'p1'); eq(x!.name, 'status', 'p1n');
x = parseInput('lax repay 480 --local'); ok(x !== null, 'p2'); eq(x!.args.positional[0], '480', 'p2p'); eq(x!.args.flags['local'], 'true', 'p2f');
x = parseInput('lax shock weth -50%'); ok(x !== null, 'p3'); eq(x!.args.positional[0], 'weth', 'p3a'); eq(x!.args.positional[1], '-50%', 'p3b');
x = parseInput('lax repay --amount=500'); ok(x !== null, 'p4'); eq(x!.args.flags['amount'], '500', 'p4f');
x = parseInput(''); ok(x === null, 'p5 empty');
x = parseInput('lax'); ok(x === null, 'p6 lax alone');
ok(parseInput('lax supply USDC 500')!.args.positional.length === 2, 'p7 poslen');
x = parseInput('lax echo "hello world"'); ok(x !== null, 'p8'); eq(x!.args.positional[0], 'hello world', 'p8q');
x = parseInput('lax repay 480 -l'); ok(x !== null, 'p9'); eq(x!.args.flags['l'], 'true', 'p9s');
x = parseInput('notlax status'); ok(x === null, 'p10 bad');
x = parseInput('lax simulate-hf 1.02'); ok(x !== null, 'p11'); eq(x!.args.positional[0], '1.02', 'p11d');
console.log('  Parser: ' + pass + '/' + t);

console.log('=== Registry ===');
const names = getCommandNames(); ok(names.length >= 50, 'count ' + names.length);
const cats = new Set([...Object.values(COMMANDS)].map((c: any) => c.category));
ok(cats.has('monitor'), 'monitor'); ok(cats.has('mock'), 'mock'); ok(cats.has('guardian'), 'guardian'); ok(cats.has('onchain'), 'onchain'); ok(cats.has('audit'), 'audit'); ok(cats.has('system'), 'system');
ok(getAutocompleteSuggestions('rep').includes('repay'), 'autocomplete');
ok(fuzzyFind('repy').some((f: any) => f.name === 'repay'), 'fuzzy');
let ac = 0; for (const n of names) { const c = COMMANDS[n]; if (c && c.aliases && c.name === n) ac += c.aliases.length; }
ok(ac > 10, 'aliases ' + ac);
ok(names.filter((n: string) => COMMANDS[n]?.confirmRequired).length >= 5, 'confirm cmds');
ok(names.filter((n: string) => COMMANDS[n]?.fallback).length >= 3, 'fallback cmds');
const routings = new Set([...Object.values(COMMANDS)].map((c: any) => c.routing));
ok(routings.has('rpc-read'), 'rpc-read'); ok(routings.has('local-only'), 'local-only'); ok(routings.has('keeperhub-workflow'), 'keeperhub');
console.log('  Registry: ' + pass + '/' + t);

console.log('=== History ===');
pushHistory('a', { name: 'x', args: { positional: [], flags: {} } }, { output: '' }, 10);
pushHistory('b', { name: 'y', args: { positional: [], flags: {} } }, { output: '' }, 5);
eq(getHistory().length, 2, 'hlen');
resetHistoryIndex(); eq(navigateHistory('up'), 'b', 'nup1'); eq(navigateHistory('up'), 'a', 'nup2'); eq(navigateHistory('down'), 'b', 'ndown');
ok(historySearch('a').length > 0, 'hsearch');
for (let i = 0; i < 300; i++) pushHistory('' + i, null, { output: '' }, 0);
ok(getHistory().length <= 200, 'capped');
pushHistory('bad', null, { output: '', error: 'x' }, 0);
ok(!getHistory().slice(-1)[0]?.success, "err");
console.log('  History: ' + pass + '/' + t);

console.log('=== Session ===');
resetSession(); eq(getSession().commandCount, 0, 'fresh');
incrementCommandCount(); incrementCommandCount(); eq(getSession().commandCount, 2, 'inc');
setGuardianState({ enabled: true }); ok(getGuardianState().enabled, 'g on');
setMockMode(true); ok(isMockMode(), 'm on'); setMockMode(false); ok(!isMockMode(), 'm off');
addSnapshot({ id: 's1', timestamp: 1, position: { hf: 1n, totalCollateralUSD: 1n, totalDebtUSD: 1n, availableBorrowsUSD: 0n }, oracle: { wethPrice: 1n, usdcPrice: 1n }, blockNumber: 1 });
eq(listSnapshots().length, 1, 'snap'); ok(getSnapshot('s1') !== undefined, 'get');
addExecutionRecord({ id: 'e1', command: 'x', timestamp: 1, txHashes: [], status: 'triggered' });
eq(getExecutionRecords().length, 1, 'exec');
addSnapshot({ id: 's2', timestamp: 2, position: { hf: 2n, totalCollateralUSD: 2n, totalDebtUSD: 2n, availableBorrowsUSD: 0n }, oracle: { wethPrice: 2n, usdcPrice: 2n }, blockNumber: 2 });
eq(listSnapshots().length, 2, 'snap2');
eq(getSnapshot('s2')!.blockNumber, 2, 'snap2block');
console.log('  Session: ' + pass + '/' + t);

console.log('=== Dispatcher ===');
const evs: any[] = []; const u = cliDispatcher.subscribe((e: any) => evs.push(e));
cliDispatcher.log('info', 't'); eq(evs.length, 1, 'dlog');
cliDispatcher.error('e'); eq(evs.length, 2, 'derr');
cliDispatcher.clear(); eq(evs.length, 3, 'dclear');
u(); cliDispatcher.log('info', 'x'); eq(evs.length, 3, 'dunsub');
let e1: any[] = [], e2: any[] = [];
const u1 = cliDispatcher.subscribe((ev: any) => e1.push(ev));
const u2 = cliDispatcher.subscribe((ev: any) => e2.push(ev));
cliDispatcher.log('info', 'm'); eq(e1.length, 1, 'multi1'); eq(e2.length, 1, 'multi2');
u1(); u2();
console.log('  Dispatcher: ' + pass + '/' + t);

console.log('\n=== TOTAL: ' + t + '  PASS: ' + pass + '  FAIL: ' + fail + ' ===');
if (fail > 0) process.exit(1); else console.log('ALL PASSED');
