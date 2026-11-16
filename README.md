# MDM Console — a teaching demo

A small, honest Mobile Device Management demo built on the **Android Management API**
model. It shows how real MDM works: you define a policy, mint an enrolment QR, a
device owner **scans it and consents**, and only then does the device become managed
and start reporting compliance and obeying commands.

Two modes, same code:

- **Simulation** (default) — runs entirely on your laptop, no accounts, no network
  needed. Use this for the class so nothing can break on the day.
- **Real** — talks to Google's live Android Management API with a real device.

## Why this is MDM and not spyware

This distinction is the whole lesson, and it is worth saying out loud in the talk:

| Real MDM (this demo) | Spyware / RAT |
|---|---|
| Owner **scans a QR and accepts terms** before anything applies | Installs silently via a sent link |
| Uses Google's official **Android Device Policy** agent | Sideloaded custom APK |
| Can lock, wipe **company** data, enforce passcode | Streams the live screen, injects taps |
| Reports **compliance, model, battery** | Harvests messages, location, keystrokes |
| Owner can see management and remove it | Hides itself |

The server deliberately **rejects** any command outside the MDM set (try issuing
`STREAM_SCREEN` — it returns an error). There is no screen capture and no input
injection anywhere in this codebase, because real MDM has neither.

## Run it (simulation)

```bash
cd server
npm install --no-optional
npm start
# → http://localhost:4000
```

## Demo script (about 4 minutes)

1. Open **http://localhost:4000** — the admin console. Point out the **SIMULATION**
   pill, the three policies, and the disclosure box ("what the owner is told").
2. Pick **Standard Work Device**, click **Generate enrolment QR**.
3. On a second screen (or your phone on the same wifi), scan the QR — or just open
   the link it shows. You get the **device** screen.
4. On the device: read the **management terms**, click **Accept & enrol**. Note that
   *nothing happened until the owner consented*. The phone shows "Managed by your
   organisation" and the work apps.
5. Back on the console, the device appears instantly (live via WebSocket), showing
   compliance, battery and last check-in.
6. Click **Lock** — the phone locks. Click **Reset passcode**, **Reboot**.
7. Click **Wipe company data** — the device leaves management. Say the line:
   "On a real device, personal photos and messages are untouched. That's
   containerisation."
8. Closer: "Notice what the console *can't* do. There's no 'see their screen'
   button, no 'read their messages'. That's not an oversight — the API doesn't
   offer it. That's the line between management and surveillance."

## Run it for real (stretch)

1. Create a Google Cloud project, enable the **Android Management API**.
2. Create a service account, download its JSON key.
3. Complete the one-time enterprise signup (Google's quickstart) to get an
   `enterprises/LC...` name.
4. Install the real client and run:

```bash
cd server
npm install            # pulls in googleapis
MODE=real \
GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json \
ENTERPRISE_NAME=enterprises/LCxxxxxxxx \
npm start
```

Now the QR carries Google's real provisioning payload. Scan it on a factory-reset
Android device during setup, accept the terms, and it enrols for real and appears
in the console.

## Architecture

```
web-client/           Admin console (index.html) + device simulator (device.html)
server/
  index.js            Express REST API + WebSocket live updates + QR generation
  policies.js         Policy templates (mirror real AMAP Policy fields)
  backends/
    sim.js            In-memory simulation (default)
    real.js           Google Android Management API wrapper (MODE=real)
```

The admin console and both backends share one interface, so the UI is identical
whether you are simulating or driving real devices.

## Tech

Node.js · Express · ws (WebSocket) · qrcode · (googleapis for real mode)
