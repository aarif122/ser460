// public/script.js

const H = { 'Content-Type': 'application/json', 'X-User-Id': '1' }; // demo user
const eventsEl = document.getElementById('events');
const loadBtn = document.getElementById('loadBtn');
const statusPill = document.getElementById('status');
const verifyBox = document.getElementById('verifyBox');
const reqCodeBtn = document.getElementById('reqCodeBtn');
const checkStatusBtn = document.getElementById('checkStatusBtn');

function setStatus(msg) {
  if (!msg) { statusPill.style.display = 'none'; return; }
  statusPill.textContent = msg;
  statusPill.style.display = 'inline-block';
}

async function loadEvents() {
  setStatus('Loading...');
  const list = await fetch('/api/events').then(r => r.json());
  renderEvents(list);
  setStatus(`${list.length} events`);
}

function renderEvents(list) {
  eventsEl.innerHTML = '';
  if (!list.length) {
    eventsEl.innerHTML = '<div class="notice">No events found.</div>';
    return;
  }
  list.forEach(ev => {
    const wrap = document.createElement('div');
    wrap.className = 'event';

    const title = document.createElement('div');
    title.innerHTML = `<div><b>${ev.title}</b></div>
      <div class="meta">${new Date(ev.date).toLocaleString()} @ ${ev.location}</div>`;

    const right = document.createElement('div');
    right.style.display = 'flex';
    right.style.gap = '8px';
    right.style.alignItems = 'center';

    if (!ev.free) {
      const pill = document.createElement('span');
      pill.className = 'pill';
      pill.textContent = `$${ev.price}`;
      right.appendChild(pill);
    }
    if (ev.requiresVerification) {
      const pill = document.createElement('span');
      pill.className = 'pill';
      pill.textContent = 'Verify';
      right.appendChild(pill);
    }

    const left = document.createElement('span');
    left.className = 'pill';
    left.textContent = ev.spotsLeft > 0 ? `${ev.spotsLeft} spots` : 'Full';
    right.appendChild(left);

    const btn = document.createElement('button');
    btn.textContent = 'Register';
    btn.disabled = ev.spotsLeft <= 0;
    btn.onclick = () => handleRegister(ev);
    right.appendChild(btn);

    wrap.appendChild(title);
    wrap.appendChild(right);
    eventsEl.appendChild(wrap);
  });
}

// --------------------------------------------------
// Registration flow (preview → (verify?) → (pay?) → register)
// --------------------------------------------------
async function handleRegister(ev) {
  try {
    setStatus('Checking requirements...');
    const preview = await fetch('/api/registrations/preview', {
      method: 'POST', headers: H, body: JSON.stringify({ eventId: ev.id })
    }).then(r => r.json());

    if (!preview.ok) throw new Error(preview.error || 'Preview failed');

    // VERIFICATION
    if (preview.needsVerification) {
      setStatus('Needs verification – requesting code...');
      const req = await fetch('/api/verify/request', { method: 'POST', headers: H }).then(r => r.json());
      if (!req.ok) throw new Error('Could not request code');

      // Demo: auto-submit the returned code
      const conf = await fetch('/api/verify/confirm', {
        method: 'POST', headers: H, body: JSON.stringify({ code: req.demoCode })
      }).then(r => r.json());
      if (!conf.ok) throw new Error('Verification failed');
    }

    // PAYMENT
    let paymentId;
    if (preview.needsPayment) {
      setStatus('Creating payment intent...');
      const intent = await fetch('/api/payments/intent', {
        method: 'POST', headers: H, body: JSON.stringify({ eventId: ev.id })
      }).then(r => r.json());
      if (!intent.ok) throw new Error('Payment intent failed');

      setStatus('Confirming payment...');
      const conf = await fetch('/api/payments/confirm', {
        method: 'POST', headers: H, body: JSON.stringify({ paymentId: intent.paymentId })
      }).then(r => r.json());
      if (!conf.ok) throw new Error('Payment confirmation failed');
      paymentId = intent.paymentId;
    }

    // REGISTER
    setStatus('Registering...');
    const reg = await fetch('/api/registrations/register', {
      method: 'POST', headers: H, body: JSON.stringify({ eventId: ev.id, paymentId })
    }).then(r => r.json());
    if (!reg.ok) throw new Error(reg.error || 'Register failed');

    alert('✅ Registered successfully!');
    await loadEvents();
    await refreshVerifyBox();
    setStatus('Done');
  } catch (e) {
    console.error(e);
    alert('❌ ' + e.message);
    setStatus('');
  }
}

// --------------------------------------------------
// Verification panel helpers
// --------------------------------------------------
async function refreshVerifyBox() {
  const s = await fetch('/api/verify/status', { headers: H }).then(r => r.json());
  if (s.verified) {
    verifyBox.style.display = 'block';
    verifyBox.innerHTML = `✅ <b>Verified.</b> <br/><small>Verified at: ${new Date(s.verifiedAt).toLocaleString()}</small>`;
  } else {
    verifyBox.style.display = 'block';
    verifyBox.innerHTML = `⚠️ <b>Not verified.</b> Some events may require verification.`;
  }
}

reqCodeBtn.onclick = async () => {
  const r = await fetch('/api/verify/request', { method: 'POST', headers: H }).then(r => r.json());
  if (r.ok) {
    alert(`Demo: Your OTP is ${r.demoCode} (auto-used during flow).`);
  }
};
checkStatusBtn.onclick = refreshVerifyBox;

// init
loadBtn.onclick = loadEvents;
loadEvents().then(refreshVerifyBox);
