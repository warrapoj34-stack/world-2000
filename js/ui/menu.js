export function showVersion(version) {
  const label = document.querySelector('#version');
  label.textContent = `v${version}`;
  label.setAttribute('aria-label', `เวอร์ชัน ${version}`);
}

export function showOfflineStatus(message) {
  document.querySelector('#connection-status').textContent = message;
}
