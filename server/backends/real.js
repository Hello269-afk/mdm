// Real backend — Google Android Management API (AMAP).
//
// This is the genuine, Google-sanctioned way to build MDM. You do NOT build any
// device-side agent: Google ships "Android Device Policy", and the device owner
// installs/activates it openly during setup by scanning your enrolment QR. This
// file only talks to the management API; it never touches a device directly.
//
// Docs: https://developers.google.com/android/management
//
// To use it:
//   1. Create a Google Cloud project, enable the Android Management API.
//   2. Create a service account, download its JSON key.
//   3. Complete the one-time enterprise signup to get an enterprise name
//      (enterprises/LC...). See Google's "Quickstart" guide.
//   4. Run the server with:
//        MODE=real \
//        GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json \
//        ENTERPRISE_NAME=enterprises/LCxxxxxxxx \
//        npm start
//
// It exposes the SAME interface as backends/sim.js.

const { POLICY_TEMPLATES } = require('../policies');

class RealBackend {
  constructor() {
    this.mode = 'real';
    this.enterpriseName = process.env.ENTERPRISE_NAME;
    if (!this.enterpriseName) {
      throw new Error('MODE=real requires ENTERPRISE_NAME (e.g. enterprises/LC...)');
    }

    // Lazy require so the sim demo never needs googleapis installed.
    let google;
    try {
      ({ google } = require('googleapis'));
    } catch (e) {
      throw new Error(
        'MODE=real requires the googleapis package. Run: npm install googleapis'
      );
    }

    this.auth = new google.auth.GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/androidmanagement'],
    });
    this.am = google.androidmanagement({ version: 'v1', auth: this.auth });
  }

  async getEnterprise() {
    const res = await this.am.enterprises.get({ name: this.enterpriseName });
    return res.data;
  }

  async listPolicies() {
    const res = await this.am.enterprises.policies.list({ parent: this.enterpriseName });
    return res.data.policies || [];
  }

  async getPolicy(name) {
    try {
      const res = await this.am.enterprises.policies.get({
        name: `${this.enterpriseName}/policies/${name}`,
      });
      return res.data;
    } catch {
      return null;
    }
  }

  // Create or update a policy. We translate our simple template shape into the
  // real AMAP policy fields.
  async upsertPolicy(policy) {
    const tpl = POLICY_TEMPLATES[policy.name] || policy;
    const body = {
      passwordRequirements: tpl.passwordRequirements,
      cameraDisabled: !!tpl.cameraDisabled,
      screenCaptureDisabled: !!tpl.screenCaptureDisabled,
      kioskCustomLauncherEnabled: !!tpl.kioskCustomLauncherEnabled,
      applications: (tpl.applications || []).map((a) => ({
        packageName: a.packageName,
        installType: a.installType,
      })),
    };
    const res = await this.am.enterprises.policies.patch({
      name: `${this.enterpriseName}/policies/${policy.name}`,
      requestBody: body,
    });
    return res.data;
  }

  async createEnrollmentToken(policyName) {
    const res = await this.am.enterprises.enrollmentTokens.create({
      parent: this.enterpriseName,
      requestBody: {
        policyName: `${this.enterpriseName}/policies/${policyName}`,
        duration: '3600s',
        oneTimeOnly: true,
      },
    });
    // The real API returns a `qrCode` string (JSON) and a `value`.
    return {
      value: res.data.value,
      policyName,
      qrCode: res.data.qrCode,
      expiresAt: Date.parse(res.data.expirationTimestamp),
      createdAt: Date.now(),
      used: false,
    };
  }

  // Enrolment itself happens ON THE DEVICE via Android Device Policy after the
  // owner scans the QR and agrees to the terms. There is no server-side "enroll"
  // call — the device appears in listDevices once it has provisioned.
  enrollDevice() {
    throw new Error(
      'In real mode, a device enrols by scanning the QR and accepting the on-device ' +
      'management terms. It will then appear in the device list automatically.'
    );
  }

  async listDevices() {
    const res = await this.am.enterprises.devices.list({ parent: this.enterpriseName });
    return (res.data.devices || []).map(this._shapeDevice);
  }

  async getDevice(deviceId) {
    const res = await this.am.enterprises.devices.get({
      name: `${this.enterpriseName}/devices/${deviceId}`,
    });
    return this._shapeDevice(res.data);
  }

  reportStatus() {
    // Devices report to Google automatically; nothing to do server-side.
    return null;
  }

  async issueCommand(deviceId, type) {
    // Maps directly to AMAP device commands. Note the absence of any "see screen"
    // or "inject input" command — the API does not offer them, by design.
    const supported = ['LOCK', 'RESET_PASSWORD', 'REBOOT', 'RELINQUISH_OWNERSHIP', 'WIPE'];
    if (!supported.includes(type)) throw new Error(`Unsupported command: ${type}`);
    const res = await this.am.enterprises.devices.issueCommand({
      name: `${this.enterpriseName}/devices/${deviceId}`,
      requestBody: { type },
    });
    return res.data;
  }

  unlockDevice() {
    throw new Error('Not applicable in real mode.');
  }

  _shapeDevice(d) {
    return {
      id: (d.name || '').split('/').pop(),
      name: d.hardwareInfo?.model || 'Managed device',
      model: d.hardwareInfo?.model,
      androidVersion: d.softwareInfo?.androidVersion,
      policyName: (d.policyName || '').split('/').pop(),
      state: d.state,
      enrolledAt: Date.parse(d.enrollmentTime) || null,
      lastReportAt: Date.parse(d.lastStatusReportTime) || null,
      compliance: {
        passwordCompliant: d.policyCompliant !== false,
      },
      appliedPolicyVersion: d.appliedPolicyVersion,
    };
  }
}

module.exports = { RealBackend };
