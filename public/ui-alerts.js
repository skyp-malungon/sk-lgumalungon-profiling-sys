// ===============================================================
// SK YOUTH MANAGEMENT SYSTEM - SWEETALERT2 NOTIFICATIONS
// Standard SweetAlert2 Dialogs, Confirms, Toasts & Loaders
// ===============================================================

(function (global) {
  function escapeAlertHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Native SweetAlert2 Alert
  function uiAlert({ type = 'info', title = '', text = '', html = '', confirmText = 'OK' } = {}) {
    if (typeof Swal === 'undefined') {
      alert(title ? `${title}\n${text}` : text);
      return Promise.resolve();
    }
    const safeIcon = (type === 'danger') ? 'error' : type;
    const confirmColor = (safeIcon === 'error') ? '#dc2626' : '#2563eb';

    const opts = {
      icon: safeIcon,
      title: title || undefined,
      confirmButtonText: confirmText || 'OK',
      confirmButtonColor: confirmColor
    };

    if (html) {
      opts.html = html;
    } else if (text) {
      opts.text = text;
    }

    return Swal.fire(opts);
  }

  // Native SweetAlert2 Confirmation Dialog
  function uiConfirm({
    type = 'question',
    title = 'Are you sure?',
    text = '',
    html = '',
    confirmText = 'Yes, Confirm',
    cancelText = 'Cancel',
    danger = false
  } = {}) {
    if (typeof Swal === 'undefined') {
      const ok = confirm(title ? `${title}\n${text}` : text);
      return Promise.resolve({ isConfirmed: ok });
    }

    const safeIcon = danger ? 'warning' : ((type === 'danger') ? 'error' : type);
    const confirmColor = danger ? '#dc2626' : (safeIcon === 'success' ? '#059669' : '#2563eb');

    const opts = {
      icon: safeIcon,
      title: title || undefined,
      showCancelButton: true,
      confirmButtonText: confirmText || 'Yes',
      cancelButtonText: cancelText || 'Cancel',
      confirmButtonColor: confirmColor,
      cancelButtonColor: '#64748b'
    };

    if (html) {
      opts.html = html;
    } else if (text) {
      opts.text = text;
    }

    return Swal.fire(opts);
  }

  // Native SweetAlert2 Spinner / Loader
  function uiLoading(title = 'Processing...', subtitle = 'Please wait a moment') {
    if (typeof Swal === 'undefined') return Promise.resolve();
    return Swal.fire({
      title: title || 'Loading...',
      text: subtitle || undefined,
      allowOutsideClick: false,
      allowEscapeKey: false,
      showConfirmButton: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });
  }

  // Close Active SweetAlert2 Modal
  function uiClose() {
    if (typeof Swal !== 'undefined') {
      Swal.close();
    }
  }

  // Native SweetAlert2 Top-Right Toast
  const ToastMixin = typeof Swal !== 'undefined'
    ? Swal.mixin({
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3500,
        timerProgressBar: true,
        didOpen: (toast) => {
          toast.addEventListener('mouseenter', Swal.stopTimer);
          toast.addEventListener('mouseleave', Swal.resumeTimer);
        }
      })
    : null;

  function uiToast(type = 'info', title = '', message = '', timer = 3500) {
    if (!ToastMixin) return Promise.resolve();
    const safeIcon = (type === 'danger') ? 'error' : type;

    return ToastMixin.fire({
      icon: safeIcon,
      title: title || message,
      text: title ? (message || undefined) : undefined,
      timer: timer || 3500
    });
  }

  function getSwalBaseConfig(overrides = {}) {
    return {
      focusConfirm: true,
      confirmButtonColor: '#2563eb',
      cancelButtonColor: '#64748b',
      ...overrides
    };
  }

  global.uiToast = uiToast;
  global.uiAlert = uiAlert;
  global.uiConfirm = uiConfirm;
  global.uiLoading = uiLoading;
  global.uiClose = uiClose;
  global.getSwalBaseConfig = getSwalBaseConfig;

  // ===============================================================
  // SHARED LIGHT / DARK THEME CONTROLLER
  // ===============================================================
  function getActiveTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function syncThemeToggleUI(theme) {
    const active = theme || getActiveTheme();
    const btn = document.getElementById('themeToggleBtn');
    if (!btn) return;
    const icon = btn.querySelector('i');
    const label = btn.querySelector('.theme-toggle-label');
    if (active === 'dark') {
      if (icon) icon.className = 'bi bi-sun-fill';
      if (label) label.textContent = 'Light';
      btn.setAttribute('aria-label', 'Switch to light mode');
      btn.setAttribute('title', 'Switch to light mode');
    } else {
      if (icon) icon.className = 'bi bi-moon-stars-fill';
      if (label) label.textContent = 'Dark';
      btn.setAttribute('aria-label', 'Switch to dark mode');
      btn.setAttribute('title', 'Switch to dark mode');
    }
  }

  function applyTheme(theme) {
    const next = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    document.documentElement.setAttribute('data-bs-theme', next);
    try {
      localStorage.setItem('sk_theme', next);
    } catch (e) {}
    syncThemeToggleUI(next);
    window.dispatchEvent(new CustomEvent('sk-theme-changed', { detail: { theme: next } }));
  }

  function toggleTheme() {
    applyTheme(getActiveTheme() === 'dark' ? 'light' : 'dark');
  }

  document.addEventListener('DOMContentLoaded', () => syncThemeToggleUI());

  global.getActiveTheme = getActiveTheme;
  global.applyTheme = applyTheme;
  global.toggleTheme = toggleTheme;
  global.syncThemeToggleUI = syncThemeToggleUI;
})(window);
