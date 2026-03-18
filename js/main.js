/* ═══════════════════════════════════════════
   PACEM DEUS — main.js
═══════════════════════════════════════════ */

// ── YEAR TABS ─────────────────────────────────
function showYear(year) {
  document.querySelectorAll('.year-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.year-panel').forEach(p => p.classList.remove('active'));
  document.querySelector('.year-tab[data-year="' + year + '"]').classList.add('active');
  document.getElementById('year-' + year).classList.add('active');
}

// ── HAMBURGER MENU ────────────────────────────
const hamburger = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobile-menu');

hamburger.addEventListener('click', () => {
  hamburger.classList.toggle('open');
  mobileMenu.classList.toggle('open');
  document.body.style.overflow = mobileMenu.classList.contains('open') ? 'hidden' : '';
});

document.getElementById('mobile-menu-close').addEventListener('click', () => {
  hamburger.classList.remove('open');
  mobileMenu.classList.remove('open');
  document.body.style.overflow = '';
});

// Close mobile menu on nav link click
document.querySelectorAll('.mobile-menu a').forEach(a => {
  a.addEventListener('click', () => {
    hamburger.classList.remove('open');
    mobileMenu.classList.remove('open');
    document.body.style.overflow = '';
  });
});

// ── CANCIONERO MODAL ──────────────────────────
const modal = document.getElementById('cancionero-modal');
const modalIframe = document.getElementById('modal-iframe');
const modalTitle = document.getElementById('modal-title');

function openCancionero(url, title) {
  const isMobile = window.innerWidth < 768;
  if (isMobile) {
    // Mobile: open in new tab
    window.open(url, '_blank');
  } else {
    // Desktop: iframe modal
    modalTitle.textContent = title;
    modalIframe.src = url;
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
}

function closeModal() {
  modal.classList.remove('open');
  modalIframe.src = '';
  document.body.style.overflow = '';
}

// Close modal on backdrop click
modal.addEventListener('click', (e) => {
  if (e.target === modal) closeModal();
});

// Close on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modal.classList.contains('open')) closeModal();
});

// ── STICKY NAV STYLE ON SCROLL ────────────────
const nav = document.querySelector('.site-nav');
window.addEventListener('scroll', () => {
  if (window.scrollY > 60) {
    nav.style.boxShadow = '0 4px 30px rgba(42,26,8,0.18)';
  } else {
    nav.style.boxShadow = '0 2px 20px rgba(42,26,8,0.1)';
  }
}, { passive: true });

// ── SCROLL REVEAL ─────────────────────────────
const revealEls = document.querySelectorAll('.event-card, .about-placeholder');
const observer = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.style.opacity = '1';
      e.target.style.transform = 'translateY(0)';
      observer.unobserve(e.target);
    }
  });
}, { threshold: 0.1 });

revealEls.forEach(el => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(20px)';
  el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
  observer.observe(el);
});
