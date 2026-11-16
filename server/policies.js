// Default policy templates.
//
// These mirror the shape of a real Android Management API "Policy" resource:
// https://developers.google.com/android/management/reference/rest/v1/enterprises.policies
//
// A policy is the whole point of MDM: it is the openly-declared set of rules the
// device owner agrees to when they enrol. Nothing here is hidden from the user.
// There is deliberately NO screen capture, NO remote input, NO location tracking
// of personal devices, NO covert anything. That is what separates MDM from spyware.

const POLICY_TEMPLATES = {
  // A sensible baseline for a company-owned work phone.
  standard_work: {
    name: 'standard_work',
    displayName: 'Standard Work Device',
    passwordRequirements: {
      passwordMinimumLength: 6,
      passwordQuality: 'NUMERIC_COMPLEX',
    },
    cameraDisabled: false,
    screenCaptureDisabled: false,
    // Apps the org installs/allows. "installType" is straight from the real API.
    applications: [
      { packageName: 'com.google.android.gm', displayName: 'Gmail', installType: 'FORCE_INSTALLED' },
      { packageName: 'com.microsoft.teams', displayName: 'Microsoft Teams', installType: 'AVAILABLE' },
      { packageName: 'com.slack', displayName: 'Slack', installType: 'AVAILABLE' },
    ],
    // What the owner is told this device can do to them. Shown in the demo UI.
    disclosures: [
      'This device is managed by your organisation.',
      'Your organisation can enforce a screen lock and wipe COMPANY data.',
      'Your organisation CANNOT see your personal messages, photos or screen.',
    ],
  },

  // A locked-down single-purpose device (e.g. a kiosk, a warehouse scanner).
  kiosk: {
    name: 'kiosk',
    displayName: 'Kiosk / Single-Purpose',
    passwordRequirements: {
      passwordMinimumLength: 0,
      passwordQuality: 'PASSWORD_QUALITY_UNSPECIFIED',
    },
    cameraDisabled: true,
    screenCaptureDisabled: true,
    kioskCustomLauncherEnabled: true,
    applications: [
      { packageName: 'com.example.kioskapp', displayName: 'Kiosk App', installType: 'KIOSK' },
    ],
    disclosures: [
      'This is a company-owned single-purpose device.',
      'It is locked to one application.',
    ],
  },

  // Minimal policy — useful to show a device enrolling with almost no restrictions.
  minimal: {
    name: 'minimal',
    displayName: 'Minimal (BYOD work profile)',
    passwordRequirements: {
      passwordMinimumLength: 4,
      passwordQuality: 'SOMETHING',
    },
    cameraDisabled: false,
    screenCaptureDisabled: false,
    applications: [
      { packageName: 'com.google.android.gm', displayName: 'Gmail', installType: 'AVAILABLE' },
    ],
    disclosures: [
      'Only the WORK PROFILE on this device is managed.',
      'Your personal apps and data are in a separate container the org cannot see.',
    ],
  },
};

module.exports = { POLICY_TEMPLATES };
