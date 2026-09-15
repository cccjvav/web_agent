'use strict';
const crypto = require('crypto');
const express = require('express');
const {config} = require('../config');
const {isLocalControlPlane} = require('./localControl');
const queue = require('./operatorQueue');
const {currentSignal} = require('./requestScope');
const {validateReference} = require('../../../probe-extension/referenceInput');
const {validateTraceExport} = require('../../../probe-extension/traceInput');
const links = new Map();
const actions = new Set(['start', 'stop', 'rename', 'archive', 'question', 'refresh-map']);
const digest = token => crypto.createHash('sha256').update(token).digest('hex');
function drop(id) {
  const link = links.get(id);
  if (link) for (const command of [...link.commands.values()]) command.finish(new Error('Browser disconnected'));
  if(link) for(const requestId of link.jobs) {try{queue.cancel(requestId);}catch{}}
  links.delete(id);
}
function prune() { for (const link of links.values()) if (link.expiresAt <= Date.now() || link.workspaceRoot !== config.workspaceRoot) drop(link.id); }
function get(id) { prune(); const link = links.get(id); if (!link) throw new Error('Unknown/expired browser link'); return link; }
function pair({extensionId} = {}) {
  prune();
  if (!/^[a-p]{32}$/.test(extensionId || '') || links.size >= 4) throw new Error('Invalid extension ID or link quota');
  const token = crypto.randomBytes(32).toString('hex'), id = crypto.randomUUID();
  const link = {id, tokenHash: digest(token), origin: 'chrome-extension://' + extensionId, workspaceRoot: config.workspaceRoot,
    expiresAt: Date.now() + 15 * 60 * 1000, lastSeen: 0, boundTab: null, jobs: new Set(), tabs: new Map(), commands: new Map(), cancellations: []};
  links.set(id, link);
  return {schema: 'webagent-probe-pair/v1', id, token, expiresAt: link.expiresAt, workspaceRoot: link.workspaceRoot,
    hostInstanceId: config.hostInstanceId};
}
function list() {
  prune(); return [...links.values()].map(link => ({id: link.id, origin: link.origin, workspaceRoot: link.workspaceRoot,
    expiresAt: link.expiresAt, connected: Date.now() - link.lastSeen < 15000,
    tabs: [...link.tabs.values()].map(tab => ({tabId: tab.tabId, sessionId: tab.sessionId, observedAt: tab.observedAt, hasTrace: !!tab.trace}))}));
}
function report(id, tabId) { const tab=get(id).tabs.get(Number(tabId)) || null; if(tab && Date.now()-tab.observedAt>15000) throw Error('Stale browser reference'); return tab; }
function target(link, input) {
  const tab = link.tabs.get(input.tabId);
  if (!tab || tab.sessionId !== input.sessionId || Date.now() - tab.observedAt > 15000) throw new Error('Browser target is stale');
  return tab;
}
function validateAction(input) {
  if (!input || !actions.has(input.action) || !Number.isInteger(input.tabId) || !/^[\w-]{1,128}$/.test(input.sessionId || '')
    || typeof input.linkId !== 'string' || Object.keys(input).some(k => !['linkId','tabId','sessionId','action','text'].includes(k))) throw new Error('Invalid browser action');
  if (['question','rename'].includes(input.action)) {
    if (typeof input.text !== 'string' || !input.text.trim() || input.text.length > (input.action === 'rename' ? 100 : 6000)) throw new Error('Invalid action text');
  } else if (input.text !== undefined) throw new Error('Unexpected action text');
  return JSON.parse(JSON.stringify(input));
}
function request(input, options = {}) {
  const {requestKey, ...rest} = input || {};
  const action = validateAction(rest); target(get(action.linkId), action);
  const link=get(action.linkId);if(link.jobs.size>=100)throw Error('Pairing action budget exhausted');
  const job=queue.submit('probe-browser', action, options, requestKey);link.jobs.add(job.requestId);return job;
}
function execute(input) {
  const link = get(input.linkId); target(link, input);
  if (link.commands.size >= 4) throw new Error('Browser command quota');
  return new Promise((resolve, reject) => {
    const signal = currentSignal(), id = crypto.randomUUID();
    const command = {id, ...input, deadline: Date.now() + 30000, delivered: false};
    let done = false;
    const abort = () => { if (link.cancellations.length < 20) link.cancellations.push(id); command.finish(new Error('Browser action interrupted; outcome unknown')); };
    const timer = setTimeout(abort, 30000);
    command.finish = (error, value) => {
      if (done) return; done = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); link.commands.delete(id);
      error ? reject(error) : resolve(value);
    };
    link.commands.set(id, command); signal?.addEventListener('abort', abort, {once: true});
    if (signal?.aborted) abort();
  });
}
queue.register('probe-browser', execute);
function authenticate(req, res, next) {
  if (!isLocalControlPlane(req) || !/^chrome-extension:\/\/[a-p]{32}$/.test(req.headers.origin || '')) return res.sendStatus(404);
  prune();
  const origin = req.headers.origin;
  if (![...links.values()].some(link => link.origin === origin)) return res.sendStatus(403);
  res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  const token = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization || '')?.[1];
  const link = token && [...links.values()].find(item => item.origin === origin && crypto.timingSafeEqual(Buffer.from(item.tokenHash), Buffer.from(digest(token))));
  if (!link) return res.sendStatus(403);
  req.probeLink = link; next();
}
function transport() {
  const router = express.Router();
  router.use(authenticate, express.json({limit: '300kb'}));
  router.post('/', (req, res) => {
    const link = req.probeLink, input = req.body;
    try {
      if (input?.type === 'request') return res.json(request({linkId:link.id, tabId:input.tabId, sessionId:input.sessionId, action:input.action, ...(input.text !== undefined ? {text:input.text} : {}), requestKey:input.requestKey}, {callerKey:'browser:' + link.id}));
      if (input?.type === 'disconnect') { drop(link.id); return res.json({ok: true}); }
      if (input?.type === 'result') {
        const command = link.commands.get(input.id);
        if (!command || !command.delivered || command.deadline < Date.now()) throw new Error('Stale result');
        target(link, command);
        if (!['succeeded','failed','cancelled','unknown'].includes(input.status)) throw new Error('Invalid result');
        command.finish(null, {ok: input.status === 'succeeded', status: input.status, verification: {state: 'browser-reported-not-independent'}});
        return res.json({ok: true});
      }
      if (input?.type !== 'sync' || !Number.isInteger(input.tabId) || input.tabId < 0 || !/^[\w-]{1,128}$/.test(input.sessionId || '')) throw new Error('Invalid sync');
      if (link.boundTab !== null && link.boundTab !== input.tabId) throw new Error('Link bound to another tab');
      const trace = input.trace == null ? null : validateTraceExport(input.trace);
      if (trace && Buffer.byteLength(JSON.stringify(trace)) > 262144) throw new Error('Trace budget');
      if (!link.tabs.has(input.tabId) && link.tabs.size >= 8) throw new Error('Tab quota');
      const reference=input.reference==null?null:validateReference(input.reference);
      const old = link.tabs.get(input.tabId);
      if (old && old.sessionId !== input.sessionId) for (const command of [...link.commands.values()]) if (command.tabId === input.tabId) command.finish(new Error('Navigation invalidated action'));
      link.tabs.set(input.tabId, {tabId: input.tabId, sessionId: input.sessionId, observedAt: Date.now(), trace, reference}); link.lastSeen = Date.now(); link.boundTab = input.tabId;
      const commands = [];
      for (const command of link.commands.values()) if (!command.delivered && command.tabId === input.tabId && command.sessionId === input.sessionId) {
        command.delivered = true; const {finish, delivered, ...wire} = command; commands.push(wire);
      }
      res.json({commands, cancellations: link.cancellations.splice(0), expiresAt: link.expiresAt});
    } catch (_) { res.status(400).json({error: 'Probe message rejected; no automatic replay'}); }
  });
  router.use((err, req, res, next) => { res.status(400).json({error: 'Probe payload rejected'}); });
  return router;
}
module.exports = {pair, list, report, request, drop, transport, validateAction};
