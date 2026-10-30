const form = document.getElementById('login-form');
const errEl = document.getElementById('error');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errEl.classList.add('hidden');
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
      credentials: 'same-origin',
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Login failed');
    window.location.href = '/';
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
});
