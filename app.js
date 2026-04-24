
function show(id) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const sec = document.getElementById('sec-' + id);
  if (sec) sec.classList.add('active');
  event.currentTarget.classList.add('active');
  document.getElementById('main').scrollTo({ top: 0, behavior: 'smooth' });
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (window.innerWidth < 900) {
    document.getElementById('sidebar').classList.remove('open');
  }
}

function switchTab(group, pane) {
  document.querySelectorAll(`#risk-${pane}, #risk-impl, #risk-licence, #risk-ongoing`).forEach(p => {
    p.classList.remove('active');
  });
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  const el = document.getElementById(group + '-' + pane);
  if (el) el.classList.add('active');
  event.currentTarget.classList.add('active');
}

function toggleMenu() {
  document.getElementById('sidebar').classList.toggle('open');
}

// Animate score bars on scorecard load
function animateBars() {
  document.querySelectorAll('.bar-fill').forEach(bar => {
    const w = bar.style.width;
    bar.style.width = '0';
    setTimeout(() => { bar.style.width = w; }, 100);
  });
}

// Re-animate when scorecard is shown
const originalShow = window.show;
window.show = function(id) {
  originalShow && originalShow.call(this, id);
  if (id === 'scorecard') setTimeout(animateBars, 200);
};
