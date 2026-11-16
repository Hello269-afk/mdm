// Simulation backend.
//
// Keeps the entire MDM model in memory so the demo runs with zero external
// dependencies — perfect for a classroom where the wifi may not cooperate.
//
// It exposes the SAME interface as backends/real.js, so index.js does not care
// which one is loaded. Everything here is a faithful simulation of how the real
// Android Management API behaves: you create a policy, mint an enrolment token,
// a device "enrols" against that token (openly, by scanning a QR), and then the
// device reports its compliance back and obeys commands.
//
// There is no real device access in this file and no way to gain any. A simulated
// "device" is just a row in a Map that a browser tab (device.html) drives.

const crypto = require('crypto');
const { POLICY_TEMPLATES } = require('../policies');

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(4).toString('hex')}`;
}

class SimBackend {
  constructor() {
    this.mode = 'sim';
    this.enterprise = { name: 'enterprises/SIM-DEMO', displayName: 'Demo Enterprise (Simulated)' };
    this.policies = new Map(); // name -> policy
    this.tokens = new Map();   // tokenValue -> { value, policyName, createdAt, expiresAt, used }
    this.devices = new Map();  // deviceId -> device
    this.commands = new Map(); // deviceId -> [pending commands]

    // Seed the policy templates so the console has something to show immediately.
    for (const [name, tpl] of Object.entries(POLICY_TEMPLATES)) {
      this.policies.set(name, { ...tpl });
    }
  }

  getEnterprise() {
    return this.enterprise;
  }

  listPolicies() {
    return [...this.policies.values()];
  }

  getPolicy(name) {
    return this.policies.get(name) || null;
  }

  upsertPolicy(policy) {
    if (!policy || !policy.name) throw new Error('policy.name is required');
    const existing = this.policies.get(policy.name) || {};
    const merged = { ...existing, ...policy };
    this.policies.set(policy.name, merged);
    // A real API re-applies the policy to every device already on it.
    for (const device of this.devices.values()) {
      if (device.policyName === policy.name) device.appliedPolicyVersion = Date.now();
    }
    return merged;
  }

  createEnrollmentToken(policyName) {
    const policy = this.policies.get(policyName);
    if (!policy) throw new Error(`Unknown policy: ${policyName}`);
    const value = id('ent');
    const token = {
      value,
      policyName,
      createdAt: Date.now(),
      expiresAt: Date.now() + 1000 * 60 * 60, // 1 hour, like the real default
      used: false,
    };
    this.tokens.set(value, token);
    return token;
  }

  // Called when a (simulated) device scans the QR and provisions itself.
  // In the real world this is Android Device Policy on the phone doing the work
  // AFTER the owner has agreed to the management terms on screen.
  enrollDevice(tokenValue, deviceInfo = {}) {
    const token = this.tokens.get(tokenValue);
    if (!token) throw new Error('Invalid enrolment token');
    if (token.expiresAt < Date.now()) throw new Error('Enrolment token expired');

    const deviceId = id('dev');
    const device = {
      id: deviceId,
      name: deviceInfo.name || 'Pixel 8 (Simulated)',
      model: deviceInfo.model || 'Pixel 8',
      androidVersion: deviceInfo.androidVersion || '15',
      policyName: token.policyName,
      state: 'ACTIVE',
      enrolledAt: Date.now(),
      lastReportAt: Date.now(),
      appliedPolicyVersion: Date.now(),
      // What the device reports back about itself. All non-invasive.
      compliance: {
        passwordCompliant: true,
        encryptionEnabled: true,
        unknownSourcesDisabled: true,
      },
      battery: 87,
      locked: false,
      wiped: false,
    };
    this.devices.set(deviceId, device);
    this.commands.set(deviceId, []);
    token.used = true; // single-use, like the real API default
    return device;
  }

  listDevices() {
    return [...this.devices.values()];
  }

  getDevice(deviceId) {
    return this.devices.get(deviceId) || null;
  }

  // Device checks in with a status report. Updates lastReportAt and merges state.
  reportStatus(deviceId, report = {}) {
    const device = this.devices.get(deviceId);
    if (!device) throw new Error('Unknown device');
    device.lastReportAt = Date.now();
    if (typeof report.battery === 'number') device.battery = report.battery;
    if (report.compliance) device.compliance = { ...device.compliance, ...report.compliance };
    // The device acknowledges any commands it has carried out.
    return device;
  }

  // Issue a management command. These map to real AMAP device commands, and every
  // one of them is something a device OWNER expects their org to be able to do to a
  // managed work device. Note what is absent: no "stream screen", no "inject tap".
  issueCommand(deviceId, type) {
    const device = this.devices.get(deviceId);
    if (!device) throw new Error('Unknown device');
    const allowed = ['LOCK', 'RESET_PASSWORD', 'REBOOT', 'RELINQUISH_OWNERSHIP', 'WIPE'];
    if (!allowed.includes(type)) throw new Error(`Unsupported command: ${type}`);

    const command = { id: id('cmd'), type, createdAt: Date.now(), state: 'PENDING' };
    this.commands.get(deviceId).push(command);

    // Simulate the device obeying almost immediately so the demo feels live.
    if (type === 'LOCK') device.locked = true;
    if (type === 'REBOOT') device.lastReportAt = Date.now();
    if (type === 'WIPE' || type === 'RELINQUISH_OWNERSHIP') {
      device.state = 'DELETED';
      device.wiped = true;
      // A real wipe removes the device from management entirely.
    }
    command.state = 'ACKED';
    return command;
  }

  // Let the device side clear its own lock (e.g. user enters password) — demo nicety.
  unlockDevice(deviceId) {
    const device = this.devices.get(deviceId);
    if (!device) throw new Error('Unknown device');
    device.locked = false;
    return device;
  }
}

module.exports = { SimBackend };
