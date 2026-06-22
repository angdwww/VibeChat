export function mainMenuItems() {
  return [
    { value: 'sessions', label: 'Sessions', detail: 'browse and resume saved work' },
    { value: 'usage', label: 'Usage', detail: 'dashboard and subscription counters' },
    { value: 'history', label: 'History', detail: 'read current session activity' },
    { value: 'compact', label: 'Compact', detail: 'copy a handoff summary' },
    { value: 'limits', label: 'Limits', detail: 'configure usage caps' },
    { value: 'github', label: 'GitHub', detail: 'repo status and workflow help' },
    { value: 'trust', label: 'Trust', detail: 'read-only, edit, or shell mode' },
    { value: 'watch', label: 'Watch', detail: 'rerun a command after requests' },
    { value: 'help', label: 'Help', detail: 'show commands' },
    { value: 'cancel', label: 'Cancel', detail: 'return to prompt' }
  ];
}

export function renderTuiDashboard({
  cwd,
  session,
  usageLine,
  warnings = [],
  trustMode = 'shell',
  favorite = false,
  watchCommand = ''
}) {
  return [
    '',
    'VibeChat TUI',
    '============',
    `Usage: ${usageLine}`,
    warnings.length ? `Warnings: ${warnings.join(' | ')}` : 'Warnings: none',
    `cwd: ${cwd}`,
    `Session: ${session.id} (${session.entries.length} requests)`,
    `Trust: ${trustMode}`,
    `Favorite: ${favorite ? 'yes' : 'no'}`,
    `Watch: ${watchCommand || 'off'}`,
    '',
    'Actions',
    '-------',
    ...mainMenuItems().map((item) => `- ${item.label}: ${item.detail}`),
    ''
  ].join('\n');
}
