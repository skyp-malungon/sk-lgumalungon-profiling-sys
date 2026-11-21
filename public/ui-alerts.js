// ===============================================================
// SK YOUTH MANAGEMENT SYSTEM - MODERN ALERT & TOAST SYSTEM
// Shared across login.html and index.html (Light & Dark Theme Ready)
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

  const TYPE_META = {
    success: { icon: 'bi-check-circle-fill', label: 'Success' },
    error: { icon: 'bi-x-octagon-fill', label: 'Error' },
    warning: { icon: 'bi-exclamation-triangle-fill', label: 'Warning' },
    info: { icon: 'bi-info-circle-fill', label: 'Notice' },
    question: { icon: 'bi-question-circle-fill', label: 'Confirm' }
  };

  function getBadgeHtml(type) {
    const meta = TYPE_META[type] || TYPE_META.info;
    const safeType = TYPE_META[type] ? type : 'info';
    return `<div class="sk-swal-badge is-${safeType}" aria-hidden="true"><i class="bi ${meta.icon}"></i></div>`;
  }

  function buildBodyHtml(type, text, html, includeBadge = true) {
    const content = html
      ? html
      : (text ? `<p class="sk-swal-message mb-0">${escapeAlertHtml(text)}</p>` : '');
    if (!includeBadge) return content;
    return `${getBadgeHtml(type)}<div class="sk-swal-body-wrap">${content}</div>`;
  }

  function getSwalBaseConfig(overrides = {}) {
    const baseClasses = {
      container: 'sk-swal-container',
      popup: 'sk-swal-popup',
      title: 'sk-swal-title',
      htmlContainer: 'sk-swal-html',
      actions: 'sk-swal-actions',
      confirmButton: 'sk-swal-btn sk-swal-btn-primary',
      cancelButton: 'sk-swal-btn sk-swal-btn-ghost',
      denyButton: 'sk-swal-btn sk-swal-btn-ghost',
      closeButton: 'sk-swal-close',
      validationMessage: 'sk-swal-validation'
    };

    return {
      buttonsStyling: false,
      reverseButtons: true,
      focusConfirm: true,
      showClass: { popup: 'sk-swal-in' },
      hideClass: { popup: 'sk-swal-out' },
      ...overrides,
      customClass: {
        ...baseClasses,
        ...(overrides.customClass || {})
      }
    };
  }

  const ToastMixin = typeof Swal !== 'undefined'
    ? Swal.mixin({
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        showCloseButton: true,
        timer: 3800,
        timerProgressBar: true,
        buttonsStyling: false,
        showClass: { popup: 'sk-toast-in' },
        hideClass: { popup: 'sk-toast-out' },
        customClass: {
          container: 'sk-toast-container',
          popup: 'sk-swal-toast',
          title: 'sk-toast-title',
          htmlContainer: 'sk-toast-html',
          closeButton: 'sk-toast-close',
          timerProgressBar: 'sk-toast-progress'
        },
        didOpen: (toast) => {
          toast.addEventListener('mouseenter', Swal.stopTimer);
          toast.addEventListener('mouseleave', Swal.resumeTimer);
        }
      })
    : null;

  function uiToast(type = 'info', title = '', message = '', timer = 3800) {
    if (!ToastMixin) return Promise.resolve();
    const safeType = TYPE_META[type] ? type : 'info';
    const meta = TYPE_META[safeType];
    return ToastMixin.fire({
      timer,
      customClass: {
        container: 'sk-toast-container',
        popup: `sk-swal-toast is-${safeType}`,
        title: 'sk-toast-title',
        htmlContainer: 'sk-toast-html',
        closeButton: 'sk-toast-close',
        timerProgressBar: 'sk-toast-progress'
      },
      html: `
        <div class="sk-toast-inner">
          <span class="sk-toast-icon is-${safeType}" aria-hidden="true">
            <i class="bi ${meta.icon}"></i>
          </span>
          <div class="sk-toast-copy">
            <div class="sk-toast-heading">${escapeAlertHtml(title)}</div>
            ${message ? `<div class="sk-toast-sub">${escapeAlertHtml(message)}</div>` : ''}
          </div>
        </div>
      `
    });
  }

  function uiAlert({ type = 'info', title = '', text = '', html = '', confirmText = 'Okay' } = {}) {
    if (typeof Swal === 'undefined') return Promise.resolve();
    const safeType = TYPE_META[type] ? type : 'info';
    const btnClass = safeType === 'error'
      ? 'sk-swal-btn sk-swal-btn-danger'
      : 'sk-swal-btn sk-swal-btn-primary';

    return Swal.fire(getSwalBaseConfig({
      title: title,
      html: buildBodyHtml(safeType, text, html, true),
      confirmButtonText: confirmText,
      customClass: {
        popup: `sk-swal-popup is-${safeType}`,
        confirmButton: btnClass
      }
    }));
  }

  function uiConfirm({
    type = 'question',
    title = 'Are you sure?',
    text = '',
    html = '',
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    danger = false
  } = {}) {
    if (typeof Swal === 'undefined') return Promise.resolve({ isConfirmed: false });
    const safeType = danger ? 'warning' : (TYPE_META[type] ? type : 'question');
    const confirmClass = danger
      ? 'sk-swal-btn sk-swal-btn-danger'
      : (safeType === 'success' ? 'sk-swal-btn sk-swal-btn-success' : 'sk-swal-btn sk-swal-btn-primary');

    return Swal.fire(getSwalBaseConfig({
      title: title,
      html: buildBodyHtml(safeType, text, html, true),
      showCancelButton: true,
      confirmButtonText: confirmText,
      cancelButtonText: cancelText,
      customClass: {
        popup: `sk-swal-popup is-${safeType}`,
        confirmButton: confirmClass,
        cancelButton: 'sk-swal-btn sk-swal-btn-ghost'
      }
    }));
  }

  function uiLoading(title = 'Processing...', subtitle = 'Please wait a moment') {
    if (typeof Swal === 'undefined') return Promise.resolve();
    return Swal.fire(getSwalBaseConfig({
      allowOutsideClick: false,
      allowEscapeKey: false,
      showConfirmButton: false,
      customClass: {
        popup: 'sk-swal-popup sk-swal-loading-popup'
      },
      html: `
        <div class="sk-loading-wrap" role="status" aria-live="polite">
          <div class="sk-loading-spinner" aria-hidden="true"></div>
          <div class="sk-loading-title">${escapeAlertHtml(title)}</div>
          ${subtitle ? `<div class="sk-loading-sub">${escapeAlertHtml(subtitle)}</div>` : ''}
        </div>
      `
    }));
  }

  function uiClose() {
    if (typeof Swal !== 'undefined') {
      Swal.close();
    }
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
