// ===== Config =====
const API_URL = 'https://api.suitemonger.com/api/v1/waitlist'; // point this at your backend endpoint

// ===== Role toggle (User / Partner) =====
let currentRole = 'user';

function setRole(role) {
  currentRole = role;

  const userBtn = document.getElementById('role-user-btn');
  const partnerBtn = document.getElementById('role-partner-btn');
  const roleLabel = document.getElementById('role-label');

  const activeStyle = 'padding:10px 18px; border:none; border-radius:9px; background:#fff; color:#0B0B0D; font-family:inherit; font-size:14px; font-weight:700; cursor:pointer;';
  const inactiveStyle = 'padding:10px 18px; border:none; border-radius:9px; background:transparent; color:#C9B4B2; font-family:inherit; font-size:14px; font-weight:600; cursor:pointer;';

  userBtn.style.cssText = role === 'user' ? activeStyle : inactiveStyle;
  partnerBtn.style.cssText = role === 'partner' ? activeStyle : inactiveStyle;

  roleLabel.textContent = role === 'partner' ? 'Partner' : 'User';
}

// ===== FAQ accordion =====
function toggleFaq(buttonEl) {
  const item = buttonEl.closest('.faq-item');
  const answer = item.querySelector('.faq-answer');
  const sign = item.querySelector('.faq-sign');
  const isOpen = answer.style.display === 'block';

  // Close all other FAQ items
  document.querySelectorAll('.faq-item').forEach((el) => {
    el.querySelector('.faq-answer').style.display = 'none';
    el.querySelector('.faq-sign').textContent = '+';
  });

  if (!isOpen) {
    answer.style.display = 'block';
    sign.textContent = '\u2212'; // minus sign
  }
}

// ===== Waitlist form submission =====
async function submitWaitlist(event) {
  event.preventDefault();

  const emailInput = document.getElementById('waitlist-email');
  const submitBtn = document.getElementById('waitlist-submit-btn');
  const errorBox = document.getElementById('waitlist-error');
  const formWrap = document.getElementById('waitlist-form-wrap');
  const successBox = document.getElementById('waitlist-success');
  const successMsg = document.getElementById('waitlist-success-msg');

  const email = emailInput.value.trim();
  if (!email) return false;

  errorBox.style.display = 'none';
  submitBtn.disabled = true;
  submitBtn.textContent = 'Joining…';

  const payload = {
    email: email,
    tag: currentRole === 'partner' ? 'Partner' : 'User',
  };

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error('Backend responded ' + res.status);

    formWrap.style.display = 'none';
    successBox.style.display = 'inline-flex';
    successMsg.textContent = "You're on the list as a " +
      (currentRole === 'partner' ? 'Partner' : 'User') + ". We'll be in touch.";
  } catch (err) {
    errorBox.style.display = 'inline-flex';
    errorBox.textContent = 'Could not reach the server (' +
      (err && err.message ? err.message : 'no connection') +
      '). Connect a backend and try again.';
    submitBtn.disabled = false;
    submitBtn.textContent = 'Join the waitlist';
  }

  return false;
}
