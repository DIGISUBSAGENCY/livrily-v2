// Parsing léger du user_agent brut (auth.sessions.user_agent) en label
// lisible "Navigateur • OS" — pas de dépendance externe (ua-parser-js et
// équivalents ne sont pas installés dans ce projet) pour un besoin aussi
// simple. L'ORDRE des tests compte : Edge/Opera contiennent "Chrome" dans
// leur UA, Chrome contient "Safari" — les moteurs doivent être testés du
// plus spécifique au plus générique.
function detectBrowser(ua: string): string {
  if (/Edg\//.test(ua)) return 'Edge'
  if (/OPR\//.test(ua) || /Opera/.test(ua)) return 'Opera'
  if (/Chrome\//.test(ua)) return 'Chrome'
  if (/Firefox\//.test(ua)) return 'Firefox'
  if (/Safari\//.test(ua)) return 'Safari'
  return 'Navigateur inconnu'
}

function detectOs(ua: string): string {
  if (/iPhone|iPad|iPod/.test(ua)) return 'iOS'
  if (/Android/.test(ua)) return 'Android'
  if (/Mac OS X/.test(ua)) return 'macOS'
  if (/Windows/.test(ua)) return 'Windows'
  if (/CrOS/.test(ua)) return 'ChromeOS'
  if (/Linux/.test(ua)) return 'Linux'
  return 'OS inconnu'
}

export function parseUserAgentLabel(userAgent: string | null): string {
  if (!userAgent) return 'Appareil inconnu'
  return `${detectBrowser(userAgent)} • ${detectOs(userAgent)}`
}
